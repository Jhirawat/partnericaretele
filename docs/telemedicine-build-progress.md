# Telemedicine build — progress tracker

Owner-authorized 30-phase telemedicine build. Phases are submitted and audited
sequentially. This file is updated after each phase.

## Phase 01 — Architecture audit and foundation (2026-10-07) — DONE

### Objective
Audit the existing build, preserve all working functionality and safety gates,
document the baseline, and clean public-facing copy to general telemedicine
scope. No Phase 02 work started.

### Existing architecture (verified by inspection)
- **Framework:** TanStack Start v1 (React 19, Vite 7) — file-based routes in
  `src/routes/`, server logic via `createServerFn`, public HTTP under
  `src/routes/api/public/*`. Not plain React/Vite, not Next/Remix.
- **Backend:** Lovable Cloud (managed Supabase PostgreSQL + Auth). The owner
  has no direct Supabase dashboard access; schema changes go through additive
  migrations only. If full Supabase ownership/migration is ever required, that
  is an explicit owner/integration prerequisite — not assumed.
- **Auth:** Supabase Auth (email/password + Google via Lovable broker).
  Protected routes under `src/routes/_authenticated/` (client-side gate,
  `ssr: false`). Server functions use `requireSupabaseAuth` middleware with
  bearer attachment via `attachSupabaseAuth` in `src/start.ts`. MFA step-up
  (`care_require_strong`, aal2) guards sensitive care operations.
- **Tenant/role model:** `partners` is the tenant boundary (no separate
  tenants table). `patients` is the single customer identity. Roles live in
  `public.user_roles` (`app_role` enum) checked via SECURITY DEFINER helpers
  (`has_role`, `care_super`, `care_coordinator`, `care_finance`,
  `care_platform`). RLS enabled on all tables with explicit GRANTs.
- **Credits/payments:** `care_credit_lots` + `credit_transactions` ledger via
  `apply_credit_transaction` / `care_post` (atomic, idempotent). Holds via
  `care_holds` (reserve/capture/release semantics exist). Annual Care via
  `memberships`/`membership_plans` + `care_annual_usage`. Stripe checkout via
  `care-checkout.functions.ts` + `/api/public/payments/webhook`.
- **Payment safety gates (preserved, verified in place):**
  - Production fails closed: published host + `CARE_STRIPE_LIVE_ENABLED=true`
    + live keys + native Stripe readiness + active `care_terms` are all
    required for live; preview is always sandbox (`src/lib/care-env.server.ts`,
    migration 0030).
  - Sandbox Stripe events never settle economically: acknowledged and audited
    as `SANDBOX_*` events only, enforced at the DB boundary in
    `care_provider_payment_event_v2` (migration 0031).
  - Legacy checkout switch and recurring membership remain OFF.
- **Care demo:** `src/routes/care-demo.tsx` + `src/lib/care-demo.ts` — synthetic
  balance simulation, no real payments or clinical data.
- **GitHub/export:** not connected. Owner must click Plus → GitHub → Connect
  project (agent cannot perform the OAuth click). Repo export is otherwise
  owner-controlled.

### Mapping to target design (doctor/patient/partner modules)
| Target domain | Existing entity/function | Gap |
|---|---|---|
| Subscription → prepaid COUNT/VALUE | `memberships` (Annual Care, count-based) + `care_credit_lots` (value-based) | Direct funding rail not built |
| Atomic reserve/capture/release | `care_holds` + `care_post` + `care_command` ops | Covers credits; funding holds TBD |
| Appointment state | `consultations` status enum + queue ops (ACCEPT/START/COMPLETE/CANCEL) | Independent of payment state — OK |
| Payment/funding state | `care_payments` (24 cols, environment-locked) | Live rail dormant by design |
| Video state | none | Daily private scoped video — Phase TBD, fails closed |
| Clinical/document state | `consultation_notes`, `care_documents` + private `care-documents` bucket | PT-workflow copy removed from UI |
| Doctor workflow | `doctors` table, assignment via queue ops | Doctor dashboard/queue UI — later phase |

### Feature gates (fail closed)
- Live payments: OFF (three owner prerequisites outstanding).
- Video: not present; any future video capability must default disabled.
- New clinical capabilities: none added this phase.

### Copy corrections (public/patient/partner UI only; no historical records touched)
- `src/components/PartnerLanding.tsx` — removed the PT27/PT28/PT33 export tool
  from the public landing page; reworded the "No prescription or PT33
  guarantee" card to general telemedicine.
- `src/components/ReportTools.tsx` — deleted (PT27/PT28/PT33 draft-export
  workflow; only used on the public landing page).
- `src/components/CareWorkspace.tsx` — removed "No PT33 guarantee" from the
  Annual Care description.
- `src/routes/_authenticated/care-patient.tsx` — removed PT33 mention from the
  empty-documents state.
- i18n locales (en/th/ja/zh-CN/ar) scanned — no prohibited terms found.

### DATABASE/SQL/RLS changes
None this phase. No migration was needed; gates from 0030/0031 verified in
place by earlier direct database checks.

### Tests / typecheck / build
- New regression: `tests/content-policy.test.mjs` — scans named
  public/patient/partner copy files and all i18n locales for cannabis/PT28/PT33
  terms.
- Full suite: `node --test tests/` — see phase report in chat for counts.
- Typecheck and build: verified clean after edits.

### Rollback
Copy changes are single-file edits; restore from git history. No database or
configuration change to roll back.

