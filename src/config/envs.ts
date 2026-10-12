import 'dotenv/config';
import * as joi from 'joi';

interface EnvVars {
  PORT: number;
  DATABASE_URL: string;
  RABBITMQ_URL: string;
  RABBITMQ_QUEUE: string;
  BOOKING_QUEUE: string;
  NOTIFICATION_QUEUE: string;
  ABANDON_AFTER_MINUTES: number;
  AUTHENTICATION_WINDOW_MINUTES: number;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
}

const envsSchema = joi
  .object({
    PORT: joi.number().integer().default(3003),
    DATABASE_URL: joi.string().required(),
    RABBITMQ_URL: joi.string().required(),
    RABBITMQ_QUEUE: joi.string().required(),
    BOOKING_QUEUE: joi.string().required(),
    NOTIFICATION_QUEUE: joi.string().default('notification_queue'),
    ABANDON_AFTER_MINUTES: joi.number().integer().min(1).default(30),
    AUTHENTICATION_WINDOW_MINUTES: joi.number().integer().min(1).default(60),
    STRIPE_SECRET_KEY: joi.string().required(),
    STRIPE_WEBHOOK_SECRET: joi.string().required(),
  })
  .unknown(true);

const result = envsSchema.validate(process.env) as {
  error?: joi.ValidationError;
  value: EnvVars;
};

if (result.error) {
  throw new Error(`Config validation error: ${result.error.message}`);
}

const envVars = result.value;

export const envs = {
  port: envVars.PORT,
  databaseUrl: envVars.DATABASE_URL,
  rabbitmqUrl: envVars.RABBITMQ_URL,
  rabbitmqQueue: envVars.RABBITMQ_QUEUE,
  bookingQueue: envVars.BOOKING_QUEUE,
  notificationQueue: envVars.NOTIFICATION_QUEUE,
  abandonAfterMinutes: envVars.ABANDON_AFTER_MINUTES,
  authenticationWindowMinutes: envVars.AUTHENTICATION_WINDOW_MINUTES,
  stripeSecretKey: envVars.STRIPE_SECRET_KEY,
  stripeWebhookSecret: envVars.STRIPE_WEBHOOK_SECRET,
};
