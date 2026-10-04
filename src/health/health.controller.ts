import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check() {
    return {
      service: 'stays-payment-ms',
      status: 'ok',
      version: process.env.SERVICE_VERSION ?? 'dev',
      release: process.env.RELEASE_VERSION ?? 'dev',
      timestamp: new Date().toISOString(),
    };
  }
}
