import { createFileRoute } from '@tanstack/react-router';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { verifyWebhook, type StripeEnv } from '@/lib/stripe.server';
import { applyCareStripeEvent } from '@/lib/care-payments.server';

const PACK_CREDITS: Record<string, { credits: number; packageCode: string }> = {
  carecredit_pack_40k_thb: { credits: 40000, packageCode: 'PACK_40K' },
  carecredit_pack_100k_thb: { credits: 100000, packageCode: 'PACK_100K' },
  carecredit_pack_200k_thb: { credits: 200000, packageCode: 'PACK_200K' },
  carecredit_pack_400k_thb: { credits: 400000, packageCode: 'PACK_400K' },
};

function adminClient() {
  return createClient<Database>(
    process.env['SUPABASE_URL']!,
    process.env['SUPABASE_SERVICE_ROLE_KEY']!,
    { auth: { persistSession: false } },
  );
}

async function queueConfirmation(
  admin: ReturnType<typeof adminClient>,
  opts: { patientId?: string; partnerId?: string; destination?: string | null; payload: Record<string, unknown> },
) {
  await admin.from('notification_deliveries').insert({
    channel: 'EMAIL',
    template: 'payment_confirmation',
    status: 'QUEUED',
    patient_id: opts.patientId ?? null,
    partner_id: opts.partnerId ?? null,
    destination: opts.destination ?? null,
    payload: opts.payload as Database['public']['Tables']['notification_deliveries']['Insert']['payload'] & object,
  });
}

async function handleCheckoutCompleted(admin: ReturnType<typeof adminClient>, session: any) {
  if (session.payment_status === 'unpaid') return;
  const meta = session.metadata ?? {};
  const kind = meta.kind as string | undefined;
  const userId = meta.userId as string | undefined;
  const priceId = meta.priceId as string | undefined;
  const partnerId = meta.partnerId as string | undefined;
  const patientId = meta.patientId as string | undefined;
  const email = session.customer_details?.email ?? null;
  const amountBaht = (session.amount_total ?? 0) / 100;

  if (kind === 'credit_pack' && partnerId && priceId && PACK_CREDITS[priceId]) {
    const pack = PACK_CREDITS[priceId];
    // Paid online, but credits are only applied once staff approve the order.
    await admin.from('credit_orders').insert({
      partner_id: partnerId,
      package_code: pack.packageCode,
      credits: pack.credits,
      amount: amountBaht,
      currency: 'THB',
      status: 'PAID',
      payment_method: 'CARD',
      payment_reference: session.id,
      notes: 'Online card payment via Stripe checkout',
    });
    await queueConfirmation(admin, {
      partnerId,
      destination: email,
      payload: { kind, credits: pack.credits, amount: amountBaht, currency: 'THB', reference: session.id },
    });
  } else if (kind === 'membership' && patientId) {
    const { data: plan } = await admin
      .from('membership_plans')
      .select('id, duration_months')
      .eq('code', 'TK_ANNUAL_CARE')
      .maybeSingle();
    if (plan) {
      const starts = new Date();
      const expires = new Date(starts);
      expires.setMonth(expires.getMonth() + (plan.duration_months ?? 12));
      // Activate instantly on successful payment.
      await admin.from('memberships').insert({
        patient_id: patientId,
        plan_id: plan.id,
        status: 'ACTIVE',
        payment_status: 'PAID',
        starts_at: starts.toISOString(),
        expires_at: expires.toISOString(),
        payment_reference: typeof session.subscription === 'string' ? session.subscription : session.id,
      });
      await queueConfirmation(admin, {
        patientId,
        destination: email,
        payload: { kind, plan: 'TK_ANNUAL_CARE', amount: amountBaht, currency: 'THB', reference: session.id },
      });
    }
  } else if (kind === 'consultation' && patientId) {
    const { data: patient } = await admin
      .from('patients')
      .select('partner_id')
      .eq('id', patientId)
      .maybeSingle();
    if (patient?.partner_id) {
      await admin.from('payment_transactions').insert({
        partner_id: patient.partner_id,
        patient_id: patientId,
        amount: amountBaht || 500,
        currency: 'THB',
        channel: 'ONLINE',
        provider: 'stripe',
        provider_reference: typeof session.payment_intent === 'string' ? session.payment_intent : null,
        reference: `STRIPE-${session.id}`,
        status: 'PAID',
        captured_at: new Date().toISOString(),
        metadata: { kind, priceId, session_id: session.id },
      });
      await queueConfirmation(admin, {
        patientId,
        partnerId: patient.partner_id,
        destination: email,
        payload: { kind, amount: amountBaht, currency: 'THB', reference: session.id },
      });
    }
  }

  await admin.from('audit_log').insert({
    actor_user_id: userId ?? null,
    action: 'PAYMENT_COMPLETED',
    entity_type: 'checkout_session',
    entity_id: session.id,
    metadata: { kind, priceId, amount: amountBaht, currency: 'THB' },
  });
}

