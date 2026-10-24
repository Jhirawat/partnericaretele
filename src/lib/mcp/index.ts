import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listPatientsTool from "./tools/list-patients";
import listConsultationsTool from "./tools/list-consultations";

const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "partnericaretele-p-drna",
  title: "partnericaretele(P)(DrNa)",
  version: "0.1.0",
  instructions:
    "Tools for THAIKANYA iCareTele PartnerCare. Acts as the signed-in user; only records that user may see are returned. Use `list_patients` to find patients and `list_consultations` to review telemedicine consultations.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listPatientsTool, listConsultationsTool],
});
