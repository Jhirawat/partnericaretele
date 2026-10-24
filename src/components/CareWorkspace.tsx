import { useState } from "react";
import { toast } from "sonner";
import { Wallet, CalendarCheck, HeartPulse, Coins, ArrowUpRight, AlertCircle } from "lucide-react";
import { useI18n, useCopy } from "@/i18n";
import type { Json } from "@/integrations/supabase/types";
import type { CareView } from "@/lib/care.types";
import { bangkokDate, formatSatang } from "@/lib/service-credit-policy";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import { StatusBadge } from "./StatusBadge";
import { CareMfa } from "./CareMfa";
import { CareHistory } from "./CareHistory";
import { CareExport } from "./CareExport";
type Action = (op: string, args: Record<string, Json>) => Promise<unknown>;
type Props = {
  view: CareView;
  command: Action;
  reward: Action;
  support: Action;
  read: (org: string | null, page: number, query: string, filter: string) => void;
  reconcile: (exportData?: boolean) => Promise<unknown>;
  demo?: boolean;
  checkout?: (paymentId: string) => void;
};
const selectClass = "mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm";
export function CareWorkspace({
  view: v,
  command,
  reward,
  support,
  read,
  reconcile,
  demo = false,
  checkout,
}: Props) {
  const { locale, t } = useI18n();
  const { c, tr } = useCopy();
  const money = (n: number) => formatSatang(n, locale === "th" ? "th-TH" : "en-GB");
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [qty, setQty] = useState(50);
  const [patient, setPatient] = useState("");
  const [branch, setBranch] = useState("");
  const [kind, setKind] = useState("PARTNER");
  const [member, setMember] = useState("");
  const [payment, setPayment] = useState("");
  const [channel, setChannel] = useState("PARTNER");
  const [collector, setCollector] = useState("");
  const [selected, setSelected] = useState<{
    op: string;
    id: string;
    engine?: "reward" | "support";
  } | null>(null);
  const [reference, setReference] = useState("");
  const [evidence, setEvidence] = useState("");
  const [reason, setReason] = useState("");
  const [extra, setExtra] = useState("");
  const [version, setVersion] = useState("");
  const [terms, setTerms] = useState(JSON.stringify(v.terms?.settings ?? {}, null, 2));
  const [report, setReport] = useState<unknown>();
  const org = v.organisationId;
  const position = v.position;
  const active = v.terms?.active ?? false;
  const selectedPatient = v.patients.find((p) => p.id === patient);
  const packPrices = v.terms?.settings["packs"] as Record<string, number> | undefined;
  const annualPrice = Number(v.terms?.settings["annual_minor"] ?? 600000);
  const eligibleAnnual =
    selectedPatient?.annual?.filter(
      (a) => a.status === "ACTIVE" && Date.parse(a.expires_at) > Date.now(),
    ) ?? [];
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      const result = await action();
      toast.success(demo ? c("บันทึกตัวอย่างแล้ว", "Demo updated") : c("บันทึกแล้ว", "Saved"));
      return result;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : c("บันทึกไม่สำเร็จ", "Unable to save"));
      return undefined;
    } finally {
      setBusy(false);
    }
  }
  function pick(op: string, id: string, engine?: "reward" | "support") {
    setSelected({ op, id, ...(engine ? { engine } : {}) });
    setReference("");
    setEvidence("");
    setReason("");
    setExtra("");
  }
  const tabs: [string, string][] = [
    ["overview", c("ภาพรวม", "Overview")],
    ["queue", c("คิวปรึกษา", "Queue")],
    ["patients", c("ผู้ป่วยและติดตาม", "Patients & follow-up")],
    ["credits", c("เครดิตและเติมเงิน", "Credits & top-ups")],
    ["annual", "Annual Care"],
    ["rewards", c("รางวัล", "Rewards")],
    ["branches", c("สาขาและพนักงาน", "Branches & staff")],
    ["reports", c("กระทบยอด", "Reconciliation")],
    ["admin", c("ตั้งค่าและการเชื่อมต่อ", "Settings & integrations")],
  ];
  return (
    <div className="space-y-6">
      {!demo && (v.isAdmin || v.isFinance) && <CareMfa />}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            iCareTele — by Thaikanya Clinic
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold">
            {c("พื้นที่ทำงานพาร์ทเนอร์", "Partner workspace")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {c(
              "บัญชีองค์กรเดียวสำหรับทุกสาขา • เวลาไทย",
              "One organisation wallet across branches • Bangkok time",
            )}
          </p>
        </div>
        <div>
          <Label htmlFor="care-org">{c("องค์กร", "Organisation")}</Label>
          <select
            id="care-org"
            className={selectClass}
            value={org ?? ""}
            onChange={(e) => read(e.target.value || null, 0, "", "ALL")}
          >
            {v.organisations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div
        role="status"
        className="flex gap-3 rounded-xl border border-border bg-secondary p-4 text-sm"
      >
        <AlertCircle className="mt-0.5 size-4 shrink-0 text-primary" />
        <div>
          {demo
            ? tr("Demo — synthetic data; clinical integration not connected")
            : tr(v.integrations["clinical"] ?? "")}
          <p className="mt-1 text-muted-foreground">
            {active
              ? c(
                  "ใช้เงื่อนไขที่อนุมัติไว้ การชำระเงินต้องผ่านฝ่ายการเงิน",
                  "Approved terms apply. Payments require authorised verification.",
                )
              : c(
                  "ราคาเสนอเพื่อทบทวน ยังไม่เปิดขายหรือเปิดบริการจริง",
                  "Proposed settings. Sales and real services remain inactive.",
                )}
          </p>
        </div>
      </div>
      <Tabs defaultValue="overview">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0">
          {tabs.map(([id, title]) => (
            <TabsTrigger
              key={id}
              value={id}
              className="border border-border px-4 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              {title}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="overview" className="mt-6 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              [Wallet, c("เครดิตพร้อมใช้", "Available credits"), position.available],
              [CalendarCheck, c("กันไว้ในคิว", "Reserved"), position.reserved],
              [
                HeartPulse,
                c("สิทธิ Annual ที่ยังไม่ได้ใช้", "Unused annual assessments"),
                position.annualRemaining,
              ],
              [
                Coins,
                c("คะแนนรางวัลแยกต่างหาก", "Separate reward points"),
                position.rewards ?? "—",
              ],
            ].map(([Icon, title, n]) => {
              const I = Icon as typeof Wallet;
              return (
                <article key={String(title)} className="surface p-5">
                  <I className="size-5 text-primary" />
                  <p className="mt-5 text-3xl font-semibold">{String(n)}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{String(title)}</p>
                </article>
              );
            })}
          </div>
          {position.available < Math.max(5, position.recent30DaysUsed) && (
            <div className="rounded-xl border border-border bg-accent/30 p-4 text-sm">
              {c(
                "เครดิตใกล้หมด โปรดเตรียมเติมก่อนรับผู้ป่วย Annual Care เข้าคิว",
                "Low balance. Replenish before accepting sponsored annual encounters.",
              )}
            </div>
          )}
          <div className="grid gap-5 md:grid-cols-2">
            <article className="surface p-6">
              <h2 className="text-lg font-semibold">{c("เครดิตเดือนนี้", "This month")}</h2>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <dt>{c("ใช้จริงเดือนนี้", "Used this month")}</dt>
                <dd>{position.monthUsed}</dd>
                <dt>{c("หมดอายุใน 30 วัน", "Expiring in 30 days")}</dt>
                <dd>{position.expiring}</dd>
                <dt>{c("หมดอายุแล้ว", "Expired")}</dt>
                <dd>{position.expired}</dd>
                <dt>{c("เคยใช้ทั้งหมด", "Total used")}</dt>
                <dd>{position.used}</dd>
                <dt>
                  {c("แนะนำเติมตาม 30 วันที่ผ่านมา", "Suggested replenishment from past 30 days")}
                </dt>
                <dd>
                  {Math.max(0, position.recent30DaysUsed - position.available)}{" "}
                  {c("เครดิต", "credits")}
                </dd>
              </dl>
              <p className="mt-4 text-xs text-muted-foreground">
                {c(
                  "ยอดยกไปเดือนถัดไป ไม่มีการเติมรายเดือนบังคับ คำแนะนำไม่ใช่การตัดเงินอัตโนมัติ",
                  "Balances carry forward. No mandatory monthly top-up. Suggestions never charge automatically.",
                )}
              </p>
            </article>
            <article className="surface p-6">
              <h2 className="text-lg font-semibold">
                {c("นัดหมายถัดไป", "Upcoming appointments")}
              </h2>
              {v.queue
                .filter((q) => q.scheduled_at && Date.parse(q.scheduled_at) > Date.now())
                .slice(0, 5)
                .map((q) => (
                  <p key={q.id} className="mt-3 text-sm">
                    {q.consultation_id} · {bangkokDate(q.scheduled_at!, locale)} · {t(`status.${q.status}`)}
                  </p>
                ))}
              <p className="mt-4 text-sm text-muted-foreground">
                {c(
                  "การจองยังต้องมีสิทธิและเครดิตเพียงพอ แพทย์ประเมินทุกครั้ง",
                  "Booking requires available coverage and funding. Every encounter needs clinical assessment.",
                )}
              </p>
            </article>
          </div>
        </TabsContent>
        <TabsContent value="queue" className="mt-6 space-y-5">
          <form
            className="surface grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4"
            onSubmit={(e) => {
              e.preventDefault();
              void run(() =>
                command("INTAKE", {
                  partnerId: org,
                  patientId: patient,
                  locationId: branch || null,
                  kind,
                  membershipId: kind === "ANNUAL" ? member : null,
                  paymentId: kind === "DIRECT" ? payment : null,
                }),
              );
            }}
          >
            <div>
              <Label htmlFor="queue-patient">{c("ผู้ป่วย", "Patient")}</Label>
              <select
                required
                id="queue-patient"
                className={selectClass}
                value={patient}
                onChange={(e) => {
                  setPatient(e.target.value);
                  setMember("");
                }}
              >
                <option value="">{c("เลือกผู้ป่วย", "Select patient")}</option>
                {v.patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.first_name} {p.last_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="queue-branch">{c("สาขา", "Branch")}</Label>
              <select
                id="queue-branch"
                className={selectClass}
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
              >
                <option value="">{c("สำนักงานใหญ่ / ไม่ระบุ", "Organisation office")}</option>
                {v.branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="queue-kind">{c("ช่องทางบริการ", "Coverage")}</Label>
              <select
                id="queue-kind"
                className={selectClass}
                value={kind}
                onChange={(e) => setKind(e.target.value)}
              >
                <option value="PARTNER">{c("เครดิตองค์กร", "Partner credit")}</option>
                <option value="ANNUAL">Annual Care</option>
                <option value="DIRECT">{c("ชำระรายครั้ง", "Direct payment")}</option>
              </select>
            </div>
            {kind === "ANNUAL" ? (
              <div>
                <Label htmlFor="queue-member">Annual Care</Label>
                <select
                  required
                  id="queue-member"
                  className={selectClass}
                  value={member}
                  onChange={(e) => setMember(e.target.value)}
                >
                  <option value="">{c("เลือกแพ็กเกจ", "Select package")}</option>
                  {eligibleAnnual.map((m) => (
                    <option key={m.id} value={m.id}>
                      {12 - m.used - m.reserved} · {bangkokDate(m.expires_at, locale)}
                    </option>
                  ))}
                </select>
              </div>
            ) : kind === "DIRECT" ? (
              <div>
                <Label htmlFor="queue-payment">
                  {c("รหัสชำระเงินที่ตรวจสอบแล้ว", "Verified payment ID")}
                </Label>
                <Input
                  className="mt-2"
                  required
                  id="queue-payment"
                  value={payment}
                  onChange={(e) => setPayment(e.target.value)}
                />
              </div>
            ) : (
              <p className="self-end text-sm text-muted-foreground">
                {c("รับข้อมูลยังไม่ตัดเครดิต", "Intake does not charge credits")}
              </p>
            )}
            <Button className="sm:col-span-2 lg:col-span-4" disabled={busy || !org} type="submit">
              {c("สร้างรายการรับข้อมูล", "Create intake — no charge")}
            </Button>
          </form>
          <div className="surface overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  {[
                    c("เลขอ้างอิง", "Reference"),
                    c("บริการ", "Coverage"),
                    c("สถานะ", "Status"),
                    c("จัดการ", "Actions"),
                  ].map((h) => (
                    <th key={h} className="p-4 text-start">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {v.queue.map((q) => (
                  <tr key={q.id} className="border-t border-border">
                    <td className="p-4">{q.consultation_id}</td>
                    <td className="p-4">{q.care_kind}</td>
                    <td className="p-4">
                      <StatusBadge value={q.status} />
                    </td>
                    <td className="flex flex-wrap gap-2 p-4">
                      {q.status === "CREATED" && (
                        <Button
                          size="sm"
                          disabled={busy || !active}
                          onClick={() => void run(() => command("ACCEPT", { id: q.id }))}
                        >
                          {c("รับเข้าคิว", "Accept queue")}
                        </Button>
                      )}
                      {["CREATED", "WAITING"].includes(q.status) && (
                        <Button size="sm" variant="outline" onClick={() => pick("CANCEL", q.id)}>
                          {c("ยกเลิก", "Cancel")}
                        </Button>
                      )}
                      {["CREATED", "WAITING"].includes(q.status) && v.isAdmin && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => pick("ASSIGN", q.id, "support")}
                        >
                          {c("มอบหมายแพทย์", "Assign clinician")}
                        </Button>
                      )}
                      {q.status === "WAITING" && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!demo && !v.terms?.settings["manual_clinical_enabled"]}
                          onClick={() => pick("START", q.id)}
                        >
                          {c("เริ่มโดยแพทย์", "Clinician start")}
                        </Button>
                      )}
                      {q.status === "STARTED" && (
                        <Button
                          size="sm"
                          disabled={!demo && !v.terms?.settings["manual_clinical_enabled"]}
                          onClick={() => pick("COMPLETE", q.id)}
                        >
                          {c("แพทย์ยืนยันเสร็จ", "Clinician completion")}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!v.queue.length && (
              <p className="p-6 text-sm text-muted-foreground">
                {c("ยังไม่มีรายการปรึกษา", "No encounters yet")}
              </p>
            )}
          </div>
        </TabsContent>
        <TabsContent value="patients" className="mt-6 space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="patient-search">{c("ค้นหาชื่อผู้ป่วย", "Search patients")}</Label>
              <Input
                id="patient-search"
                className="mt-2"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(0);
                  read(org, 0, e.target.value, filter);
                }}
              />
            </div>
            <div>
              <Label htmlFor="patient-filter">{c("สถานะสิทธิ", "Package validity")}</Label>
              <select
                id="patient-filter"
                className={selectClass}
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value);
                  setPage(0);
                  read(org, 0, query, e.target.value);
                }}
              >
                <option value="ALL">{c("ทั้งหมด", "All")}</option>
                <option value="ACTIVE">{c("มีสิทธิ", "Active")}</option>
                <option value="EXPIRING">{c("หมดอายุใน 30 วัน", "Expiring within 30 days")}</option>
                <option value="EXPIRED">{c("หมดอายุ", "Expired")}</option>
              </select>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {v.patients.map((p) => (
              <article key={p.id} className="surface p-5">
                <h2 className="font-semibold">
                  {p.first_name} {p.last_name}
                </h2>
                {p.annual?.map((a) => (
                  <p key={a.id} className="mt-2 text-sm">
                    Annual Care · {12 - a.used - a.reserved}/12 ·{" "}
                    {bangkokDate(a.expires_at, locale)}
                  </p>
                ))}
                <p className="mt-3 text-xs text-muted-foreground">
                  {c("ยินยอมรับข้อความบริการ", "Service reminder consent")}:{" "}
                  {p.service_reminder_consent ? c("มี", "Yes") : c("ยังไม่มี", "No")}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <CareHistory patientId={p.id} demo={demo} />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!p.service_reminder_consent}
                    onClick={() =>
                      void run(() =>
                        command("REMINDER", {
                          patientId: p.id,
                          purpose: "SERVICE",
                          dueAt: new Date().toISOString(),
                        }),
                      )
                    }
                  >
                    {c("เตรียมติดตามทางอีเมล", "Queue email follow-up")}
                  </Button>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  {c(
                    "บันทึกเตรียมส่งเท่านั้น อีเมลยังไม่เชื่อม การส่งหรือคลิกไม่ถือเป็นการรับบริการ",
                    "Queued only; email adapter disconnected. Delivery or clicks do not count as care.",
                  )}
                </p>
              </article>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              disabled={page === 0}
              onClick={() => {
                setPage(page - 1);
                read(org, page - 1, query, filter);
              }}
            >
              {c("ก่อนหน้า", "Previous")}
            </Button>
            <span className="text-sm">{page + 1}</span>
            <Button
              variant="outline"
              disabled={v.patients.length < 25}
              onClick={() => {
                setPage(page + 1);
                read(org, page + 1, query, filter);
              }}
            >
              {c("ถัดไป", "Next")}
            </Button>
          </div>
        </TabsContent>
        <TabsContent value="credits" className="mt-6 space-y-5">
          <article className="surface p-6">
            <h2 className="text-lg font-semibold">
              {c(
                "เติมเครดิตด้วยการโอน — รอตรวจสอบ",
                "Manual transfer top-up — verification required",
              )}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {c(
                "เริ่มต้น 50 เครดิต 20,000 บาท เติม 25 / 50 / 100 เครดิต ไม่มีการเรียกเก็บรายเดือน หลักฐานรูปภาพไม่เพิ่มเครดิตอัตโนมัติ",
                "Starter 50 / THB 20,000. Top-ups 25 / 50 / 100. No monthly charge. A screenshot never grants credits.",
              )}
            </p>
            <form
              className="mt-5 flex flex-wrap items-end gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                void run(() =>
                  command("CREATE_PAYMENT", {
                    partnerId: org,
                    kind: "CREDITS",
                    channel: "PARTNER",
                    credits: qty,
                  }),
                );
              }}
            >
              <div>
                <Label htmlFor="credit-pack">{c("แพ็กเครดิต", "Credit pack")}</Label>
                <select
                  id="credit-pack"
                  className={selectClass}
                  value={qty}
                  onChange={(e) => setQty(Number(e.target.value))}
                >
                  {[25, 50, 100].map((n) => (
                    <option key={n} value={n}>
                      {n} · {money(packPrices?.[String(n)] ?? n * 40000)}
                    </option>
                  ))}
                </select>
              </div>
              <Button disabled={busy || !active || (!v.isOwner && !v.isFinance)} type="submit">
                {c("สร้างคำขอชำระเงิน", "Create pending purchase")}
              </Button>
            </form>
            <p className="mt-4 text-xs text-muted-foreground">
              {c(
                "วันหมดอายุเครดิตเสนอ 24 เดือนต่อการซื้อ ต้องอนุมัติเงื่อนไขก่อน เครดิตที่กันไว้ระหว่างให้บริการไม่ถูกปล่อยอัตโนมัติ",
                "Proposed expiry: 24 months per purchase, subject to approved terms. Ongoing encounter holds are never silently released.",
              )}
            </p>
          </article>
          <div className="grid gap-3">
            {v.payments.map((p) => (
              <article
                key={p.id}
                className="surface flex flex-wrap items-center justify-between gap-3 p-5"
              >
                <div>
                  <p className="font-semibold">
                    {p.kind} · {money(p.amount_minor)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {p.collector} · {p.id}
                  </p>
                </div>
                <StatusBadge value={p.status} />
                {!demo && checkout && p.status === "PENDING" && p.collector === "THAIKANYA" && (
                  <Button size="sm" onClick={() => checkout(p.id)}>
                    {c("ชำระด้วยบัตร", "Checkout")}
                  </Button>
                )}
                {v.isFinance && p.status === "PENDING" && (
                  <Button size="sm" onClick={() => pick("VERIFY_PAYMENT", p.id)}>
                    {c("ตรวจยอดเงินจริง", "Verify settlement")}
                  </Button>
                )}
                {v.isFinance && p.status === "PAID" && (
                  <Button size="sm" variant="outline" onClick={() => pick("REFUND", p.id)}>
                    {c("คืนเงินตามนโยบาย", "Verified refund")}
                  </Button>
                )}
              </article>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="annual" className="mt-6 space-y-5">
          <article className="surface p-6">
            <h2 className="text-lg font-semibold">Annual Care · {money(annualPrice)}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {c(
                "สูงสุด 12 การประเมินใน 12 เดือน ไม่ต่ออายุอัตโนมัติ พาร์ทเนอร์ใช้เครดิตทีละ 1 ครั้งที่รับเข้าคิว",
                "Up to twelve assessments in twelve calendar months. No automatic renewal. Partner credit is reserved one encounter at a time.",
              )}
            </p>
            <form
              className="mt-5 grid gap-4 sm:grid-cols-3"
              onSubmit={(e) => {
                e.preventDefault();
                void run(() =>
                  command("CREATE_PAYMENT", {
                    partnerId: org,
                    patientId: patient,
                    kind: "ANNUAL",
                    channel,
                    collector,
                  }),
                );
              }}
            >
              <div>
                <Label htmlFor="annual-patient">{c("ผู้ป่วย", "Patient")}</Label>
                <select
                  id="annual-patient"
                  className={selectClass}
                  required
                  value={patient}
                  onChange={(e) => setPatient(e.target.value)}
                >
                  <option value="">{c("เลือกผู้ป่วย", "Select patient")}</option>
                  {v.patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.first_name} {p.last_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="annual-channel">{c("ช่องทาง", "Channel")}</Label>
                <select
                  id="annual-channel"
                  className={selectClass}
                  value={channel}
                  onChange={(e) => setChannel(e.target.value)}
                >
                  <option value="PARTNER">{c("ร้านเป็นผู้รับเงิน", "Partner-collected")}</option>
                  <option value="DIRECT">{c("คลินิกเป็นผู้รับเงิน", "Clinic-collected")}</option>
                </select>
              </div>
              <div>
                <Label htmlFor="annual-collector">
                  {c("ผู้รับเงินจริง", "Actual collecting merchant")}
                </Label>
                <Input
                  id="annual-collector"
                  className="mt-2"
                  required={channel === "PARTNER"}
                  disabled={channel === "DIRECT"}
                  value={channel === "DIRECT" ? "THAIKANYA" : collector}
                  onChange={(e) => setCollector(e.target.value)}
                />
              </div>
              <Button className="sm:col-span-3" disabled={busy || !active} type="submit">
                {c("เตรียมคำขอ Annual Care", "Create pending Annual Care")}
              </Button>
            </form>
          </article>
          {v.patients.flatMap((p) =>
            (p.annual ?? []).map((a) => (
              <article
                key={a.id}
                className="surface flex flex-wrap items-center justify-between gap-4 p-5"
              >
                <div>
                  <h3 className="font-semibold">
                    {p.first_name} {p.last_name}
                  </h3>
                  <p className="mt-2 text-sm">
                    {12 - a.used - a.reserved} {c("สิทธิพร้อมใช้", "available")} · {a.reserved}{" "}
                    {c("กันไว้", "reserved")} · {a.used} {c("ใช้แล้ว", "used")}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {bangkokDate(a.starts_at, locale)} — {bangkokDate(a.expires_at, locale)} ·{" "}
                    {a.channel}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => pick("ESCALATE", a.id)}>
                  {c("ขอทบทวน / โอนการดูแล", "Escalate care responsibility")}
                </Button>
              </article>
            )),
          )}
        </TabsContent>
        <TabsContent value="rewards" className="mt-6 space-y-5">
          <article className="surface p-6">
            <h2 className="text-lg font-semibold">
              {c("คะแนนรางวัลผลิตภัณฑ์", "Product reward points")} · {position.rewards ?? "—"}
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">
              {c(
                "แยกจากเครดิตปรึกษา แลกเงินหรือเติมเครดิตไม่ได้ ไม่ให้รางวัลจากการออกใบสั่งยาหรือการเลือกการรักษา",
                "Separate from consultation credits. No cash or credit conversion. No prescription or treatment incentives.",
              )}
            </p>
            <p className="mt-3 text-sm">
              {v.terms?.settings["rewards_enabled"]
                ? c(
                    "ดำเนินการแบบตรวจสอบด้วยคน ร้านออนไลน์ยังไม่เชื่อม",
                    "Manual approval workflow; online store disconnected",
                  )
                : c(
                    "การสะสมและแลกคะแนนยังปิด รออนุมัติกติกาและรายการสินค้า",
                    "Earning and redemption disabled pending approved rules and product allowlist.",
                  )}
            </p>
            {v.terms?.settings["rewards_enabled"] === true && (
              <div className="mt-4 flex gap-3">
                {v.isFinance && (
                  <Button onClick={() => pick("EARN", "reward", "reward")}>
                    {c("ตรวจสอบยอดสะสม", "Verify earning")}
                  </Button>
                )}
                <Button variant="outline" onClick={() => pick("RESERVE", "reward", "reward")}>
                  {c("ขอส่วนลดแบบตรวจสอบ", "Request manual discount")}
                </Button>
              </div>
            )}
          </article>
          {v.redemptions.map((r) => (
            <article
              key={r.id}
              className="surface flex flex-wrap items-center justify-between gap-3 p-5"
            >
              <span>
                {r.product_code} · {r.points} · {r.state}
              </span>
              {v.isFinance && r.state === "RESERVED" && (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => pick("FULFIL", r.id, "reward")}>
                    {c("ยืนยันใช้ส่วนลดจริง", "Verify fulfilment")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => pick("RELEASE", r.id, "reward")}
                  >
                    {c("ยืนยันใช้ส่วนลดไม่ได้แล้ว", "Release unusable discount")}
                  </Button>
                </div>
              )}
            </article>
          ))}
        </TabsContent>
        <TabsContent value="branches" className="mt-6 grid gap-5 md:grid-cols-2">
          <article className="surface p-6">
            <h2 className="font-semibold">
              {c("สาขาใช้บัญชีองค์กรร่วมกัน", "Branches share the organisation wallet")}
            </h2>
            {v.branches.map((b) => (
              <p key={b.id} className="mt-4 border-t border-border pt-3 text-sm">
                {b.name}
              </p>
            ))}
          </article>
          <article className="surface p-6">
            <h2 className="font-semibold">{c("สมาชิกองค์กร", "Organisation memberships")}</h2>
            {v.staff.map((s, i) => (
              <div key={i} className="mt-3 text-sm">
                <p>
                  {s.role} · {s.status}
                </p>
                <p className="text-xs text-muted-foreground">{s.userId}</p>
              </div>
            ))}
            <p className="mt-4 text-xs text-muted-foreground">
              {c(
                "กำหนดสาขา สิทธิรับเข้าคิว และเพดานรายเดือนผ่านผู้ดูแล สิทธิใช้เครดิตถูกตรวจสอบที่เซิร์ฟเวอร์",
                "Admins assign branch access, queue permissions and monthly limits. Server-side checks enforce spending.",
              )}
            </p>
          </article>
        </TabsContent>
        <TabsContent value="reports" className="mt-6 space-y-5">
          <article className="surface p-6">
            <h2 className="font-semibold">
              {c(
                "เงินสด ภาระผูกพัน และบริการที่ส่งมอบ",
                "Cash, prepaid obligations and delivered services",
              )}
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">
              {c(
                "รายงานแยกเงินที่คลินิกรับกับร้านรับ เครดิตและสิทธิที่เหลือ ต้นทุนแพทย์สมมติ และเจ้าหนี้ที่อนุมัติจริง การส่งข้อความไม่เพิ่มรายได้",
                "Reports separate clinic and partner cash, unused coverage, assumed clinician cost and approved payables. Reminders never create revenue.",
              )}
            </p>
            <Button
              className="mt-5"
              variant="outline"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const data = await reconcile();
                  setReport(data);
                  return data;
                })
              }
            >
              {c("อ่านรายงานกระทบยอด", "Read reconciliation")}
              <ArrowUpRight className="size-4" />
            </Button>
            <CareExport read={() => reconcile(true)} />
          </article>
          {report !== undefined && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(report as Record<string, unknown>)
                .filter(([, value]) => typeof value === "number")
                .map(([key, value]) => (
                  <article key={key} className="surface p-5">
                    <p className="text-xs text-muted-foreground">
                      {key.replace(/([A-Z])/g, " $1").replace(" Minor", "")}
                    </p>
                    <p className="mt-3 text-2xl font-semibold">
                      {key.endsWith("Minor") ? money(Number(value)) : String(value)}
                    </p>
                  </article>
                ))}
            </div>
          )}
          <div className="surface p-6">
            <h3 className="font-semibold">
              {c("ตัวอย่างส่วนต่างก่อนค่าใช้จ่ายอื่น", "Illustrative contribution before overhead")}
            </h3>
            <p className="mt-3 text-sm">
              {c(
                "เครดิต 400 − ต้นทุนแพทย์สมมติ 300 = 100 บาท • ขายรายครั้ง 600 − เครดิต 400 = 200 บาท",
                "Credit 400 − assumed clinician cost 300 = THB 100 • Retail 600 − credit 400 = THB 200",
              )}
            </p>
            <p className="mt-2 text-sm">
              {c(
                "Annual ร้าน 6,000 − 4,800 = 1,200 บาท • Annual คลินิก 6,000 − 3,600 = 2,400 บาท",
                "Partner annual 6,000 − 4,800 = THB 1,200 • Direct annual 6,000 − 3,600 = THB 2,400",
              )}
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              {c(
                "ตัวเลขสมมติ ไม่ใช่กำไรสุทธิ ไม่ใช่อัตราจ่ายแพทย์ที่อนุมัติ การบัญชีรอผู้ทำบัญชีทบทวน",
                "Assumptions, not net profit or approved clinician payouts. Accounting treatment requires accountant review.",
              )}
            </p>
          </div>
        </TabsContent>
        <TabsContent value="admin" className="mt-6 space-y-5">
          <div className="surface p-6">
            <h2 className="font-semibold">{c("สถานะการเชื่อมต่อ", "Integration status")}</h2>
            <dl className="mt-4 space-y-3">
              {Object.entries(v.integrations).map(([key, value]) => (
                <div key={key} className="grid gap-1 text-sm sm:grid-cols-[120px_1fr]">
                  <dt className="font-medium">{tr(key)}</dt>
                  <dd className="text-muted-foreground">{tr(String(value))}</dd>
                </div>
              ))}
            </dl>
          </div>
          {v.isAdmin && (
            <form
              className="surface space-y-4 p-6"
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () =>
                  command("SAVE_TERMS", { version, settings: JSON.parse(terms) as Json }),
                );
              }}
            >
              <h2 className="font-semibold">
                {c(
                  "ร่างเงื่อนไขเวอร์ชันใหม่ — ยังไม่เปิดขาย",
                  "New versioned terms draft — inactive",
                )}
              </h2>
              <div>
                <Label htmlFor="terms-version">{c("ชื่อเวอร์ชัน", "Version")}</Label>
                <Input
                  id="terms-version"
                  required
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  className="mt-2"
                />
              </div>
              <Label htmlFor="terms-json">
                {c("ราคาและนโยบายสำหรับผู้ดูแล", "Administrator price and policy configuration")}
              </Label>
              <textarea
                id="terms-json"
                className="min-h-72 w-full rounded-md border border-input bg-background p-3 font-mono text-xs"
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
              />
              <Button disabled={busy} type="submit">
                {c("บันทึกร่าง (ต้องใช้ MFA)", "Save draft (MFA required)")}
              </Button>
              <p className="text-xs text-muted-foreground">
                {c(
                  "การเปิดขายต้องมีการอนุมัติข้อกำหนด ภาษี การยกเลิก คืนเงิน และเครดิตที่หมดอายุระหว่างกันสิทธิ ไม่ย้ายยอดเดิมโดยอัตโนมัติ",
                  "Activation requires approved terms, tax, refunds, cancellations and held-credit expiry treatment. Legacy balances require an explicit reconciliation.",
                )}
              </p>
              {v.terms && !active && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => pick("ACTIVATE_TERMS", v.terms!.id)}
                >
                  {c("เตรียมคำขอเปิดใช้หลังตรวจทาน", "Activate reviewed terms")}
                </Button>
              )}
            </form>
          )}
        </TabsContent>
      </Tabs>
      {selected && (
        <section className="surface space-y-4 border-primary p-6" aria-labelledby="action-title">
          <h2 id="action-title" className="font-semibold">
            {selected.op} · {selected.id}
          </h2>
          <p className="text-sm text-muted-foreground">
            {c(
              "ใส่หลักฐานอ้างอิงที่ตรวจสอบแล้ว ห้ามใส่รายละเอียดอาการ เลขบัตร หรือข้อมูลบัตรชำระเงิน",
              "Use verified references. Do not enter symptoms, government IDs or card data.",
            )}
          </p>
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const base: Record<string, Json> = { id: selected.id, reference, evidence, reason };
                if (selected.op === "ASSIGN") base["doctorId"] = extra;
                if (selected.engine === "reward") {
                  base["partnerId"] = org;
                  if (selected.op === "EARN" || selected.op === "RESERVE") {
                    const fields = JSON.parse(extra) as Record<string, Json>;
                    Object.assign(base, fields);
                  }
                  if (selected.op === "RELEASE") base["couponCannotBeUsed"] = true;
                }
                return (
                  selected.engine === "reward"
                    ? reward
                    : selected.engine === "support"
                      ? support
                      : command
                )(selected.op, base);
              });
            }}
          >
            <div>
              <Label htmlFor="action-reference">
                {c("เลขอ้างอิงที่ยืนยันแล้ว", "Verified reference")}
              </Label>
              <Input
                id="action-reference"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="action-evidence">
                {c("อ้างอิงหลักฐานตรวจสอบ", "Verification evidence reference")}
              </Label>
              <Input
                id="action-evidence"
                value={evidence}
                onChange={(e) => setEvidence(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="action-reason">
                {c("เหตุผล (ไม่มีข้อมูลสุขภาพ)", "Reason (no clinical data)")}
              </Label>
              <Input
                id="action-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            {(selected.op === "ASSIGN" ||
              (selected.engine === "reward" && ["EARN", "RESERVE"].includes(selected.op))) && (
              <div>
                <Label htmlFor="action-extra">
                  {selected.op === "ASSIGN"
                    ? c("รหัสแพทย์ที่ได้รับอนุมัติ", "Approved clinician ID")
                    : c(
                        "รายการที่ฝ่ายการเงินตรวจสอบ (JSON)",
                        "Finance-verified eligible item (JSON)",
                      )}
                </Label>
                <Input
                  id="action-extra"
                  value={extra}
                  onChange={(e) => setExtra(e.target.value)}
                  placeholder={
                    selected.op === "ASSIGN"
                      ? "Clinician UUID"
                      : '{"productCode":"...","eligibleSpendMinor":100000,"points":100}'
                  }
                />
              </div>
            )}
            <div className="flex gap-3 sm:col-span-2">
              <Button type="submit" disabled={busy}>
                {demo ? c("ยืนยันตัวอย่าง", "Apply demo action") : c("ยืนยันรายการ", "Confirm action")}
              </Button>
              <Button type="button" variant="outline" onClick={() => setSelected(null)}>
                {c("ปิด", "Close")}
              </Button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}