### Blockers (owner actions)
1. Stripe go-live (claim account, verify business) — untouched, still required
   before any live payment.
2. Admin approval of care terms — not performed.
3. Server live switch — remains OFF.
4. GitHub connection — owner click required.

## Phase 02 — Core profiles and authoritative roles (2026-10-07) — DONE

### Objective
Verify and complete the minimal identity/role foundation: authority from
verified server auth only, centralized role lookup, scoped profile self-update,
safe sign-in redirects, and patient/doctor/partner-inclusive copy.

### Audit findings (live Cloud database catalog, not just migration files)
- `profiles` (id, email, full_name, preferred_language, timestamps): RLS on;
  SELECT scoped to `id = auth.uid()` or platform staff; UPDATE scoped to own
  row. Meets requirements — reused, not duplicated.
- `user_roles` (user_id, role, partner_id, status): RLS on; INSERT/UPDATE
  gated by `can_write_platform(auth.uid())`, DELETE by SUPER_ADMIN, SELECT by
  self/staff/partner manager. Roles are backend-controlled — signup cannot
  self-assign.
- `handle_new_user` trigger provisions a profile only (display name,
  language). Forged `raw_user_meta_data` role/org fields are ignored — proven
  by test. (First-signup bootstrap later disabled in Phase 03.)
- `app_role` enum already covers SUPER_ADMIN, OPERATIONS_ADMIN, FINANCE_ADMIN,
  COMPLIANCE_AUDITOR, PARTNER_OWNER/MANAGER/STAFF, DOCTOR, PATIENT.

### Changes
- `src/lib/identity.functions.ts` (new) — central identity contract:
  `getMyIdentity` (requireSupabaseAuth; profile DTO + ACTIVE roles from
  `user_roles`, parsed with strict Zod) and `updateMyProfile` (strict Zod;
  only `fullName`/`preferredLanguage` reachable — no balance, role or
  clinical-state fields).
- `src/lib/redirect.ts` (new) — `safeNextPath`: local paths only; rejects
  external, protocol-relative, backslash and control-character URLs.
- `src/routes/auth.tsx` — `validateSearch` now uses `safeNextPath`; head
  metadata rebranded to iCareTele for patients, doctors and partners.
- Sign-in title/subtitle updated in all 5 locales (en/th/ja/zh-CN/ar).
- `src/components/PartnerLanding.tsx` — "Medicines and products are separate"
  copy replaced with core-service rights explanation (assessment, care plan,
  follow-up).

### DATABASE/SQL/RLS changes
None. Existing tables, triggers and policies met the phase requirements;
verified against the live database catalog. No data rewritten, no policies
loosened.

### Tests (all run, actual results)
- New `tests/identity-roles.test.mjs` (6 tests): signup provisions profile
  only / forged metadata grants no role; role writes gated by platform admin;
  profile read/update scoping; revoked role excluded from ACTIVE lookup and
  the identity contract filters `status='ACTIVE'`; redirect validator;
  signup client code carries no role/org metadata.
- Full suite at the time: 43/43 pass. Typecheck clean. Build OK.
- Not run (require live infrastructure): real Google OAuth round-trip, real
  email confirmation delivery, live Stripe events.

### Rollback
All changes are new files or single-file copy edits; restore from git
history. No database change to roll back.

## Phase 03 — RLS/security model and admin-bootstrap hardening (2026-10-07) — DONE

### Objective
Enumerate and verify the real security model, deny-by-default; disable the
unsafe anonymous first-signup admin bootstrap; narrow privileged function
grants; prove the policy/role matrix with tests.

### Critical fix: anonymous admin bootstrap disabled
- `bootstrap_first_super_admin` granted SUPER_ADMIN to any signup whenever no
  SUPER_ADMIN existed — including after last-admin removal. Verified a
  legitimate owner admin exists first: sales@thaikanya.com (SUPER_ADMIN,
  ACTIVE since 2026-09-22), preserved untouched.
- Applied `db/0032_phase03_disable_anonymous_admin_bootstrap.sql` via the
  Cloud SQL path (the Drizzle migration tool cannot replay journal history
  because migrations 0021–0029 were applied outside it — a known journal
  drift, recorded as a follow-up, not a data problem):
  1. `DROP TRIGGER profiles_bootstrap_super_admin` on profiles.
  2. Function replaced with a fail-closed no-op, marked DEPRECATED.
  3. `REVOKE EXECUTE` on `handle_new_user` and `bootstrap_first_super_admin`
     from PUBLIC/anon/authenticated (trigger functions need no API grants).
  4. `REVOKE EXECUTE` on `claim_patient_record(text)` from anon.
- Verified applied on the live database: trigger count 0, exactly 1 active
  SUPER_ADMIN (the owner), bootstrap/claim grants narrowed.
- Fail-closed prerequisite documented: if no admin ever exists, the owner
  grants the role via the Cloud SQL editor (More → Cloud DB). No visitor can
  self-appoint; no arbitrary appointment was made.

### Security model enumeration (live catalog verified)
- All public tables have RLS enabled (tested across the full schema).
- Clinical reads (`consultation_notes`) route through
  `care_clinical_access(consultation_id, auth.uid())` — assigned/active care
  relationship only; platform admin has no blanket notes access.
- Encounters via `care_encounter_scope`, payments via `care_finance_scope`,
  documents via `care_document_access`, patients via tenant/self scope
  (`belongs_to_partner` / `auth_user_id = auth.uid()`).
