import { z } from "zod";

export const siteContentSchema = z.object({
  heroTitle: z.string().trim().max(120),
  heroBody: z.string().trim().max(500),
  about: z.string().trim().max(2000),
  services: z.string().trim().max(2000),
  faq: z.string().trim().max(2000),
  footer: z.string().trim().max(300),
}).strict();
export type SiteContent = z.infer<typeof siteContentSchema>;
export const DEFAULT_SITE_CONTENT: SiteContent = { heroTitle: "Continuous care. Clear operations. One workspace.", heroBody: "Coordinate consultations and manage care operations in one workspace.", about: "", services: "", faq: "", footer: "iCareTele — by Thaikanya Clinic" };
export function safeSiteContent(value: unknown): SiteContent { const parsed = siteContentSchema.safeParse(value); return parsed.success ? parsed.data : DEFAULT_SITE_CONTENT; }
