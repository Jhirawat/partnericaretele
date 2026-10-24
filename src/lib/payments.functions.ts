import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { type StripeEnv, createStripeClient, getStripeErrorMessage } from '@/lib/stripe.server';

type CheckoutSessionResult = { clientSecret: string } | { error: string };

// Look up an existing Customer by userId metadata (then by email), or
// create one. userId on the Customer makes later reads resolvable.
async function resolveOrCreateCustomer(
  stripe: ReturnType<typeof createStripeClient>,
  options: { email?: string | undefined; userId?: string | undefined },
): Promise<string> {
  if (options.userId && !/^[a-zA-Z0-9_-]+$/.test(options.userId)) {
    throw new Error('Invalid userId');
  }
  if (options.userId) {
    const found = await stripe.customers.search({
      query: `metadata['userId']:'${options.userId}'`,
      limit: 1,
    });
    const match = found.data[0];
    if (match) return match.id;
  }
  if (options.email) {
    const existing = await stripe.customers.list({ email: options.email, limit: 1 });
    const customer = existing.data[0];
    if (customer) {
      if (options.userId && customer.metadata?.['userId'] !== options.userId) {
        await stripe.customers.update(customer.id, {
          metadata: { ...customer.metadata, userId: options.userId },
        });
      }
      return customer.id;
    }
  }
  const created = await stripe.customers.create({
    ...(options.email && { email: options.email }),
    ...(options.userId && { metadata: { userId: options.userId } }),
  });
  return created.id;
}

const checkoutInput = z.object({
  priceId: z.string().regex(/^[a-zA-Z0-9_-]+$/),
  kind: z.enum(['credit_pack', 'membership', 'consultation']),
  partnerId: z.string().uuid().optional(),
  patientId: z.string().uuid().optional(),
  returnUrl: z.string().min(1),
  environment: z.enum(['sandbox', 'live']),
});

export const createCheckoutSession = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => checkoutInput.parse(input))
  .handler(async ({ data, context }): Promise<CheckoutSessionResult> => {
    try {
      const { userId, supabase } = context;
      if (process.env["CARE_REVIEW_ALLOW_LEGACY_CHECKOUT"] !== "true") throw new Error("Legacy new checkout disabled in the review build. Use the reviewed care payment workflow; no automatic annual renewal is created.");
      const { data: userData } = await supabase.auth.getUser();
      const email = userData.user?.email ?? undefined;
      const stripe = createStripeClient(data.environment as StripeEnv);

      const prices = await stripe.prices.list({ lookup_keys: [data.priceId] });
      const stripePrice = prices.data[0];
      if (!stripePrice) throw new Error('Price not found');
      const isRecurring = stripePrice.type === 'recurring';

      const customerId = await resolveOrCreateCustomer(stripe, { email, userId });

      let productDescription: string | undefined;
      if (!isRecurring) {
        const productId = typeof stripePrice.product === 'string'
          ? stripePrice.product
          : stripePrice.product.id;
        const product = await stripe.products.retrieve(productId);
        productDescription = product.name;
      }

      const metadata: Record<string, string> = {
        userId,
        kind: data.kind,
        priceId: data.priceId,
        ...(data.partnerId && { partnerId: data.partnerId }),
        ...(data.patientId && { patientId: data.patientId }),
      };

      const session = await stripe.checkout.sessions.create({
        line_items: [{ price: stripePrice.id, quantity: 1 }],
        mode: isRecurring ? 'subscription' : 'payment',
        ui_mode: 'embedded_page',
        return_url: data.returnUrl,
        customer: customerId,
        // Seller is Thailand-based: Stripe calculates and collects tax at
        // checkout; the seller handles registration, filing and remittance.
        automatic_tax: { enabled: true },
        ...(!isRecurring && productDescription && { payment_intent_data: { description: productDescription } }),
        metadata: { ...metadata, managed_payments: 'false' },
        ...(isRecurring && { subscription_data: { metadata } }),
      });

      return { clientSecret: session.client_secret ?? '' };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });
