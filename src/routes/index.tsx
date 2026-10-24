import {pageHead,organizationLd,websiteLd} from "@/lib/seo";
import { createFileRoute } from "@tanstack/react-router";
import { PartnerLanding } from "@/components/PartnerLanding";
import { PUBLIC_PAGES, faqLd } from "@/lib/public-content";
export const Route = createFileRoute("/")({
  staticData: { sitemap: true },
  head: () => pageHead({ path: "/", index: true, thTitle: "เทเลเมดิซีนสำหรับพาร์ทเนอร์", title: "Partner telemedicine by Thaikanya Clinic", thDescription: "เครดิตปรึกษาของพาร์ทเนอร์ Annual Care และการติดตามผลผู้รับบริการ", description: "Partner consultation credits, Annual Care and customer follow-up.", jsonLd: [organizationLd, websiteLd, faqLd(PUBLIC_PAGES["/"].faq)] }),
  component: PartnerLanding,
});
