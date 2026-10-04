import { Module } from '@nestjs/common';

import { HealthController } from './health/health.controller';
import { RabbitMQModule } from './transports/rabbitmq.module';

@Module({
  imports: [RabbitMQModule],
  controllers: [HealthController],
})
export class AppModule {}
