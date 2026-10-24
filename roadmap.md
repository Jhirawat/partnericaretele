# THAIKANYA PartnerCare — build roadmap

## Final owner sign-off readiness board
- [x] Private read-only latest owner aggregation and eight entry links; independent source sign-offs only.
- [x] Focused and full app/database tests, automatic validation/build and signed-out desktop/mobile zero-external-call verification; standalone typecheck/production build not manually run under platform rules.
- [ ] Real signed-in end-to-end review — blocked: authorized requesting-user and independent reviewer sessions unavailable; no production campaign authorized.

## Final release evidence bundle
- [x] Private twenty-register metadata assembly, immutable snapshots, independent MFA review, stale detection, safe packet and seven entry links.
- [x] App/database regression tests and automatic validation; signed-out desktop/mobile check.
- [ ] Real signed-in snapshot recording, independent review and export — blocked: authorized requesting-user session unavailable; real campaign remains prohibited.

## Production test prerequisite register
- [x] Add private append-only versioned prerequisite metadata, independent current review, suite mapping and owner export; no campaign execution.
- [ ] Signed-in browser recording and second-reviewer confirmation — blocked: requester has no matching auth account.

## Internal credit reconciliation and financial controls
- [x] Inspect deployed ledgers/scope; Cloud 0049–0051 confirmed immutable reporting snapshots, exceptions and independently reviewed internal compensating entries/reversals; spendable balances unchanged.
- [x] Add /credit-reconciliation and /credit-health, scoped redacted reports and private disabled notification/audit events; final RLS/private grants verified.
- [x] Test real-role math, source separation, immutability, adjustments/reversals and existing protections: 288 Node + 6 separate tests passed, one optional PostgreSQL skip; automatic typecheck/build and signed-out previews passed. Details: docs/financial-reconciliation-review.md.
- [ ] Signed-in browser verification — requires the requesting user's authorized account; no alternate account or production test fixtures.

## Privacy, consent and data lifecycle
- [x] Add scoped versioned retention reviews, holds, verified privacy requests and immutable consent/audit commands; Cloud 0047/0048 confirmed, RLS/private grants verified.
- [x] Add /privacy scoped Admin center and /privacy-health aggregate-only Superadmin view; approved operational overlays and redacted JSON packaging retain clinical/accounting history.
- [x] Verify actual-role privacy/consent/history and full regressions: 278 Node + 6 separate tests passed, one optional PostgreSQL skip; automatic typecheck/build and public/signed-out previews passed. Details: docs/privacy-lifecycle-review.md. No integrations or publication.
- [ ] Signed-in browser verification — requires an authorized requesting-user account.

## Configurable SLA and operational escalation
- [x] Add versioned scoped policies, deterministic clocks, append-only transitions and disabled internal reminder events; Cloud 0045/0046 confirmed, private grants/RLS verified.
- [x] Add /sla queue, independent policy review, operational ownership controls, /sla-health redacted aggregates and /system-health observed evidence.
- [x] Verify actual-role scope, clock math, duplicate scans, immutability and existing credit/document tests; 267 Node + 6 separate tests passed, one optional PostgreSQL test skipped; automatic typecheck/build and public/signed-out preview checks passed. Details: docs/operational-sla-review.md.
- [ ] Signed-in preview verification — requires an authorized requesting-user account.

## Notification event and outbox framework (2026-10-20)
- [x] Add scoped operational events, redacted templates/preferences and immutable outbox history; Cloud 0042–0044 confirmed applied, final private grants verified.
- [x] Add /notifications inbox/preferences, audited scoped Admin controls and disabled worker interface; legacy external dispatcher no-op.
- [x] Verify actual-role isolation, suppression, idempotency, retry limits, privacy and active-trigger workflow regressions; 259 Node tests + 6 file/export/worker tests passed, one optional PostgreSQL concurrency test skipped; automatic typecheck/build clean; public/signed-out preview checks passed.
- [ ] Signed-in browser verification — requires an authorized requesting-user account; no alternate account or production fixtures.

