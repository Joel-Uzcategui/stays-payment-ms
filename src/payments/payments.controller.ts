import { Controller, UsePipes } from '@nestjs/common';
import { EventPattern, MessagePattern, Payload } from '@nestjs/microservices';

import { rpcValidationPipe } from '../common/rpc-validation.pipe';
import { CreatePaymentIntentDto } from './dto';
import { PaymentsService } from './payments.service';
import type { RefundRequestedEvent } from './refund-requested';

@Controller()
@UsePipes(rpcValidationPipe())
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @MessagePattern('payment.intent.create')
  createIntent(@Payload() dto: CreatePaymentIntentDto) {
    return this.paymentsService.createIntent(dto);
  }

  @MessagePattern('payment.findOne')
  findOne(@Payload() payload: { id: string; userId: string }) {
    return this.paymentsService.findOne(payload.id, payload.userId);
  }

  @MessagePattern('payment.findByBooking')
  findByBooking(@Payload() payload: { bookingId: string; userId: string }) {
    return this.paymentsService.findByBooking(
      payload.bookingId,
      payload.userId,
    );
  }

  @EventPattern('payment.refund.requested')
  refund(@Payload() event: RefundRequestedEvent) {
    return this.paymentsService.refund(event);
  }
}