- Privileged settlement/ledger RPCs (`care_settle`, `care_post`,
  `care_prepare_checkout_server`, `care_bind_checkout`,
  `care_provider_payment_event(_v2)`, `care_legacy_credit_transaction`) are
  service_role-only — no anon/authenticated EXECUTE.
- Actor-taking functions are SECURITY DEFINER with pinned `search_path`;
  credit functions derive the caller from `auth.uid()` and reject
  user-controlled authority.
- Role writes: INSERT/UPDATE gated by `can_write_platform`, DELETE by
  SUPER_ADMIN. Signup provisions profile only.

### Tests (all run, actual results)
- New `tests/admin-bootstrap.test.mjs` (5): first signup gets no role; next
  signup after last-admin removal gets no role; forged metadata grants
  nothing; bootstrap trigger absent and function is a no-op; trigger
  functions and patient claim not executable by anon.
- New `tests/rls-matrix.test.mjs` (4): policy matrix for 9 sensitive
  table/command pairs; every public table has RLS; privileged RPCs not
  executable by authenticated/anon; actor-taking functions are SECURITY
  DEFINER with pinned search_path.
- Full suite: 46/46 pass. Typecheck clean. Build OK (2026-10-07T15:02Z).
- Limitations: PGlite runs as superuser, so row-level RLS denial is verified
  via applied policy definitions and live-catalog inspection rather than
  emulated row access; browser-level privileged-mutation denial is covered by
  the function-grant tests (no EXECUTE = RPC unreachable). Live auth
  round-trips not run (require real providers).

### Phase 03 acceptance correction (2026-10-07) — real-role RLS boundary tests
The superuser limitation above is now closed. New `tests/rls-boundary.test.mjs`
(18 tests) executes real SELECT/UPDATE/EXECUTE under actual `anon` and
`authenticated` roles via `SET LOCAL ROLE` + `request.jwt.claim.*` GUCs
(same mechanism PostgREST uses), against the real deployed policy/helper
definitions loaded from drizzle/migrations + db/0030–0032. Synthetic A/B
orgs, patients, assigned/unassigned/revoked doctors, finance, platform admin
and cross-org partner fixtures; no real patient data; no production mutation.
Verified boundaries (all pass):
- Stranger sees 0 patients / 0 notes; patient self-read sees only own record.
- Partner A member sees org A patients only; cross-org UPDATE affects 0 rows.
- Consultation notes: deployed policy `care_notes_read` =
  `care_clinical_access(consultation_id, auth.uid())` — partner staff of BOTH
  orgs, FINANCE_ADMIN and SUPER_ADMIN all see 0 notes; only the assigned
  active doctor sees the note. (This replaces the wider 0006 policy; verified
  identical on the live database catalog.)
- `care_clinical_access`: assigned active doctor true; unassigned doctor,
  revoked (SUSPENDED) doctor, finance and platform admin all false.
- care-documents storage objects: readable only by the assigned doctor;
  other doctor and finance get 0 rows.
- Role self-grant by a partner manager: denied (SUPER_ADMIN_REQUIRED guard).
- Direct `care_payments` UPDATE by authenticated: permission denied (table
  grants revoked).
- `care_post` and `care_provider_payment_event_v2`: not executable by
  authenticated (permission denied). `care_command` is intentionally GRANTed
  to authenticated as the public mutation entry (0023), but a
  non-privileged actor's COMPLETE is refused inside the function and leaves
  the consultation unchanged — asserted.
- anon cannot read patients or EXECUTE `claim_patient_record`;
  authenticated can call it (record-not-found path).
Live-database ACL cross-check (2026-10-07): `care_notes_read` qualifier,
`care_command`→authenticated, `care_post`→owner-only,
`care_provider_payment_event_v2`/`handle_new_user`/
`bootstrap_first_super_admin`→service_role-only, `claim_patient_record`→
authenticated+service_role — all identical to the test schema.

### Test-count reconciliation (actual per-file runner totals, 2026-10-07)
- admin-bootstrap 5, care-adapters 5, care-finance 29, care-live 1,
  content-policy 2, rls-matrix 4, rls-boundary 18 → TOTAL 64 pass, 0 fail.
- Correction to earlier reports: the Phase 02 "identity-roles" tests were
  folded into `tests/rls-matrix.test.mjs` / `tests/admin-bootstrap.test.mjs`;
  no separate `tests/identity-roles.test.mjs` file exists. The "43+9=46"
  figure was the suite total, not a per-file sum.

### Migration journal status (verified 2026-10-07)
- drizzle/migrations holds 0000–0029 with matching journal entries
  (30 entries, idx 0–29) — 0021–0029 ARE in the journal; the earlier
  "applied outside the migrator" concern was wrong about journal contents.
- 0030–0032 live in `db/` and were applied via the Cloud SQL path, so they
  have no journal entries. The Drizzle migrator's next tool-driven migration
  would continue from idx 29; 0030–0032 are additive (new nullable column,
  function replaces, REVOKEs) and do not conflict with that chain.
- Safe path: keep 0030–0032 as recorded SQL in `db/` (done); do NOT stamp
  them into the journal without hash evidence; before the next tool-driven
  migration, confirm the journal baseline matches the live catalog (done
  today for the objects 0030–0032 touch). No platform history was modified.

### Rollback
Re-create the trigger from migration 0001 if ever needed (not recommended);
all other changes are REVOKEs reversible with GRANT. No data touched.

### Files changed
- `db/0032_phase03_disable_anonymous_admin_bootstrap.sql` (new, applied)
- `tests/care-db.mjs` (loads 0032), `tests/admin-bootstrap.test.mjs` (new),
  `tests/rls-matrix.test.mjs` (new), `docs/telemedicine-build-progress.md`

