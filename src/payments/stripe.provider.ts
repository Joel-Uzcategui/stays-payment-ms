import { Provider } from '@nestjs/common';
import Stripe from 'stripe';

import { STRIPE_CLIENT, envs } from '../config';

export const stripeProvider: Provider = {
  provide: STRIPE_CLIENT,
  useFactory: () => new Stripe(envs.stripeSecretKey),
};
