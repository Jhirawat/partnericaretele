# iCareTele — by Thaikanya Clinic: implementation review

Prepared 4 October 2026. This is a review build made from the existing Lovable project export, not a production deployment.

## สถานะและข้อกำหนดที่ใช้

โค้ดมาจากโปรเจกต์ Lovable เดิม `partnericaretele(P)(DrNa)` และใช้ TanStack Start / React / Supabase เดิม ไม่มีฐานข้อมูลหรือ wallet คู่แข่ง ไม่ได้ส่งคำสั่ง AI เข้า Lovable ไม่ได้เปลี่ยน production หรือรับเงินจริง

ใช้ข้อกำหนดจาก Pasted text ล่าสุดแทนราคาในโปสเตอร์และข้อความก่อนหน้า: เริ่มต้น 50 เครดิต 20,000 บาท, เติม 25/50/100 เครดิตราคา 10,000/20,000/40,000 บาท; ใช้ 1 เครดิตต่อการประเมินมาตรฐานที่เสร็จสิ้น แม้ไม่มีใบสั่งยา ราคาเสนอรายครั้ง 600 บาท และ Annual Care 6,000 บาท สูงสุด 12 การประเมินใน 12 เดือน ไม่ต่ออายุหรือตัดเงินอัตโนมัติ เครดิตเสนออายุ 24 เดือน ราคายังไม่ active จนผู้ดูแลอนุมัติเงื่อนไข

## Audit ที่นำมาแก้

ตรวจโค้ด export ของระบบเดิมร่วมกับ flow ของ icaretele.co, Porthoros และ functional reference MedRenew demo โดยไม่คัดลอก source/assets ของเว็บอ้างอิง

- รุ่นเดิมมีเส้นทางที่รับราคา/จำนวนจาก client และแยกการยืนยันเงินออกจากลงเครดิต แก้ด้วยราคา snapshot ฝั่ง server, finance verification, row locks และ idempotency
- เครดิตเดิมไม่รองรับ lot/expiry/annual dual reservation แก้โดยต่อยอด `partners.credit_balance`, `credit_transactions` และ `memberships` เดิม ยอดเก่าอยู่ LEGACY_PENDING จนอนุมัติกระทบยอดอย่างชัดเจน
- Clinical notes และ intake มีสิทธิ์กว้างเกินหน้าที่ แก้ RLS, branch scope, private storage, explicit document grants, signed links 60 วินาที และ audit
- เส้นทางเดิมสร้างสมมติฐาน endpoint ของ MCS แก้ให้ disconnected จนได้สัญญา API จริง ไม่มีวิดีโอหรือ PT.33 ปลอม
- ปรับทางเข้าจากหน้าซื้อเดิมไป workflow ใหม่ ลดความสับสนระหว่างเครดิตบริการ สิทธิ์รายปี และคะแนนรางวัล

## สิ่งที่มีในโค้ด

Frontend ไทย/อังกฤษ โทนเขียวเข้ม/ivory/ทอง: landing, workspace, queue, searchable/paginated patients and histories, wallet/top-ups, Annual Care obligations, rewards, branches/staff view, reports/reconciliation, integration status, admin terms และ patient portal

Backend: versioned inactive terms; integer satang/units; FEFO credit lots; immutable ledger; holds; idempotent settlement/refund/dispute; atomic partner annual credit + entitlement reservation; assigned clinician completion; MFA for sensitive admin/finance; tenant/branch restrictions; consent-aware reminder queue; audited JSON export และ historical order/cancellation bridge

Rewards แยก wallet ไม่มี cash conversion หรือใช้แทน consultation credit; ปิด production จนอนุมัติกฎ/allowlist มี manual earn, reservation, fulfilment, release และ compensating reversal

PT.27/PT.28 เป็นเครื่องมือร่าง CSV พร้อมป้องกัน spreadsheet formula injection ไม่ใช่แบบราชการที่ตรวจรับแล้วหรือการส่งรายงานอัตโนมัติ PT.33 ต้องเป็นเอกสารจริงจากผู้ให้บริการ/แพทย์ที่ได้รับอนุญาตและมี document permission ไม่มีการสร้างใบสั่งยาจากการเติมเครดิต

Branch/staff page แสดงสิทธิ์ที่ backend บังคับใช้ การ provision องค์กร/สาขา/บัญชีและสิทธิ์ใช้ admin workflow เดิมและการตั้งค่า staging ที่ได้รับอนุญาต ยังไม่มี onboarding wizard สำหรับทุกบทบาท

## Changed files

ไฟล์ `icaretele-review.patch` และ `icaretele-changed-files.txt` ระบุรายการทั้งหมด; archive มี source ที่แก้และฐาน code เดิม ไม่รวม `.env` จริง, secrets, node_modules หรือ generated build

- UI: `src/components/{PartnerLanding,CareWorkspace,CareMfa,CareHistory,CareExport,ReportTools,BrandIdentity}.tsx`, AppShell, auth/landing/shop routes, styles
- New routes: `/care-demo` (synthetic), `/care` (authenticated), `/care-patient` (patient)
- Server: `src/lib/care*.ts`, policy/types/demo; hardened `stripe.server.ts`, payment webhook, MCS adapter, commerce and partnercare entry points
- Database: additive `drizzle/migrations/0021_*.sql` through `0029_*.sql`, migration journal
- Tests: `tests/care-db.mjs`, `care-finance.test.mjs`, `care-adapters.test.mjs`; npm scripts and lockfile