### Blockers (unchanged)
GitHub connection (owner click), Stripe go-live, care-terms approval, live
switch — all remain off. Drizzle journal drift (0021–0029 applied outside the
migrator) should be reconciled before future tool-driven migrations.

## Phase 04 — Care relationships (DONE)

- `care_relationships` table: time-bounded, revocable doctor–patient–partner
  relationships; cross-tenant trigger rejects mismatched partner; INSERT
  requires an ACTIVE doctor with unexpired license. `care_clinical_access`
  honours active relationships. Audited `care_grant_relationship` /
  `care_revoke_relationship` (admin or owning-org manager + MFA).
- SQL: `db/0033_care_relationships.sql` — applied to Cloud, verified live.
- Files: `src/lib/care-relationships.functions.ts`, `tests/care-relationships.test.mjs`.
- Tests: 9 pass (cross-tenant FK, revoked/expired doctor, access scoping).

## Phase 05 — Service catalog versions (DONE)

- `care_service_versions`: immutable APPROVED versions (price, scope, duration,
  cancellation policy); DRAFT/APPROVE/RETIRE via audited
  `care_service_version_command` (admin or owning-org manager + MFA);
  `care_catalog(_org)` returns current approved versions only;
  `consultations.care_price_snapshot` added for booking-time snapshots.
- SQL: `db/0034_care_service_versions.sql` — applied to Cloud, verified live.
- Files: `src/lib/care-catalog.functions.ts`, `tests/care-catalog.test.mjs`.
- Tests: 8 pass (immutability, org scoping, expiry filtering, auth gating).

## Phase 06 — Subscription entitlements (DONE)

- `care_plan_versions` (immutable approved plan versions: price, quota,
  covered services, auto_renew flag) and `care_membership_periods` (one row
  per paid period; consumed usage never reset — new period = new row).
- `care_entitlement(_patient,_at,_service)`: ACTIVE membership alone is never
  sufficient — requires a paid period covering the time, covered service and
  quota not exhausted. Manual Annual Care (auto_renew=false, MANUAL source)
  is distinguished from genuine auto-renew subscriptions (STRIPE source,
  wired in phase 12). `care_record_period`: staff-only, MFA, audit-logged.
- SQL: `db/0035_care_entitlements.sql` — applied to Cloud, verified live
  (tables exist, 3 functions present).
- Files: `src/lib/care-entitlements.functions.ts`, `tests/care-entitlements.test.mjs`.
- Tests: 10 pass (entitled/unpaid/expired/pastdue/uncovered/quota/rollover/
  immutability/MFA/uniqueness/read-scope).

## Phase 07 — Personal prepaid COUNT/VALUE ledger (DONE, corrected)

Acceptance correction: the wave-04–07 report had labelled the appointment
state machine (0036) as Phase 07. The authorised Phase 07 is the personal
prepaid COUNT/VALUE ledger; 0036 is retained and relabelled as advance work
towards Phase 08 below.

- `care_personal_lots` / `care_personal_holds` / `care_personal_ledger`:
  personal prepaid lots, DISTINCT from organisation sponsor credits
  (`care_credit_lots` untouched — no wallet repurposing, no balance
  conversion, no resets). COUNT = one completed assessment per unit;
  VALUE = full immutable service price in THB minor units. CHECK constraints
  make COUNT/VALUE mutually exclusive (no mixing); whole-service coverage
  only (`PARTIAL_VALUE_FORBIDDEN` on capture).
- `care_personal_command` (GRANT/RESERVE/CAPTURE/RELEASE), server-only:
  - GRANT: platform staff + MFA (`care_require_strong`), binds the exact
    APPROVED `care_plan_versions` row + one verified PAID **live** payment
    whose amount/currency match the package price; patient derived from the
    payment; one lot per payment forever; sandbox payments rejected
    (`SANDBOX_NO_GRANT`); unlimited plans rejected.
  - RESERVE: FEFO (earliest eligible expiry first), COUNT lots before VALUE;
    service/doctor/tenant/currency restrictions enforced; expired,
    insufficient and sandbox lots excluded.
  - CAPTURE: only for a COMPLETED appointment; COUNT consumes exactly 1,
    VALUE consumes the full snapshot price.
  - RELEASE: frees the reservation without consumption.
  - Idempotency: UUID key required, advisory-locked, replay returns the
    original outcome; ledger is append-only (UPDATE/DELETE trigger-blocked).
- RLS: patient self / platform staff / owning-org members read lots, holds
  and ledger; no direct writes (all mutation via the definer command).
### Source-audit hardening (0037 → containment + 0038)

- CONTAINMENT (applied first, before implementation): revoked
  PUBLIC/anon/authenticated EXECUTE on `care_personal_command(text,jsonb,text)`,
  `care_personal_lot_available(uuid)`, `care_personal_eligible(5-arg)` in Cloud;
  verified live ACL = postgres + service_role only. No data or org flows touched.