## Production operations dashboards and audit (2026-10-20)
- [x] Add scoped Admin queues and Superadmin aggregate health with URL filters and permission-checked drill-down.
- [x] Add redacted audit visibility/export and append-only tamper evidence without changing historical events; Cloud 0040/0041 applied.
- [x] Verify deployed definitions, actual-role isolation/redaction/filter tests, credit/document regressions and public/signed-out preview routes; 251 passed + one optional PostgreSQL skip, file/export tests 4 passed, automatic typecheck/build clean.
- [ ] Signed-in browser verification — requires a matching authorized account; no production fixtures or alternate account selection.

## Manual MCS handoff queue (2026-10-20)
- [x] Scoped handoff records linked to consultation requests; 13 auditable states, operator assignment, append-only events; Cloud 0037 applied.
- [x] /mcs-handoff queue UI with filters, packet preview (minimum fields), links and certificate tracking; MCS service stays disconnected.
- [x] Actual-role tests: transition guards, scope isolation, retry safety, links/certificate requirements, credit isolation.
- [ ] Signed-in browser flow — blocked: requesting user's account is absent; no production accounts or test records created.
- [ ] Live MCS connection — blocked: requires MCS address, API key, signing secret and verified contract; adapter stays in MOCK mode.

## Consultation request lifecycle (2026-10-20)
- [x] Add scoped request states and append-only transition history; Cloud 0036 applied, RLS verified, existing economic logic retained.
- [x] Add Partner/Admin/Doctor request queue at /requests and actual-role lifecycle tests, including independent PostgreSQL contention.
- [x] Verify Cloud migration, full suite (233 passed, one optional local-PostgreSQL test skipped), separate PostgreSQL run (11 passed), automatic typecheck/build and public/protected preview checks.
- [ ] Signed-in browser flow — blocked: requesting user's account is absent; no production accounts or test records created.
- [ ] Real screening configuration and clinical approval — blocked: authorized clinician/compliance lists and existing clinical approval required; none activated.

## Partner customer management and intake (2026-10-19)
- [x] Scoped non-login customers and clinician/compliance-maintained screening configuration; Cloud 0034/0035 applied.
- [x] Four auditable gates, consent evidence, manual escalation and all-PASS consultation requests without credit effects.
- [x] Intake/review UI and actual-role tests; public and signed-out route checks passed.
- [ ] Signed-in browser end-to-end verification — blocked: requesting user has no matching account; selecting another account requires user approval.
- [ ] Clinical configuration activation — blocked: authorized clinician/compliance must provide real lists and consent version; none fabricated or seeded.

## Authorized Master Workflow Phase 1 — Partner onboarding (in progress)
- [ ] Audit deployed signup, roles, tenant policies and document access.
- [ ] Implement private applicant drafts, license uploads, submission/resubmission and scoped reviewer decisions with atomic audit.
- [ ] Enable approved Partner workspace; enforce role/scope and suspension at database boundary.
- [ ] Verify real-role tests, browser flow and full existing test suite; record routes, policies and limitations. No publishing, integrations, Doctor screens or credit changes.

## Phase 1 — Foundation (done)
- [x] Backend enabled (database, auth, server functions)
- [x] Schema: partners, user_roles (tenant-scoped RBAC), patients, consultations, audit_log, profiles
- [x] Row level security + security-definer role helpers; partner isolation
- [x] Email/password + Google sign-in; protected portal routes
- [x] Design system (premium clinical tokens, no hardcoded colours)
- [x] i18n: en / th / ja / zh-CN / ar with full RTL
- [x] Partner, patient, consultation and audit screens
- [x] First signed-up account is bootstrapped as SUPER_ADMIN

## Phase 2 — Clinical provider integration (MCS) — done (sandbox mode)
- [x] Clinical provider adapter (MOCK/LIVE; live needs MCS address, key, signing secret)
- [x] Create consultation outbound flow with idempotency
- [x] Webhook receiver + signature verification, replay window, idempotent events
- [x] HN sync with conflict raising, consultation lifecycle state machine
- [x] Sandbox rehearsal for operations staff

## Phase 3 — Commercial — done (manual invoice payments)
- [x] 1,200 CareCredit package orders (THB 400,000), confirm payment / cancel
- [x] Immutable credit ledger with reserve / consume / release / adjust
- [x] Annual patient membership plan + activation after payment

