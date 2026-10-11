import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import Stripe from 'stripe';

import { STRIPE_CLIENT, envs } from '../config';
import { OutboxService } from '../outbox/outbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { isDuplicateKey } from './payment-status';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe,
  ) {}

  async handle(rawBody: Buffer | undefined, signature: string | undefined) {
    return this.process(this.verify(rawBody, signature));
  }

  async process(event: Stripe.Event) {
    try {
      switch (event.type) {
        case 'payment_intent.succeeded':
          await this.onSucceeded(event, event.data.object);
          break;
        case 'payment_intent.payment_failed':
          await this.onFailed(event, event.data.object);
          break;
        case 'charge.succeeded':
          await this.onCharge(event, event.data.object);
          break;
        default:
          await this.remember(event);
          this.logger.log(`Ignored ${event.type}`);
      }
    } catch (error) {
      if (!isDuplicateKey(error)) {
        throw error;
      }

      this.logger.log(`Event ${event.id} was already processed`);

      return { received: true, duplicate: true };
    }

    return { received: true };
  }

  private verify(rawBody: Buffer | undefined, signature: string | undefined) {
    if (!rawBody || !signature) {
      throw new BadRequestException(
        'Missing raw body or stripe-signature header',
      );
    }

    try {
      return this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        envs.stripeWebhookSecret,
      );
    } catch (error) {
      throw new BadRequestException(
        `Invalid signature: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async onSucceeded(event: Stripe.Event, intent: Stripe.PaymentIntent) {
    const payment = await this.find(event, intent.id);

    if (!payment) {
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.stripeEvent.create({ data: this.eventRow(event) });

      const updated = await tx.payment.update({
        where: { id: payment.id },
        data: { status: 'succeeded', failureReason: null },
      });

      await this.outbox.enqueue(tx, updated.id, 'payment.succeeded', {
        paymentId: updated.id,
        bookingId: updated.bookingId,
        userId: updated.userId,
        amountCents: updated.amountCents,
        currency: updated.currency,
      });
    });

    this.logger.log(
      `Payment ${payment.id} succeeded for booking ${payment.bookingId}`,
    );
  }

  private async onFailed(event: Stripe.Event, intent: Stripe.PaymentIntent) {
    const payment = await this.find(event, intent.id);

    if (!payment) {
      return;
    }

    const reason = intent.last_payment_error?.message ?? 'Payment failed';

    await this.prisma.$transaction(async (tx) => {
      await tx.stripeEvent.create({ data: this.eventRow(event) });

      await tx.payment.update({
        where: { id: payment.id },
        data: { failureReason: reason },
      });
    });

    this.logger.warn(`Payment ${payment.id} failed: ${reason}`);
  }

  private async onCharge(event: Stripe.Event, charge: Stripe.Charge) {
    const intentId =
      typeof charge.payment_intent === 'string'
        ? charge.payment_intent
        : charge.payment_intent?.id;

    if (!intentId) {
      await this.remember(event);

      return;
    }

    const payment = await this.find(event, intentId);

    if (!payment) {
      return;
    }

    const card = charge.payment_method_details?.card;

    await this.prisma.$transaction(async (tx) => {
      await tx.stripeEvent.create({ data: this.eventRow(event) });

      await tx.payment.update({
        where: { id: payment.id },
        data: {
          cardBrand: card?.brand ?? null,
          cardLast4: card?.last4 ?? null,
          receiptUrl: charge.receipt_url,
        },
      });
    });
  }

  private async find(event: Stripe.Event, intentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { stripePaymentIntentId: intentId },
    });

    if (!payment) {
      this.logger.warn(`No payment for intent ${intentId}, skipping event`);
      await this.remember(event);
    }

    return payment;
  }

  private remember(event: Stripe.Event) {
    return this.prisma.stripeEvent.create({ data: this.eventRow(event) });
  }

  private eventRow(event: Stripe.Event) {
    return {
      id: event.id,
      type: event.type,
      createdAt: new Date(event.created * 1000),
    };
  }
}
