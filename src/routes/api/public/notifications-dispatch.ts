import { createFileRoute } from "@tanstack/react-router";

import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/** Drains the patient notification queue. Scheduled/cron caller only. */
export const Route = createFileRoute("/api/public/notifications-dispatch")({staticData:{sitemap:false},
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { dispatchQueuedNotifications } = await import("@/lib/notifications.server");
        const result = await dispatchQueuedNotifications(supabaseAdmin);
        return Response.json(result);
      },
    },
  },
});