## Phase 4 — Experience — done
- [x] Patient portal: link record, consultations, memberships
- [x] Notification queue (email / WhatsApp / LINE) with five-language templates
      — sending needs provider credentials; until then messages stay skipped
- [x] Patient notification preferences

## Phase 5 — Operations — partly done
- [x] Integration health monitor, event log, conflict resolution
- [ ] Analytics charts, consultation history export, reconciliation

## Delivered (Sep 2026)
- Consultation notes with AI structured case summary (Lovable AI Gateway)
- Partner account management: edit, activate/deactivate, grant & revoke partner access
- Audit trail filters + CSV export

## Sep 24 requests
- [x] Arabic/Thai check: home, portal, Locations, Partners — no language error
- [x] Patient portal reads through a trusted function (consultations, membership, messages)
- [ ] Live MCS connection — waiting on MCS address, API key and signing secret from the user

## Clinic OS (MCS optional) — plan approved Sep 24
- [x] Phase 1: clinic system mode, doctors, consent, intake, internal consultation flow (Clinic OS page)
- [ ] Phase 2: telemedicine room + doctor dashboard
- [ ] Phase 3: prescriptions + PT.33 + QR verify
- [ ] Phase 4: products, batches, GACP/COA, dispensing
- [ ] Phase 5: patient dashboard uploads + payments
- [ ] Phase 6: CSV import/export, notifications, rename MCS page
- [ ] Phase 7: QA pass; Clinic OS page texts still English-only

## Payments (Stripe, enabled Oct 1)
- [x] Enable built-in payments (test mode ready)
- [ ] Decide sellable products (found: Annual Care Membership ฿3,900; flexible CareCredit top-ups)
- [ ] Create products + prices in payment provider
- [x] Build checkout page + post-purchase business logic (credits/membership activation) — Shop page, embedded checkout, webhook done Oct 1; live checkout still needs Stripe go-live
- [ ] Connect GitHub repo (BLOCKED: requires owner to click Plus → GitHub → Connect project; agent cannot do OAuth)

## Reviewed CARE update (applied Oct 4)
- [x] 47-file code patch applied; 33/33 tests pass; build clean
- [x] Database steps 0021–0029 applied (care terms, credit lots, holds, rewards, workspace reads, patient portal, reconciliation, provider payment events, document defence, legacy bridges); private care-documents storage bucket created
- [ ] Apply CARE_REVIEW.md pricing to payment products (starter 50 credits ฿20,000; top-ups ฿10,000/20,000/40,000; retail ฿600; Annual Care ฿6,000 non-recurring) — supersedes old products; do NOT publish old-price checkout
- [ ] Test checkout in Stripe test mode after pricing update
- [ ] Publish only after pricing update + owner review; live payments still need Stripe account claimed + business verified
# Roadmap
- [x] Phase 07 containment: revoked PUBLIC/anon/authenticated EXECUTE on care_personal_command/3, care_personal_lot_available/1, care_personal_eligible/5 in Cloud; verified live ACL = postgres+service_role only (2026-10-07).
- [x] 0038 hardening applied + verified live; 115 tests pass, typecheck clean. STOPPED before Phase 08.

## Phase 08 — Prepaid purchase UI (done 2026-10-08)
- [x] db/0040 care_prepaid_purchase (patient self-scope, plan snapshot binding) — applied + verified live
- [x] Portal: prepaid package cards, embedded checkout, balance display (5 locales)
- [x] Server fns purchasePrepaidPackage / getMyPrepaidBalance
- [x] Tests 122 pass / 0 fail; typecheck clean
- [ ] Auto-GRANT of lot on live settlement — future phase (currently staff/server action)

