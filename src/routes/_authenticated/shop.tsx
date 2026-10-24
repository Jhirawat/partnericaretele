import { createFileRoute, redirect } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { CreditCard, Coins, Stethoscope, BadgeCheck } from 'lucide-react';


import { useStripeCheckout } from '@/hooks/useStripeCheckout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';

export const Route = createFileRoute('/_authenticated/shop')({staticData:{sitemap:false},
  beforeLoad: () => { throw redirect({ to: '/care' }); },
  head: () => ({
    meta: [{name:'robots',content:'noindex, nofollow'},
      { title: 'Shop — THAIKANYA iCareTele' },
      { name: 'description', content: 'Buy CareCredit packs, consultations and memberships online.' },
      { property: 'og:title', content: 'Shop — THAIKANYA iCareTele' },
      { property: 'og:description', content: 'Buy CareCredit packs, consultations and memberships online.' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
    ],
  }),
  component: ShopPage,
});

const CREDIT_PACKS = [
  { priceId: 'carecredit_pack_40k_thb', credits: '40,000', price: '฿40,000' },
  { priceId: 'carecredit_pack_100k_thb', credits: '100,000', price: '฿100,000' },
  { priceId: 'carecredit_pack_200k_thb', credits: '200,000', price: '฿200,000' },
  { priceId: 'carecredit_pack_400k_thb', credits: '400,000', price: '฿400,000' },
];

function ShopPage() {
  const { openCheckout, checkoutElement, isOpen } = useStripeCheckout();

  const { data: context } = useQuery({
    queryKey: ['shop-context'],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return { partnerId: undefined as string | undefined, patientId: undefined as string | undefined };
      const { data: patient } = await supabase
        .from('patients')
        .select('id, partner_id')
        .eq('auth_user_id', userId)
        .maybeSingle();
      let partnerId = patient?.partner_id as string | undefined;
      if (!partnerId) {
        const { data: roleRow } = await supabase
          .from('user_roles')
          .select('partner_id')
          .eq('user_id', userId)
          .not('partner_id', 'is', null)
          .limit(1)
          .maybeSingle();
        partnerId = (roleRow?.partner_id ?? undefined) as string | undefined;
      }
      return { partnerId, patientId: patient?.id as string | undefined };
    },
  });

  return (
    <>
      <div className="space-y-8 p-6">
        <div>
          <h1 className="font-display text-2xl font-semibold">Shop</h1>
          <p className="text-sm text-muted-foreground">
            Pay securely online. Card, PromptPay and local payment methods are supported.
          </p>
        </div>

        {isOpen && checkoutElement ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <CreditCard className="size-5" /> Secure checkout
              </CardTitle>
            </CardHeader>
            <CardContent>{checkoutElement}</CardContent>
          </Card>
        ) : (
          <>
            <section className="space-y-3">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <Coins className="size-5 text-primary" /> CareCredit packs
              </h2>
              <p className="text-sm text-muted-foreground">
                1 credit = ฿1. Credits are deducted per consultation. Paid orders appear in Credits for staff approval before the balance is applied.
              </p>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {CREDIT_PACKS.map((pack) => (
                  <Card key={pack.priceId}>
                    <CardHeader>
                      <CardTitle className="text-lg">{pack.credits} credits</CardTitle>
                      <CardDescription>{pack.price}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Button
                        className="w-full"
                        disabled={!context?.partnerId}
                        onClick={() =>
                          openCheckout({
                            priceId: pack.priceId,
                            kind: 'credit_pack',
                            partnerId: context?.partnerId,
                            returnUrl: `${window.location.origin}/credits`,
                          })
                        }
                      >
                        Buy pack
                      </Button>
                      {!context?.partnerId && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Credit packs are for partner accounts.
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>

            <section className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Stethoscope className="size-5 text-primary" /> Telemedicine consultation
                  </CardTitle>
                  <CardDescription>One online consultation with a licensed doctor — ฿500</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    className="w-full"
                    disabled={!context?.patientId}
                    onClick={() =>
                      openCheckout({
                        priceId: 'consultation_single_thb',
                        kind: 'consultation',
                        patientId: context?.patientId,
                        returnUrl: `${window.location.origin}/portal`,
                      })
                    }
                  >
                    Pay ฿500
                  </Button>
                  {!context?.patientId && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Link your patient record in the Portal first.
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <BadgeCheck className="size-5 text-primary" /> Annual Care Membership
                  </CardTitle>
                  <CardDescription>
                    12 months, 4 included consultations — ฿3,900/year. Activates instantly; cancelling stops the membership immediately.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    className="w-full"
                    disabled={!context?.patientId}
                    onClick={() =>
                      openCheckout({
                        priceId: 'annual_care_membership_thb',
                        kind: 'membership',
                        patientId: context?.patientId,
                        returnUrl: `${window.location.origin}/portal`,
                      })
                    }
                  >
                    Subscribe — ฿3,900/year
                  </Button>
                  {!context?.patientId && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Link your patient record in the Portal first.
                    </p>
                  )}
                </CardContent>
              </Card>
            </section>
          </>
        )}
      </div>
    </>
  );
}
