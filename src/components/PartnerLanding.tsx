import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CalendarCheck,
  Wallet,
  HeartPulse,
  ClipboardList,
  ShieldCheck,
} from "lucide-react";
import { useCopy } from "@/i18n";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { BrandIdentity, LicenseEvidence } from "./BrandIdentity";
import { usePartnerCopy } from "@/lib/partner-onboarding.copy";
import { PublicFaq, RelatedLinks } from "./PublicContent";
export function PartnerLanding() {
  const { c } = useCopy();
  const l = usePartnerCopy();
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-6">
        <Link to="/">
          <BrandIdentity />
        </Link>
        <div className="flex items-center gap-3">
          <LanguageSwitcher className="h-11 w-28" />
          <Button asChild variant="ghost" className="min-h-11"><Link to="/partner-apply">{l("apply")}</Link></Button>
          <Button asChild variant="outline" className="min-h-11">
            <Link to="/auth">{c("เข้าสู่ระบบ", "Sign in")}</Link>
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 pb-16">
        <section className="grid items-center gap-10 py-12 md:grid-cols-2 md:py-20">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.18em] text-primary">
              {c("ดูแลผู้ป่วย • จัดการพาร์ทเนอร์", "Patient care • Partner operations")}
            </p>
            <h1 className="mt-5 font-display text-4xl font-semibold leading-tight md:text-5xl">
              {c(
                "ดูแลต่อเนื่อง จัดการชัดเจน ในพื้นที่เดียว",
                "Continuous care. Clear operations. One workspace.",
              )}
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
              {c(
                "จัดคิวปรึกษาแพทย์ ติดตามสิทธิ Annual Care และดูเครดิตของทุกสาขาได้จากบัญชีองค์กรเดียว",
                "Coordinate consultations, follow Annual Care entitlements and manage one organisation credit wallet across your branches.",
              )}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to="/care-demo">
                  {c("ลองระบบด้วยข้อมูลจำลอง", "Explore the demo")}
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/auth" search={{ next: "/care" }}>
                  {c("เข้าสู่พื้นที่พาร์ทเนอร์", "Partner workspace")}
                </Link>
              </Button>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              {c(
                "ข้อมูลตัวอย่าง ไม่มีการชำระเงินจริงหรือบริการแพทย์จริง",
                "Synthetic preview. No real payments or clinical services.",
              )}
            </p>
          </div>
          <div className="surface overflow-hidden">
            <div className="brand-gradient p-6 text-primary-foreground">
              <div className="flex justify-between text-sm">
                <span>iCareTele</span>
                <span>{c("ตัวอย่างพาร์ทเนอร์", "Partner preview")}</span>
              </div>
              <h2 className="mt-8 text-2xl font-semibold">
                {c("วันนี้พร้อมดูแล", "Ready for the day")}
              </h2>
              <p className="mt-2 text-sm opacity-80">
                {c(
                  "เครดิตและสิทธิผู้ป่วยแยกกันชัดเจน",
                  "Consultation credits and patient entitlements stay distinct",
                )}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4 p-6">
              {[
                [Wallet, c("เครดิตพร้อมใช้", "Available credits"), "42"],
                [CalendarCheck, c("กันไว้ในคิว", "Reserved"), "2"],
                [HeartPulse, c("ผู้ป่วย Annual Care", "Annual patients"), "3"],
                [ClipboardList, c("สิทธิที่ยังไม่ได้ใช้", "Unused assessments"), "29"],
              ].map(([Icon, label, value]) => {
                const I = Icon as typeof Wallet;
                return (
                  <div key={String(label)} className="rounded-xl bg-secondary p-4">
                    <I className="size-4 text-primary" />
                    <p className="mt-4 text-2xl font-semibold">{String(value)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{String(label)}</p>
                  </div>
                );
              })}
              <p className="col-span-2 text-xs text-muted-foreground">
                {c("เดโม — ยังไม่ได้เชื่อมต่อระบบคลินิก", "Demo — clinical integration not connected")}
              </p>
            </div>
          </div>
        </section>
        <section className="grid gap-5 md:grid-cols-3">
          {[
            [
              Wallet,
              c("เครดิตปรึกษาแพทย์", "Consultation credits"),
              c("50 เครดิต / 20,000 บาท", "50 credits / THB 20,000"),
              c(
                "1 เครดิตต่อการปรึกษาที่เสร็จสมบูรณ์ ไม่มีค่าสมาชิกรายเดือน",
                "One credit per completed consultation. No monthly subscription.",
              ),
            ],
            [
              HeartPulse,
              "Annual Care",
              c("6,000 บาท / สูงสุด 12 ครั้ง", "THB 6,000 / up to 12 assessments"),
              c(
                "สิทธิ 12 เดือน ไม่ต่ออายุหรือเรียกเก็บเงินอัตโนมัติ",
                "Twelve calendar months. No automatic renewal charge.",
              ),
            ],
            [
              ShieldCheck,
              c("แพทย์ประเมินทุกครั้ง", "Clinical assessment every time"),
              c("แพทย์ประเมินและวางแผนดูแลทุกครั้ง", "A doctor assesses and plans care every time"),
              c(
                "สิทธิแต่ละครั้งครอบคลุมการประเมินโดยแพทย์ แผนการดูแล และการติดตามผล",
                "Each entitlement covers a doctor's assessment, a care plan and follow-up.",
              ),
            ],
          ].map(([Icon, title, price, body]) => {
            const I = Icon as typeof Wallet;
            return (
              <article key={String(title)} className="surface p-6">
                <I className="size-5 text-primary" />
                <h2 className="mt-4 font-semibold">{String(title)}</h2>
                <p className="mt-3 text-lg font-semibold">{String(price)}</p>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{String(body)}</p>
              </article>
            );
          })}
        </section>
        <p className="my-5 text-sm text-muted-foreground" role="status">
          {c(
            "ราคาเสนอเพื่อทบทวน ยังไม่เปิดขาย • วันหมดอายุเครดิต ภาษี การคืนเงิน และเงื่อนไขต้องได้รับอนุมัติก่อน",
            "Proposed launch prices — sales inactive. Credit expiry, tax, refunds and terms require approval.",
          )}
        </p>
        <section className="my-14">
          <h2 className="font-display text-2xl font-semibold">
            {c("จากรับข้อมูล สู่การติดตาม", "From intake to follow-up")}
          </h2>
          <div className="mt-6 grid gap-4 md:grid-cols-4">
            {[
              c("รับข้อมูล — ไม่ตัดเครดิต", "Intake — no charge"),
              c(
                "รับเข้าคิว — กันเครดิตและสิทธิ",
                "Queue accepted — reserve credit and entitlement",
              ),
              c("แพทย์ประเมินเสร็จ — ใช้สิทธิหนึ่งครั้ง", "Completed assessment — consume once"),
              c(
                "ติดตามและเอกสาร — ไม่มีค่าปรึกษาเพิ่ม",
                "Follow-up and documents — no extra consultation charge",
              ),
            ].map((s, i) => (
              <div key={s} className="rounded-xl border border-border p-5">
                <span className="text-xs font-bold text-primary">0{i + 1}</span>
                <p className="mt-3 text-sm leading-relaxed">{s}</p>
              </div>
            ))}
          </div>
        </section>
        <PublicFaq path="/" />
        <RelatedLinks path="/" />
        <footer className="mt-12 flex flex-wrap justify-between gap-4 border-t border-border pt-6 text-sm text-muted-foreground">
          <span>iCareTele — by Thaikanya Clinic</span>
          <LicenseEvidence />
        </footer>
      </main>
    </div>
  );
}