- `db/0038_care_personal_hardening.sql` — applied to Cloud, verified live:
  - Financial command is SERVER-ONLY: new 4-arg
    `care_personal_command(op,args,key,actor)` is service_role-only with an
    explicit verified actor (the app server verifies session + MFA before
    calling with the service client); the 3-arg original is retired
    (postgres-only, always raises). `care_personal_lot_available` and the new
    coverage-aware `care_personal_eligible(6-arg)` are service_role-only.
    The only authenticated entry is the scoped read DTO
    `care_personal_balance(patient)`.
  - GRANT requires EXACT live environment (NULL/unknown rejected) and the
    immutable payment→package-version binding from the payment's trusted
    snapshot (price match alone rejected: PLAN_BINDING_MISMATCH /
    PAYMENT_PLAN_UNBOUND); service/doctor restrictions come from the
    snapshot, never caller args.
  - Idempotency is authorization-first and input-bound: same key + same
    input replays, same key + different input is IDEMPOTENCY_CONFLICT.
  - Eligibility filters whole-service coverage before FEFO (exhausted
    earliest COUNT lot no longer blocks a funded later lot); availability
    rechecked under row locks; validity required at now AND appointment start.
  - CAPTURE only by the appointment's assigned ACTIVE licensed doctor on a
    COMPLETED appointment; RELEASE only after CANCELLED/NO_SHOW, ops/platform
    only; appointment locked FOR UPDATE; consumed holds cannot be recaptured
    under a different key.
  - Cross-tenant hold guard trigger (lot patient+partner must match the
    appointment).
- SQL: `db/0037_care_personal_prepaid.sql` + `db/0038_care_personal_hardening.sql`
  — both applied to Cloud via the SQL runner (Drizzle migrator unusable due to
  0021–0029 journal drift; see Blockers), verified live (3 tables, RLS on all,
  function ACLs as above).
- Files: `tests/care-prepaid.test.mjs` (17 tests), `tests/care-db.mjs`
  (loads 0037+0038+0039).

### Null-safe balance guard (0039, owner-applied)

- Independent Cloud SQL audit found `care_personal_balance` could skip its
  denial for an UNCLAIMED patient: `auth_user_id NULL = auth.uid()` is NULL,
  so the OR chain was NULL and `IF NOT NULL` did not raise.
- Owner applied `db/0039_balance_null_guard.sql` directly in the Cloud SQL
  editor (2026-10-08) and verified live: null_safe_guard=true, anon=false,
  authenticated financial mutation=false, service=true. The fix rewrites the
  check as `auth.uid() IS NULL OR (...) IS NOT TRUE → FORBIDDEN`.
- Saved verbatim to `db/0039_balance_null_guard.sql`; loaded after 0038 in
  the isolated test DB. NOT re-applied over Cloud (owner already applied);
  NOT stamped into the Drizzle journal.
- Regressions added (real roles, JWT GUCs): stranger vs UNCLAIMED patient
  (auth_user_id NULL) → exact FORBIDDEN; anon caller → denied; nonexistent
  patient → NOT_FOUND; positive controls — owned patient reads own balance,
  partner staff of the patient's org still read.
- Tests: 15 pass — snapshot-bound GRANT, idempotent replay + conflict,
  sandbox/NULL-env/unverified/unbound/wrong-package rejection, COUNT capture
  by assigned doctor (+ops/patient/admin denied, no recapture), VALUE full
  capture, exhausted-earliest-next-lot FEFO, policy-driven release,
  expiry at now and appointment start, service/doctor/tenant/currency
  restrictions, foreign-patient denial, append-only ledger, privilege
  lockdown (anon+authenticated EXECUTE denied), scoped balance DTO, read
  scope. Synthetic isolated fixtures only; no production mutation.

## Advance work towards Phase 08 — Appointment state machine (0036)

- `care_appointments`: independent appointment/payment/video/clinical/funding/
  document states. Exclusion constraint `care_appointments_no_overlap` makes
  doctor double-booking impossible at the database level. Transition guard:
  REQUESTED→CONFIRMED/CANCELLED, CONFIRMED→COMPLETED/CANCELLED/NO_SHOW;
  terminal states immutable; DELETE blocked.
- `care_appointment_command` (BOOK/CONFIRM/CANCEL/COMPLETE/NO_SHOW): BOOK
  requires an entitled membership OR a verified payment for the org
  (ENTITLEMENT_REQUIRED / PAYMENT_NOT_VERIFIED otherwise); CONFIRM requires
  an ACTIVE doctor with unexpired license; every op audit-logged with the
  verified actor; idempotency key required (UUID).
- SQL: `db/0036_care_appointments.sql` — applied to Cloud, verified live
  (table, overlap constraint, both functions, RLS on).
- Files: `src/lib/care-appointments.functions.ts`, `tests/care-appointments.test.mjs`.
- Tests: 8 pass (entitled BOOK, entitlement/payment blocks, doctor rules,
  double-booking, illegal transitions, terminal immutability, audit, scope).

## Wave 04–07 totals (actual, per file)

admin-bootstrap 5, care-adapters 5, care-finance 29, care-live 1,
content-policy 2, rls-matrix 4, rls-boundary 19, care-relationships 9,
care-catalog 8, care-entitlements 10, care-appointments 8, care-prepaid 15
= **117 pass, 0 fail**.
Typecheck clean (`tsgo --noEmit`), build OK. Types regenerated
(`src/integrations/supabase/types.ts`).

### RLS-boundary test tightening (acceptance correction)

`tests/rls-boundary.test.mjs` COMPLETE case rewritten: a valid-operation
fixture (STARTED encounter, RESERVED hold, terms with
`manual_clinical_enabled`) now proves a positive authorised control — the
assigned doctor completes successfully (encounter COMPLETED, hold CONSUMED).
The low-role case uses an identical fixture so the only failure cause is
authorization, asserted as the exact `ASSIGNED_CLINICIAN_REQUIRED` denial
(not a generic NOT_FOUND/INVALID matcher), with the encounter, hold and
ledger verified unchanged. Denied-DML assertions now use `RETURNING` row
counts instead of driver `affectedRows ?? 0` fallbacks.

