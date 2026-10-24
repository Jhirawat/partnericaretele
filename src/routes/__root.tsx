import { PublicNotFound, PublicError } from "@/components/PublicStates";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { I18nProvider } from "@/i18n";
import { Toaster } from "@/components/ui/sonner";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  staticData: { sitemap: false },
  head: ({ matches }) => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "THAIKANYA PartnerCare" },
      {
        name: "description",
        content:
          "Partner accounts, memberships, CareCredits and consultation entitlement for global telemedicine.",
      },
      { name: "author", content: "THAIKANYA" },
      // Fail-closed: every page is noindex unless its own head() opts in (client-only private routes never render a head on the server).
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "THAIKANYA PartnerCare" },
      {
        property: "og:description",
        content:
          "Partner accounts, memberships, CareCredits and consultation entitlement for global telemedicine.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { property: "og:site_name", content: "iCareTele" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      ...(matches.some(match => ['/golive-evidence-matrix', '/final-review-handoff', '/archive-integrity-snapshot', '/owner-signoff-readiness'].includes(String(match.routeId))) ? [] : [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" as const },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700&family=Sora:wght@600&family=Noto+Sans+Thai:wght@400;600&family=Noto+Sans+Arabic:wght@400;600&display=swap",
      },
      ]),
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: PublicNotFound,
  errorComponent: PublicError,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      if (event === "SIGNED_OUT") { void queryClient.cancelQueries(); queryClient.clear(); }
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => data.subscription.unsubscribe();
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <PaymentTestModeBanner />
        <Outlet />
        <Toaster position="top-center" />
      </I18nProvider>
    </QueryClientProvider>
  );
}
