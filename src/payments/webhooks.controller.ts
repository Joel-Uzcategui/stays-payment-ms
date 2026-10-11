import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';

import { WebhooksService } from './webhooks.service';

@Controller('payments')
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  handle(
    @Req() request: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    return this.webhooks.handle(request.rawBody, signature);
  }
}