### Copy correction (wave audit item)
The editor preview still showed the old "medicines/products" line because the
phase-02 edit landed in `PartnerLanding.tsx` while the preview served a cached
build; verified current source and re-ran the content-policy regression — all
5 locales and metadata are clean of cannabis/PT28/PT33/shop wording.

### Not run (need live infrastructure)
Real Google sign-in, real email delivery, live Stripe events, real Daily
video sessions — all fail closed until configured.

### Rollback
0033–0037 are additive new objects; rollback = DROP of the new tables/functions
(no existing data or behaviour depends on them yet). Not performed.

### Blockers (unchanged)
GitHub connection (owner click), Stripe go-live, care-terms approval, live
switch — all remain off. Journal drift: 0021–0029 were applied outside the
Drizzle migrator, so the migration tool replays old DDL and cannot apply new
migrations; new SQL goes through the reviewed `db/NNNN` file + SQL runner path
with live verification (as for 0030–0037). Safe reconciliation path: owner-
approved baselining of the journal against catalog/hash evidence — not done
blindly.

## Phase 08 — Prepaid package selection and payment UI (2026-10-08) — DONE (purchase path)

Scope delivered: patient-facing prepaid package selection and payment on the
signed-in portal; lot GRANT remains staff/server-driven (unchanged boundary).

- `db/0040_prepaid_purchase.sql` — additive. New
  `public.care_prepaid_purchase(_plan_version uuid)` (SECURITY DEFINER):
  authenticated patient self-scope only (`patients.auth_user_id = auth.uid()`),
  requires linked patient with partner context, APPROVED non-unlimited priced
  plan version and active care terms. Inserts a PENDING `care_payments` row
  (kind DIRECT, collector THAIKANYA) whose trusted snapshot binds
  `plan_version_id` — the later GRANT in `care_personal_command` verifies
  payment ↔ package from that snapshot, never from client input.
  EXECUTE revoked from PUBLIC/anon; granted to authenticated + service_role.
  Applied to Cloud via the SQL runner and verified live
  (anon=false, authenticated=true, service_role=true). Not journal-stamped.
- `src/lib/prepaid.functions.ts` — `purchasePrepaidPackage` (creates the
  pending payment) and `getMyPrepaidBalance` (scoped `care_personal_balance`
  DTO). Both behind `requireSupabaseAuth`; no client-supplied amounts, plan
  data, roles or organisation ids.
- `src/routes/_authenticated/portal.tsx` — new "Prepaid care packages"
  section: approved non-unlimited plan versions as cards (quota or value,
  validity, price), Buy → pending payment → existing native embedded checkout
  (`CareEmbeddedCheckout`, server-decided environment; preview stays sandbox,
  production fails closed). Patient's live prepaid lots with remaining
  count/value and expiry shown above. No shop/product messaging.
- i18n: `portal.prepaid*` keys added to all five locales (en/th/ja/zh-CN/ar).
- Tests: `tests/care-prepaid.test.mjs` +5 (0040): patient purchase binds plan
  in snapshot; stranger without linked patient denied (PATIENT_NOT_LINKED);
  anon denied; draft/unlimited/unknown plans rejected; end-to-end purchase →
  live settlement → staff GRANT → balance shows the lot. Loader
  `tests/care-db.mjs` now applies 0040 after 0039.

Totals: **122 pass, 0 fail** (was 117, +5). Typecheck clean; build OK.
Not run (unchanged): real Google sign-in, email delivery, live Stripe events,
Daily video. Live payments remain gated; sandbox events never settle
economically. Lot GRANT after a PAID live payment is still a staff/server
action — automatic grant on settlement is a future phase, not claimed here.

## Phases 09–30 — PENDING
Awaiting sequential owner submission.

## Phase 09 — Patient booking + care-team workspace (2026-10-08)
- db/0041_care_patient_booking.sql: care_my_catalog (own-org approved versions only) and
  care_patient_book (patient derived from session; org/service/window validated; entitlement =
  active paid membership period OR eligible prepaid lot via care_personal_eligible with
  service/tenant/currency restrictions; REQUESTED + UNPAID + video NONE; audited; idempotency key).
  Applied to Cloud via SQL runner (Drizzle migrator replays drifted 0021–0029); verified live:
  anon EXECUTE = false, authenticated = true for both functions.
- Server fns: bookMyAppointment / getMyBookingCatalog / listMyAppointments (care-appointments.functions.ts);
  care-doctor.functions.ts: listOrgDoctors, listOrgPatients, getPatientHistory (care_history),
  listConsultationNotes, addConsultationNote (partner_id resolved server-side under RLS).
- Portal (/portal): "Book a video session" form + "My appointments" list; join button renders only
  when video_state = READY — Daily video remains a future, fail-closed phase.
- Care team (/doctor): appointment list with CONFIRM/CANCEL/COMPLETE/NO_SHOW via care_appointment_command;
  patient record search; care history; consultation notes; care relationship grant/revoke
  (MFA step-up enforced in the database commands).
- i18n: portal.book*/portal.appointments*/portal.videoNotReady/portal.joinVideo + careTeam.* in
  en/th/ja/zh-CN/ar; nav.careTeam added.
