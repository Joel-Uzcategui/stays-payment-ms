import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';

import { AppModule } from './app.module';
import { envs } from './config';

async function bootstrap() {
  const logger = new Logger('PaymentMS');

  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );

  app.connectMicroservice<MicroserviceOptions>(
    {
      transport: Transport.RMQ,
      options: {
        urls: [envs.rabbitmqUrl],
        queue: envs.rabbitmqQueue,
        queueOptions: { durable: true },
      },
    },
    { inheritAppConfig: false },
  );

  await app.startAllMicroservices();
  await app.listen(envs.port);

  logger.log(`Payment microservice listening on queue "${envs.rabbitmqQueue}"`);
  logger.log(`HTTP server listening on port ${envs.port}`);
}

void bootstrap();
