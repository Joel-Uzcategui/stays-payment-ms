import Stripe from 'stripe';

import { PaymentStatus, Prisma } from '../generated/prisma/client';

export const ACTIVE_STATUSES: PaymentStatus[] = [
  'pending',
  'requires_action',
  'succeeded',
];

export const toPaymentStatus = (
  status: Stripe.PaymentIntent.Status,
): PaymentStatus => {
  switch (status) {
    case 'succeeded':
      return 'succeeded';
    case 'requires_action':
      return 'requires_action';
    case 'canceled':
      return 'cancelled';
    default:
      return 'pending';
  }
};

export const isDuplicateKey = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === 'P2002';