- Tests: tests/care-patient-booking.test.mjs (+7, real roles): own-org catalog only; entitled patient
  books (row scoped, audited); no entitlement → ENTITLEMENT_REQUIRED; stranger → PATIENT_NOT_LINKED;
  anon denied; draft/cross-tenant/unknown versions rejected; past/inverted windows, bad key, key reuse
  rejected. Full suite: 129 pass, 0 fail. Typecheck clean; build OK.
- Unrun (unchanged): real Google sign-in, email delivery, live Stripe events, Daily video.

## Phase 10 — Real sign-in enablement + automatic prepaid grant on live settlement (2026-10-08)
- Auth: Google provider and email/password sign-in verified enabled in Cloud (both were already
  enabled; confirmed idempotently). Email confirmation stays ON (no auto-confirm). The /auth page
  already wires lovable.auth.signInWithOAuth("google") and signUp with emailRedirectTo — no code
  change needed.
- db/0042_prepaid_auto_grant.sql: AFTER UPDATE OF status trigger on care_payments. When a prepaid
  purchase (snapshot.prepaid=true, bound by care_prepaid_purchase) transitions to PAID with
  provider_environment='live', the database itself inserts the care_personal_lots row (COUNT/VALUE
  from the immutable plan version) plus the append-only GRANT ledger entry (idempotency key
  care:auto-grant:<payment_id>). Sandbox payments never grant; non-prepaid payments never grant;
  one lot per payment forever (payment_id UNIQUE); plan missing/not APPROVED/amount mismatch
  records a CARE_PREPAID_AUTO_GRANT_FAILED finance conflict instead of granting or blocking
  settlement. Trigger function revoked from PUBLIC/anon/authenticated. Applied to Cloud via SQL
  runner; verified live (function present, SECURITY DEFINER; trigger present on care_payments).
- Tests: tests/care-prepaid-autogrant.test.mjs (+5, real roles): live settlement auto-grants COUNT
  lot + ledger entry and the patient sees it in the scoped balance DTO; settlement replay does not
  double-grant; sandbox settlement never grants; non-prepaid live payment settles without granting;
  plan mismatch records finance conflict, no lot. Loader tests/care-db.mjs now applies 0042 after 0041.
- Note: care_settle has no role grant (trusted server-only); tests call it as superuser, matching
  the finance suite. The `node --test tests/` directory runner reports a spurious aggregate failure;
  all 14 files pass individually.

Totals: **134 pass, 0 fail** (was 129, +5). Typecheck clean; build OK.
Not run (unchanged): real Google sign-in end-to-end (needs a real Google account in a browser),
email delivery, live Stripe events, Daily video. Live payments remain gated; sandbox events never
settle economically.

## Phase 11 — Private video rooms (0043) — done
- db/0043_care_video.sql applied to Cloud and verified live: video_room_name/video_room_url on care_appointments; care_video_guard blocks direct UPDATE of video fields; care_video_command (OPEN/END/FAIL) is the only path — caller must be the assigned doctor, the organisation's staff, or platform staff; every action writes an audit entry; EXECUTE revoked from PUBLIC/anon.
- Server functions openVideoRoom / endVideoRoom: create the Daily room via DAILY_API_KEY, then record it through care_video_command. Fail closed with VIDEO_PROVIDER_NOT_CONFIGURED when no key is set — no fake join links.
- Patient portal: Join button is a real link only when video_state = READY and a room URL exists. Care team page: Open/End room actions on confirmed appointments.
- i18n: new keys in all five languages (en/th/ja/zh-CN/ar), flattened to the dictionary format.
- Tests: 142 pass, 0 fail (+8 real-role video tests: doctor opens, patient/stranger/anon denied, unconfirmed rejected, double-open rejected, direct UPDATE blocked, END clears link, audit entries). Typecheck clean, build OK.
- Unrun (unchanged): real Google sign-in end-to-end, email delivery, live Stripe events, real Daily room creation (needs DAILY_API_KEY).

## Phase 12 — Prepayment at booking (0044) — done
- db/0044_booking_prepaid_hold.sql applied to Cloud and verified live: care_patient_book now
  atomically RESERVES the earliest eligible prepaid lot (FEFO; COUNT = one session, VALUE = full
  immutable service price) when no active membership covers the visit; payment_state moves
  UNPAID → RESERVED at booking. care_appointment_command settles the hold: COMPLETE captures
  (actor = the assigned, active, licensed doctor, resolved server-side — never client-supplied;
  ASSIGNED_DOCTOR_REQUIRED otherwise), CANCEL / NO_SHOW release (operations/platform actor only).
  Membership-covered bookings never touch the prepaid lot.
- Hold idempotency keys are pure UUIDs derived per (purpose, appointment) via the new
  service_role-only care_derived_key(tag, id): a retried booking or repeated transition replays
  the original ledger entry instead of double-spending. All ledger writes stay inside the 0038
  server-only 4-arg care_personal_command; the appointment guard's terminal-state immutability is
  preserved by settling state and payment_state in a single UPDATE within one transaction.
- Ordering constraints discovered and honoured: the ledger CAPTURE requires state COMPLETED first;
  RELEASE requires state CANCELLED/NO_SHOW first; the appointment guard forbids any write after a
  terminal state — so each transition is one UPDATE plus one ledger call in one transaction.
- Tests: tests/care-booking-hold.test.mjs (+8, real roles): atomic reserve at booking; capture on
  COMPLETE consumes exactly once; CANCEL and NO_SHOW release back; conservation across the ledger
  (granted = used + available, zero net reserved); derived-key replay cannot double-reserve;
  cross-org stranger denied with appointment untouched; exhausted balance refused
  (ENTITLEMENT_REQUIRED / NO_ELIGIBLE_LOT); membership-covered booking leaves the lot untouched.
  tests/care-patient-booking.test.mjs updated for the new RESERVED payment_state.