async function syncSubscription(admin: ReturnType<typeof adminClient>, sub: any, environment: string) {
  const userId = sub.metadata?.userId;
  if (!userId) return;
  const status = sub.status === 'active' || sub.status === 'trialing' ? 'active' : sub.status;
  const row = {
    user_id: userId,
    stripe_subscription_id: sub.id,
    stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id,
    product_id: typeof sub.items?.data?.[0]?.price?.product === 'string' ? sub.items.data[0].price.product : '',
    price_id: sub.items?.data?.[0]?.price?.id ?? '',
    status,
    current_period_start: sub.current_period_start ? new Date(sub.current_period_start * 1000).toISOString() : null,
    current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
    cancel_at_period_end: !!sub.cancel_at_period_end,
    environment,
  };
  await admin.from('subscriptions').upsert(row, { onConflict: 'stripe_subscription_id' });

  // Renewal: keep the member's access in step with the paid subscription
  // period. Memberships created at checkout store the Stripe subscription id
  // in payment_reference, so extend their expiry to the new period end.
  if ((sub.status === 'active' || sub.status === 'trialing') && row.current_period_end) {
    await admin
      .from('memberships')
      .update({
        status: 'ACTIVE',
        expires_at: row.current_period_end,
        updated_at: new Date().toISOString(),
      })
      .eq('payment_reference', sub.id)
      .in('status', ['ACTIVE', 'EXPIRED']);
  }
}

async function handleSubscriptionDeleted(admin: ReturnType<typeof adminClient>, sub: any) {
  await admin
    .from('subscriptions')
    .update({ status: 'canceled', updated_at: new Date().toISOString() })
    .eq('stripe_subscription_id', sub.id);

  // Membership stops immediately on cancellation.
  const userId = sub.metadata?.userId;
  if (userId) {
    const { data: patient } = await admin
      .from('patients')
      .select('id')
      .eq('auth_user_id', userId)
      .maybeSingle();
    if (patient) {
      await admin
        .from('memberships')
        .update({ status: 'CANCELLED', updated_at: new Date().toISOString() })
        .eq('patient_id', patient.id)
        .eq('status', 'ACTIVE')
        .eq('payment_reference', sub.id);
    }
  }
}

export const Route = createFileRoute('/api/public/payments/webhook')({staticData:{sitemap:false},
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawEnv = new URL(request.url).searchParams.get('env');
        if (rawEnv !== 'sandbox' && rawEnv !== 'live') return Response.json({ received: true, ignored: 'invalid env' });
        const env: StripeEnv = rawEnv;
        let event;
        try {
          event = await verifyWebhook(request, env);
        } catch (err: any) {
          console.error('Webhook verification failed:', err.message);
          return new Response(`Webhook Error: ${err.message}`, { status: 400 });
        }

        const admin = adminClient();
        try {
          if (await applyCareStripeEvent(event as any, env, request.headers.get('x-forwarded-host') ?? new URL(request.url).host)) return Response.json({ received: true });
          // Test-mode events never post credits, memberships or payments to the shared database.
          if (env === 'sandbox') { console.log('Sandbox event acknowledged without settlement:', event.type); return Response.json({ received: true, sandbox: true }); }
          switch (event.type) {
            case 'checkout.session.completed':
              await handleCheckoutCompleted(admin, event.data.object);
              break;
            case 'customer.subscription.created':
            case 'customer.subscription.updated':
              await syncSubscription(admin, event.data.object, env);
              break;
            case 'customer.subscription.deleted':
              await handleSubscriptionDeleted(admin, event.data.object);
              break;
          }
        } catch (err) {
          console.error('Webhook handler error:', err);
          return new Response('Webhook handler failed', { status: 500 });
        }

        return new Response(JSON.stringify({ received: true }), { status: 200 });
      },
    },
  },
});
