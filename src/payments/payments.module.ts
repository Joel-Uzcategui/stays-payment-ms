import { Module } from '@nestjs/common';

import { OutboxModule } from '../outbox/outbox.module';
import { RabbitMQModule } from '../transports/rabbitmq.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { ReconciliationService } from './reconciliation.service';
import { stripeProvider } from './stripe.provider';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

@Module({
  imports: [RabbitMQModule, OutboxModule],
  controllers: [PaymentsController, WebhooksController],
  providers: [
    PaymentsService,
    WebhooksService,
    ReconciliationService,
    stripeProvider,
  ],
})
export class PaymentsModule {}