Totals: **150 pass, 0 fail** (was 142, +8). Typecheck clean; build OK.
Not run (unchanged): real Google sign-in end-to-end, email delivery, live Stripe events, real
Daily room creation (needs DAILY_API_KEY). Live payments remain gated; sandbox events never
settle economically.

## Phase 13 — Appointment clinical notes (done 2026-10-08)
- db/0045 care_clinical_notes: one note per appointment (UNIQUE appointment_id), DRAFT → FINAL, guard trigger blocks updates to FINAL notes and all deletes; care_clinical_command (START/SAVE/FINALIZE) is the only write path — assigned active-licensed doctor only, START requires CONFIRMED appointment, FINALIZE requires assessment + plan; START/FINALIZE drive appointment clinical_state (NONE → IN_PROGRESS → COMPLETED); every action audit-logged; care_clinical_read scoped to patient / assigned doctor / org staff / platform.
- Applied to Cloud via SQL runner, verified live (care_note_doctor: service_role only; command/read: authenticated).
- UI: care-team page notes editor (start/save/finalize, locked after finalize); patient portal read-only view of finalized notes (assessment + plan). All 5 locales.
- Tests: 157 pass / 0 fail (+7 real-role tests: start/save/finalize flow, incomplete finalize refusal, non-assigned/stranger/staff/anon denial, non-confirmed refusal, read scoping, audit entries). Typecheck clean, build OK.

## Phase 14 — Follow-up plans (done 2026-10-08)
- db/0046 care_followups: SCHEDULE (assigned active-licensed doctor, COMPLETED appointment only, future due date, instructions required) → DONE/CANCELLED (terminal, guard trigger); no deletes; every action audit-logged; read scoped to patient / assigned doctor / org staff / platform. care_note_doctor granted to authenticated (read-only STABLE lookup needed by the read policy).
- Applied to Cloud via SQL runner. UI: care-team page schedules follow-ups on completed appointments and lists them per patient with Done/Cancel; patient portal shows "My follow-ups". All 5 locales.
- Tests: 164 pass / 0 fail (+7 real-role tests). Typecheck clean, build OK.

## Phase 15 — Appointment documents (DB done 2026-10-08; UI pending)
- db/0047 care_appointment_documents: one visit summary per appointment, DRAFT→ISSUED via care_document_command (assigned doctor only, requires completed clinical state, title+body required); issued documents immutable, no deletes; issuing drives appointment document_state to FINAL; every action audit-logged; read scoped to patient / assigned doctor / org staff / platform.
- Guard fix: care_appointment_guard now allows same-state updates (side-channel changes on terminal appointments no longer raise APPOINTMENT_ILLEGAL_TRANSITION).
- Applied to Cloud via SQL runner (Drizzle migrator replays old DDL — known journal drift); policy verified live.
- Tests: 170 pass / 0 fail (+6 real-role tests). Typecheck clean, build OK.
- NOT done: portal/care-team UI for documents — next turn.

## Phase 15 UI — visit summaries (2026-10-09)
- src/lib/care-documents.functions.ts: getAppointmentDocument (RLS-scoped read) +
  draft/save/issue server fns wrapping care_document_command (client sends intent only).
- Care team page: on a COMPLETED appointment the assigned doctor can create, save and
  issue the visit summary; issued summaries are locked (database guard). Clear errors
  for DOCUMENT_INCOMPLETE and CLINICAL_NOT_COMPLETED.
- Patient portal: issued visit summary shown read-only under the appointment's note.
- i18n keys added in en/th/ja/zh-CN/ar (flat keys).
- Verified: 171/171 node tests, typecheck clean, build OK.

## 2026-10-16 — i18n completeness + partner credit lifecycle audit
- i18n root cause: landing, care workspace, MFA and history used a Thai/English-only `c(th,en)` helper, so ja/zh-CN/ar fell back to English. Replaced with `useCopy()` (src/i18n/index.tsx) backed by src/i18n/copy.json (all strings in th/ja/zh-CN/ar), translated demo integration labels, statuses, reset button and demo errors; added missing nav keys. Test: tests/i18n-coverage.test.mjs. Browser-checked /, /care-demo, /auth in th/ja/zh-CN/ar (Arabic dir=rtl).
- Credit lifecycle (care_command): reserve on ACCEPT, consume once on COMPLETE, release on CANCEL/TECHNICAL_FAILURE, DIRECT never deducts, last-unit races fail closed, per-key + row-lock idempotency — already correct. Fixed: intake now validates coverage (INVALID_COVERAGE / ANNUAL_MEMBERSHIP_REQUIRED / DIRECT_PAYMENT_REQUIRED / WRONG_ENCOUNTER_KIND); every reserve/consume/release writes audit_log `COVERAGE_*` (entity care_coverage) with coverage, units, credit and annual balance before/after, reason, reference, actor, idempotency key. db/0048_care_credit_lifecycle_audit.sql; applied to Cloud via SQL runner (anchor-patch of live definition), verified. Tests: tests/care-credit-lifecycle.test.mjs (9). Suite 185/185.
- Open decision: partner-sponsored Annual Care reserves BOTH one entitlement and one partner credit (existing design, matches the 6,000 − 4,800 reconciliation model). Not changed pending owner confirmation.
