import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';

import { BOOKING_SERVICE, NOTIFICATION_SERVICE, envs } from '../config';

const clients = ClientsModule.register([
  {
    name: BOOKING_SERVICE,
    transport: Transport.RMQ,
    options: {
      urls: [envs.rabbitmqUrl],
      queue: envs.bookingQueue,
      queueOptions: { durable: true },
    },
  },
  {
    name: NOTIFICATION_SERVICE,
    transport: Transport.RMQ,
    options: {
      urls: [envs.rabbitmqUrl],
      queue: envs.notificationQueue,
      queueOptions: { durable: true },
    },
  },
]);

@Module({
  imports: [clients],
  exports: [clients],
})
export class RabbitMQModule {}
