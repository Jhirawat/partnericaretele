import { useState } from "react";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { useServerFn } from "@tanstack/react-start";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";
import { createCareCheckout } from "@/lib/care-checkout.functions";
import { Button } from "./ui/button";

export function CareEmbeddedCheckout({ paymentId, onClose }: { paymentId: string; onClose: () => void }) {
  const create = useServerFn(createCareCheckout);
  const [setup, setSetup] = useState<string | null>(null);
  const fetchClientSecret = async () => {
    const r = await create({ data: { id: paymentId, origin: window.location.origin } });
    if ("error" in r) {
      if (r.setupRequired) setSetup(r.error);
      throw new Error(r.error);
    }
    if (r.environment !== getStripeEnvironment()) {
      const msg = "Payment setup required: this site's card form and server payment mode do not match.";
      setSetup(msg);
      throw new Error(msg);
    }
    if (!r.clientSecret) throw new Error("Stripe did not return a client secret");
    return r.clientSecret;
  };
  return (
    <div className="surface p-4" id="care-checkout">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Credits are added only after Stripe confirms the payment.
        </p>
        <Button size="sm" variant="outline" onClick={onClose}>Close</Button>
      </div>
      {setup ? (
        <p role="alert" className="text-sm text-destructive">Setup required: {setup}</p>
      ) : (
        <EmbeddedCheckoutProvider key={paymentId} stripe={getStripe()} options={{ fetchClientSecret }}>
          <EmbeddedCheckout />
        </EmbeddedCheckoutProvider>
      )}
    </div>
  );
}
