import { EmbeddedCheckoutProvider, EmbeddedCheckout } from '@stripe/react-stripe-js';
import { getStripe, getStripeEnvironment } from '@/lib/stripe';
import { createCheckoutSession } from '@/lib/payments.functions';

interface StripeEmbeddedCheckoutProps {
  priceId: string;
  kind: 'credit_pack' | 'membership' | 'consultation';
  partnerId?: string | undefined;
  patientId?: string | undefined;
  returnUrl?: string;
}

export function StripeEmbeddedCheckout({
  priceId,
  kind,
  partnerId,
  patientId,
  returnUrl,
}: StripeEmbeddedCheckoutProps) {
  const fetchClientSecret = async (): Promise<string> => {
    const result = await createCheckoutSession({
      data: {
        priceId,
        kind,
        partnerId,
        patientId,
        returnUrl: returnUrl || window.location.href,
        environment: getStripeEnvironment(),
      },
    });
    if ('error' in result) throw new Error(result.error);
    if (!result.clientSecret) throw new Error('Stripe did not return a client secret');
    return result.clientSecret;
  };

  const checkoutOptions = { fetchClientSecret };

  return (
    <div id="checkout">
      <EmbeddedCheckoutProvider stripe={getStripe()} options={checkoutOptions}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}
