import { randomUUID } from 'node:crypto';
import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import Stripe from 'stripe';

import { BOOKING_SERVICE, STRIPE_CLIENT } from '../config';
import { Payment } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BookingView } from './booking-view';
import { CreatePaymentIntentDto } from './dto';
import type { RefundRequestedEvent } from './refund-requested';
import {
  ACTIVE_STATUSES,
  isDuplicateKey,
  toPaymentStatus,
} from './payment-status';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(BOOKING_SERVICE) private readonly bookingClient: ClientProxy,
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe,
  ) {}

  async createIntent(dto: CreatePaymentIntentDto) {
    const booking = await this.fetchBooking(dto.bookingId, dto.userId);

    this.assertPayable(booking);

    const active = await this.prisma.payment.findFirst({
      where: { bookingId: booking.bookingId, status: { in: ACTIVE_STATUSES } },
    });

    if (active) {
      return this.withIntent(active, booking);
    }

    try {
      const created = await this.prisma.payment.create({
        data: {
          bookingId: booking.bookingId,
          userId: dto.userId,
          amountCents: booking.totalCents,
          currency: booking.currency,
          status: 'pending',
          idempotencyKey: dto.idempotencyKey ?? randomUUID(),
        },
      });

      return this.withIntent(created, booking);
    } catch (error) {
      if (!isDuplicateKey(error)) {
        throw error;
      }

      const existing = await this.prisma.payment.findFirst({
        where: {
          bookingId: booking.bookingId,
          OR: [
            { status: { in: ACTIVE_STATUSES } },
            ...(dto.idempotencyKey
              ? [{ idempotencyKey: dto.idempotencyKey }]
              : []),
          ],
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!existing) {
        throw error;
      }

      return this.withIntent(existing, booking);
    }
  }

  async findOne(paymentId: string, userId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });

    if (!payment || payment.userId !== userId) {
      throw new RpcException({
        status: HttpStatus.NOT_FOUND,
        message: `Payment ${paymentId} not found`,
      });
    }

    return this.present(payment);
  }

  async refund(event: RefundRequestedEvent) {
    const payment = event.paymentId
      ? await this.prisma.payment.findUnique({ where: { id: event.paymentId } })
      : await this.prisma.payment.findFirst({
          where: { bookingId: event.bookingId, status: 'succeeded' },
        });

    if (!payment || !payment.stripePaymentIntentId) {
      this.logger.error(`No refundable payment for booking ${event.bookingId}`);

      return;
    }

    if (payment.status !== 'succeeded') {
      this.logger.warn(
        `Payment ${payment.id} is ${payment.status}, nothing to refund`,
      );

      return;
    }

    const intentId = payment.stripePaymentIntentId;

    await this.onStripe('refund', () =>
      this.stripe.refunds.create(
        {
          payment_intent: intentId,
          metadata: { bookingId: payment.bookingId, reason: event.reason },
        },
        { idempotencyKey: `refund:${payment.id}` },
      ),
    );

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'refunded', failureReason: event.reason },
    });

    this.logger.warn(
      `Refunded ${payment.amountCents} ${payment.currency} for booking ${payment.bookingId}: ${event.reason}`,
    );
  }

  async findByBooking(bookingId: string, userId: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { bookingId, userId },
      orderBy: { createdAt: 'desc' },
    });

    return { payment: payment ? this.present(payment) : null };
  }

  private async withIntent(payment: Payment, booking: BookingView) {
    const intentId = payment.stripePaymentIntentId;

    if (intentId) {
      const intent = await this.onStripe('retrieve', () =>
        this.stripe.paymentIntents.retrieve(intentId),
      );

      return this.present(payment, intent.client_secret);
    }

    const intent = await this.onStripe('create', () =>
      this.stripe.paymentIntents.create(
        {
          amount: payment.amountCents,
          currency: payment.currency.toLowerCase(),
          automatic_payment_methods: {
            enabled: true,
            allow_redirects: 'never',
          },
          metadata: {
            paymentId: payment.id,
            bookingId: booking.bookingId,
            userId: payment.userId,
          },
        },
        { idempotencyKey: payment.id },
      ),
    );

    const stored = await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        stripePaymentIntentId: intent.id,
        status: toPaymentStatus(intent.status),
      },
    });

    this.logger.log(`Created ${intent.id} for booking ${payment.bookingId}`);

    return this.present(stored, intent.client_secret);
  }

  private async onStripe<T>(action: string, call: () => Promise<T>) {
    try {
      return await call();
    } catch (error) {
      if (!(error instanceof Stripe.errors.StripeError)) {
        throw error;
      }

      this.logger.error(
        `Stripe ${action} failed: ${error.type}: ${error.message}`,
      );

      if (error instanceof Stripe.errors.StripeCardError) {
        throw new RpcException({
          status: HttpStatus.PAYMENT_REQUIRED,
          message: error.message,
        });
      }

      throw new RpcException({
        status: HttpStatus.BAD_GATEWAY,
        message: 'The payment provider could not process the request',
      });
    }
  }

  private async fetchBooking(id: string, userId: string) {
    try {
      return await firstValueFrom(
        this.bookingClient.send<BookingView>('booking.hold.extend', {
          id,
          userId,
        }),
      );
    } catch (error) {
      if (this.isRpcError(error)) {
        throw new RpcException(error);
      }

      this.logger.error(
        `booking.hold.extend failed for ${id}: ${String(error)}`,
      );

      throw new RpcException({
        status: HttpStatus.SERVICE_UNAVAILABLE,
        message: 'Booking service is unavailable',
      });
    }
  }

  private assertPayable(booking: BookingView) {
    if (booking.status !== 'held') {
      throw new RpcException({
        status: HttpStatus.CONFLICT,
        message: `Booking ${booking.bookingId} is ${booking.status} and cannot be paid`,
      });
    }

    if (booking.expiresAt && new Date(booking.expiresAt) <= new Date()) {
      throw new RpcException({
        status: HttpStatus.CONFLICT,
        message: `The hold on booking ${booking.bookingId} has expired`,
      });
    }
  }

  private isRpcError(
    error: unknown,
  ): error is { status: number; message: string } {
    return (
      typeof error === 'object' &&
      error !== null &&
      'status' in error &&
      'message' in error
    );
  }

  private present(payment: Payment, clientSecret?: string | null) {
    return {
      paymentId: payment.id,
      bookingId: payment.bookingId,
      status: payment.status,
      amountCents: payment.amountCents,
      currency: payment.currency,
      cardBrand: payment.cardBrand,
      cardLast4: payment.cardLast4,
      receiptUrl: payment.receiptUrl,
      failureReason: payment.failureReason,
      ...(clientSecret ? { clientSecret } : {}),
    };
  }
}
