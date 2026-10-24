// Public, indexable page content: one search intent per route, internal links and non-clinical FAQ.
// Only facts already enforced by the product. No medical claims, reviews, prices, certifications or analytics.
import { canonical } from "./seo";
export type Bi = { th: string; en: string };
export interface FaqItem { q: Bi; a: Bi }
export interface PublicPage { path: "/" | "/partner-apply" | "/care-demo"; intent: Bi; h1: Bi; sections: Bi[]; related: { to: PublicPage["path"]; label: Bi }[]; faq: FaqItem[] }

export const PUBLIC_PAGES: Record<PublicPage["path"], PublicPage> = {
  "/": {
    path: "/", intent: { th: "ระบบเทเลเมดิซีนสำหรับพาร์ทเนอร์คลินิก", en: "Partner telemedicine platform" },
    h1: { th: "ดูแลต่อเนื่อง จัดการชัดเจน ในพื้นที่เดียว", en: "Continuous care, clear operations, one workspace" },
    sections: [{ th: "จากรับข้อมูล สู่การติดตาม", en: "From intake to follow-up" }, { th: "คำถามที่พบบ่อย", en: "Frequently asked questions" }],
    related: [
      { to: "/partner-apply", label: { th: "สมัครเป็นพาร์ทเนอร์องค์กร", en: "Apply as a partner organization" } },
      { to: "/care-demo", label: { th: "ทดลองเดโมด้วยข้อมูลจำลอง", en: "Try the synthetic-data demo" } },
    ],
    faq: [
      { q: { th: "iCareTele คืออะไร", en: "What is iCareTele?" }, a: { th: "ระบบงานสำหรับองค์กรพาร์ทเนอร์ของ Thaikanya Clinic ใช้รับข้อมูลผู้รับบริการ จัดคิวปรึกษา และติดตามผล", en: "A workspace for Thaikanya Clinic partner organizations to take customer intake, queue consultations and follow up." } },
      { q: { th: "ผู้รับบริการต้องสมัครบัญชีหรือไม่", en: "Do customers need an account?" }, a: { th: "ไม่ต้อง องค์กรพาร์ทเนอร์เป็นผู้บันทึกข้อมูลผู้รับบริการ", en: "No. The partner organization records customer details on their behalf." } },
      { q: { th: "เครดิตถูกตัดเมื่อใด", en: "When is a consultation credit used?" }, a: { th: "การรับข้อมูลไม่ตัดเครดิต เครดิตถูกกันเมื่อรับเข้าคิว และใช้หนึ่งครั้งเมื่อการปรึกษาเสร็จสิ้น หากยกเลิกก่อนจะคืนสิทธิ", en: "Intake never uses credit. Credit is reserved when the request is accepted, used once on completion, and released if cancelled first." } },
    ],
  },
  "/partner-apply": {
    path: "/partner-apply", intent: { th: "สมัครเป็นพาร์ทเนอร์", en: "Partner application" },
    h1: { th: "สมัครเป็นพาร์ทเนอร์", en: "Apply to become a partner" },
    sections: [{ th: "ขั้นตอนการสมัคร", en: "How applying works" }, { th: "คำถามที่พบบ่อย", en: "Frequently asked questions" }],
    related: [
      { to: "/", label: { th: "ภาพรวมระบบ iCareTele", en: "iCareTele overview" } },
      { to: "/care-demo", label: { th: "ดูเดโมก่อนสมัคร", en: "See the demo before applying" } },
    ],
    faq: [
      { q: { th: "องค์กรประเภทใดสมัครได้", en: "Which organizations can apply?" }, a: { th: "สถานพยาบาลหรือคลินิก สถานประกอบการเพื่อสุขภาพนวดไทย และสถานบริการกัญชาทางการแพทย์", en: "Medical facilities or clinics, Thai massage health establishments and medical-cannabis services." } },
      { q: { th: "ต้องใช้เอกสารอะไร", en: "What documents are needed?" }, a: { th: "ใบอนุญาตหลักที่ตรงกับประเภทองค์กร ผู้ดูแลระบบจะตรวจสอบและอาจขอเอกสารเพิ่ม", en: "The primary license for your organization type. An administrator reviews it and may ask for more documents." } },
      { q: { th: "หากใบสมัครไม่ผ่าน ทำอย่างไร", en: "What if my application is not approved?" }, a: { th: "คุณจะเห็นเหตุผล และสามารถแก้ไขแล้วส่งใหม่ได้", en: "You will see the reason and can correct and resubmit." } },
    ],
  },
  "/care-demo": {
    path: "/care-demo", intent: { th: "เดโมจำลองแบบโต้ตอบ", en: "Interactive synthetic demo" },
    h1: { th: "เดโมระบบด้วยข้อมูลจำลอง", en: "Synthetic-data workspace demo" },
    sections: [],
    related: [
      { to: "/", label: { th: "ภาพรวมระบบ iCareTele", en: "iCareTele overview" } },
      { to: "/partner-apply", label: { th: "สมัครเป็นพาร์ทเนอร์องค์กร", en: "Apply as a partner organization" } },
    ],
    faq: [],
  },
};
export function faqLd(items: FaqItem[]) {
  return { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: items.flatMap((f) => (["th", "en"] as const).map((k) => ({ "@type": "Question", inLanguage: k, name: f.q[k], acceptedAnswer: { "@type": "Answer", text: f.a[k] } }))) };
}
export const pageUrl = (p: PublicPage["path"]) => canonical(p);