## Phase 09 — Booking + care-team UI (done 2026-10-08)
- [x] db/0041 care_my_catalog + care_patient_book (patient self-scope; membership OR eligible prepaid lot; no client payment/org) — applied via SQL runner, verified live (anon denied)
- [x] Portal: book a video session (service + window), my appointments, join button only when video room READY (Daily still off)
- [x] /doctor care-team page: appointments + confirm/cancel/complete/no-show, patient records, history, notes, relationship grant/revoke
- [x] Tests 129 pass / 0 fail (+7); typecheck clean; build OK
- [ ] Auto-GRANT of lot on live settlement — future phase
- [x] Phase 11 video rooms (0043): trusted video command + guard, Daily-backed open/end, join link only when READY — fail closed without DAILY_API_KEY
- [x] Phase 12 booking prepaid holds (0044): reserve on request, capture on completion, release on cancel/no-show — 150/150 tests
- [x] Phase 13 clinical notes (0045): doctor-only DRAFT→FINAL notes per appointment, immutable when final, clinical_state driven, portal read view — 157/157 tests
- [x] Phase 14 follow-up plans (0046): doctor schedules on completed appointments, DONE/CANCELLED terminal, portal "My follow-ups" — 164/164 tests
- [x] Phase 15 appointment documents DB (0047): doctor visit summaries DRAFT→ISSUED, immutable, document_state driven — 170/170 tests; UI pending
- [x] Phase 12 prepayment at booking (0044): booking reserves the prepaid lot (FEFO, derived UUID keys), COMPLETE captures as the assigned doctor, CANCEL/NO_SHOW release; membership-covered bookings untouched — applied + verified live; 150 tests pass

- [x] Phase 15 UI — visit summary screens (doctor write, patient read)

## Open (2026-10-16)
- [x] i18n: full locale rendering on /, /care-demo, /auth for en/th/ja/zh-CN/ar (no English fallback), RTL kept, tests for keys + switching
- [x] Partner credit lifecycle audit: intake no-op, accept reserves 1 (PARTNER credit / ANNUAL entitlement) idempotent, complete consumes once, cancel/fail releases, DIRECT never deducts, no negatives, audited; regression tests first

## Doctor recruitment & assignment (2026-10-19)
- [x] Certificate P0: /certificates private manual uploads, scoped review/forwarding, immutable revisions/audit; Cloud 0038/0039 applied; actual-role and file validation tests pass, automatic typecheck/build clean, signed-out protection and existing preview consoles checked.
- [ ] Certificate signed-in upload/download/review browser flow — blocked: requester has no matching auth account; no other account selected or production fixtures created. Real file transfer remains unverified.
- [x] db/0050 doctor_command (register/link/verify/suspend/reinstate/revoke/assign/set-assignment/availability), assignment + availability tables read-only to clients, consultation doctor-scope guard — applied to Cloud (drizzle 0032 + 0033 write revoke)
- [x] /doctor-recruitment admin queue, /doctor-workspace status + availability; 8 new tests, 213/213 pass, typecheck/build OK
- [ ] Signed-in click-through not verified (no test session can be created)

## Release readiness (P0)
- [x] Versioned append-only checklist sign-offs, two-step approvals, maintenance banner, read-only smoke runner, runbook (db/0069 / drizzle 0052)
- [ ] Signed-in end-to-end checks — blocked: no authorized test account

## Release evidence handoff (P0)
- [x] Append-only evidence registry, redacted export, offline /release-handoff, templates, tests
- [ ] Signed-in sign-offs, second-admin approval, live DB and backup evidence — blocked: needs a global Superadmin account and a second admin

## Public SEO & accessibility (P0)
- [x] Bilingual heads, canonical/noindex, sitemap, robots, JSON-LD, a11y smoke tests
- [x] Public content & performance readiness (FAQ, internal links, breadcrumbs, CWV fixes)
- [x] SEO validation crawl + content governance checklist
- [x] Public conversion & trust readiness (journey checklist, safe 404/error, guards)
- [x] Final public-release QA report + reviewer template
- [x] Publish gate + human review acknowledgements
- [x] Release runbook + simulation-only rollback drill (db/0072, drizzle 0055)
- [x] Backup evidence register (db/0073, drizzle 0056)
- [x] Migration/RLS/storage protection evidence register (db/0075, drizzle 0058)
- [x] Human test session results recorder and reconciliation (db/0100, drizzle 0083-0086)
- [ ] Final Go-Live Evidence Reconciliation Matrix — implementation and verification in progress
