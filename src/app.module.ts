import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

import { HealthController } from './health/health.controller';
import { PaymentsModule } from './payments/payments.module';
import { PrismaModule } from './prisma/prisma.module';
import { RabbitMQModule } from './transports/rabbitmq.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    RabbitMQModule,
    PaymentsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
