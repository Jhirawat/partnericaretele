import { createFileRoute } from "@tanstack/react-router";
import { SiteSettings } from "@/components/SiteSettings";
import { requireStaffRoute } from "@/lib/staff-route-guard";
export const Route = createFileRoute("/_authenticated/site-settings")({
  beforeLoad: () => requireStaffRoute("super"),
  staticData: { sitemap: false },
  head: () => ({ meta: [
    { title: "Site Settings — iCareTele" },
    { name: "description", content: "Private Superadmin site identity and workspace theme settings." },
    { property: "og:title", content: "Site Settings — iCareTele" },
    { property: "og:description", content: "Private site branding and isolated Admin and Doctor workspace themes." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex, nofollow" },
  ] }),
  component: SiteSettings,
});