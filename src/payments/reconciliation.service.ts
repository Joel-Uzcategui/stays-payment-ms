import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import Stripe from 'stripe';

import { STRIPE_CLIENT, envs } from '../config';
import { PrismaService } from '../prisma/prisma.service';
import { WebhooksService } from './webhooks.service';

const EVENT_TYPES = [
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'payment_intent.requires_action',
  'charge.succeeded',
];

const OVERLAP_SECONDS = 300;
const COLD_START_HOURS = 24;
const EVENT_LIMIT = 300;
const CANCEL_BATCH = 50;

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly webhooks: WebhooksService,
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe,
  ) {}

  @Cron('0 */2 * * * *')
  async reconcile() {
    await this.replayMissedEvents();
    await this.cancelAbandoned();
  }

  private async replayMissedEvents() {
    const since = await this.cursor();

    let events: Stripe.Event[];

    try {
      events = await this.stripe.events
        .list({
          types: EVENT_TYPES,
          created: { gte: since },
          limit: 100,
        })
        .autoPagingToArray({ limit: EVENT_LIMIT });
    } catch (error) {
      this.logger.error(`Could not list Stripe events: ${String(error)}`);

      return;
    }

    let recovered = 0;

    for (const event of events.reverse()) {
      const result = await this.process(event);

      if (result) {
        recovered += 1;
      }
    }

    if (recovered > 0) {
      this.logger.warn(`Recovered ${recovered} events Stripe never delivered`);
    }
  }

  private async process(event: Stripe.Event) {
    try {
      const result = await this.webhooks.process(event);

      return !result.duplicate;
    } catch (error) {
      this.logger.error(`Could not replay ${event.id}: ${String(error)}`);

      return false;
    }
  }

  private async cursor() {
    const last = await this.prisma.stripeEvent.aggregate({
      _max: { createdAt: true },
    });

    const from =
      last._max.createdAt ??
      new Date(Date.now() - COLD_START_HOURS * 3_600_000);

    return Math.floor(from.getTime() / 1000) - OVERLAP_SECONDS;
  }

  private async cancelAbandoned() {
    const abandoned = new Date(Date.now() - envs.abandonAfterMinutes * 60_000);
    const unauthenticated = new Date(
      Date.now() - envs.authenticationWindowMinutes * 60_000,
    );

    const stale = await this.prisma.payment.findMany({
      where: {
        stripePaymentIntentId: { not: null },
        OR: [
          { status: 'pending', createdAt: { lt: abandoned } },
          { status: 'requires_action', updatedAt: { lt: unauthenticated } },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: CANCEL_BATCH,
    });

    let cancelled = 0;

    for (const payment of stale) {
      const intentId = payment.stripePaymentIntentId;

      if (!intentId) {
        continue;
      }

      try {
        await this.stripe.paymentIntents.cancel(intentId);
      } catch (error) {
        this.logger.warn(
          `Could not cancel ${intentId}: ${error instanceof Error ? error.message : String(error)}`,
        );

        continue;
      }

      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'cancelled',
          failureReason:
            payment.status === 'requires_action'
              ? 'authentication abandoned'
              : 'abandoned',
        },
      });

      cancelled += 1;
    }

    if (cancelled > 0) {
      this.logger.log(`Cancelled ${cancelled} abandoned payment intents`);
    }
  }
}