## Verification

- 33/33 automated tests pass, no failed/skipped tests. SQL migrations and financial/RLS operations run on isolated PostgreSQL via PGlite; auth/storage infrastructure is a test harness with synthetic records
- TypeScript `tsc --noEmit` and targeted ESLint pass
- Vite production build passes with `CARE_LOCAL_REVIEW=1` to omit the local MCP plugin on Windows. Normal Lovable plugin configuration remains enabled
- Desktop/mobile layouts, tabs, filters, demo intake/cancellation and Thai localisation inspected in the browser. Saved screenshot is synthetic data only
- PGlite handles requests through one instance: competing last-credit/entitlement/reward requests were exercised, but this does not certify independent production database-session concurrency. Run multi-session stress tests on staging PostgreSQL before launch
- Real Supabase MFA enrolment, live provider calls, email delivery and production deployment were not tested. Build reports framework deprecation warnings; no build failure

## Install and migration — staging only

1. Connect an approved Git repository to the existing Lovable project. At audit time Git settings had no repository connected. Do not make a replacement Lovable project/backend. Apply the patch to a review branch derived from the inspected export; if current source changed, review/merge conflicts rather than overwrite it
2. Use the supplied `package-lock.json` and `npm ci`. The original `bun.lock` is retained for historical continuity; regenerate/review it before using a frozen Bun install
3. Restore environment configuration from your existing secret manager. No real environment credentials are included. Public branding URLs must point to original authorised assets
4. Back up/export the staging database and verify its migration history matches the existing baseline 0000–0020. Apply **only additive migrations 0021–0029**, in order, under the authorised database migration account and a controlled transaction. Do not replay baseline migrations against an existing database
5. Review SQL first. Do not run `drizzle push` from the old schema declaration: additive SQL is the source for this change. Introspect/regenerate Supabase types after the staging migration and review the diff
6. Keep terms, payments and clinical services inactive. Verify JWT/RLS/MFA/document policies with actual staging accounts; run separate-session contention tests and signed sandbox webhook tests
7. Approve a new version of tax, terms, expiry/ongoing-hold treatment, cancellation, no-show, refund, technical failure and standard-hours settings. Use MFA admin activation; never activate the SYNTHETIC test configuration
8. Review each organisation's old balance and active legacy reservations. Explicit `RECONCILE_ORG` requires expected old balance, approved new opening units, evidence/reason and expiry. Closing/opening adjustment entries preserve the conversion basis; no silent 1:1 conversion. Resolve historical pending orders before converting the organisation
9. Stripe is optional test-only (`CARE_STRIPE_TEST_ENABLED=true` plus reviewed return origin and test credentials). Do not enable `CARE_REVIEW_ALLOW_LEGACY_CHECKOUT`: it re-enables historical checkout behavior outside the new reviewed flow
10. Review and authorise production migration separately. There has been no production schema change, publish, live collection or activation in this task

Run locally:

```powershell
npm ci
npm test
npm run typecheck
$env:CARE_LOCAL_REVIEW='1'
npm run build
npm run dev
```

For synthetic-only UI review use non-production placeholder Supabase URL/key; `/care-demo` does not need real patient data. Do not log in to the real backend during isolated demo review. A running local review is available at http://127.0.0.1:4175/care-demo while the local process remains running.

## Exact connections and launch settings outstanding

- Lovable Git connection: no connected repository found. Local patch/source are ready for review; they have not appeared in the Lovable editor or production website
- Stripe Botanikanya: existing account ownership/configuration and eligibility for these services have not been verified. Connect test credentials/webhook in server secrets and prove settlement/refund/dispute in staging first. Manual transfer is labelled and requires finance verification
- MCS Cloud: actual API documentation, authorised credentials, event contract and ownership/replay rules are needed. Live adapter remains off; restricted manual completion requires explicitly approved settings and an assigned authorised clinician
- Branding: original Dr.Thaikanya Telemedicine logo asset plus verified DHSS licensed entity, licence number and evidence URL. Text branding is a fallback; no licence seal has been fabricated
- Follow-up: reminder records/consent filters exist; actual email transport/account/templates and retry/delivery worker are still required. LINE, WhatsApp, SMS remain disconnected; no reminder click counts as a completed assessment or revenue
- Store/rewards: verified Thaikanya store order/coupon APIs are unavailable. Manual approved workflow exists; no online-store coupon enforcement is claimed. Regulated products remain excluded
- Accounting/business: approve tax/invoice/refund/no-show rules, 24-month credit expiry, clinician contracts and hours. THB 300 is an estimate, not an approved payout. Illustrative contributions are before overhead, not net profit; annual cash is not all earned revenue
- Station installation/hardware fee is unconfirmed and has not been invented. This application does not offer product sales

## Files for review

`icaretele-review-source.zip` — cleaned source copy from the existing project.

`icaretele-review.patch` — differences against the original export.

`icaretele-lovable-review-prompt.md` — optional prompt reflecting this implemented patch. Submitting it to Lovable AI may consume Lovable credits; Git code sync avoids an AI prompt but hosting/backend/provider charges depend on the account.

`icaretele-verification.txt` — final test/build/type/lint output.

`icaretele-dashboard-review.png` — observed Thai demo screen.
