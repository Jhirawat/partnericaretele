# Partner customer intake — review

## Delivered
- `/partner-customers`: non-login customer create/edit, immutable organization/branch attribution, four screening gates, explicit persisted PASS/FAIL, reason/evidence, consent capture reference, request queue, emergency/manual-review entries, rejection and audit history.
- Authorized assigned clinicians or compliance staff publish immutable organization configuration versions with MFA. Ordinary Admin/Partner cannot publish clinical lists.
- No clinical lists or approvals were fabricated; until configured, requests fail closed.
- All-PASS requests create the minimum existing consultation using `care_command('INTAKE')`. It does not reserve credits or call external services. Acceptance/settlement remain unchanged.
- New enrolled customers cannot be linked to login accounts; historical patient records and existing financial flows retain prior behavior.
- Staff require explicit branch queue permission; owner/manager access covers active branches in their organization. Scoped Admin sees only its organization; Doctor access requires a specific assigned consultation and current active branch assignment/role.

## Files
- `db/0051_partner_customer_intake.sql`, `db/0052_partner_intake_evidence_guards.sql`: canonical isolated-test sources.
- Cloud-confirmed `drizzle/migrations/0034_partner_customer_intake.sql`, `0035_partner_intake_evidence_guards.sql`; tool-managed journal/snapshots and generated types updated. Prior migrations untouched.
- `src/lib/partner-intake.schema.ts`, `partner-intake.functions.ts`, `partner-intake.copy.ts`.
- `src/components/PartnerIntakeWorkspace.tsx`, `src/routes/_authenticated/partner-customers.tsx`, navigation in `src/components/AppShell.tsx`.
- `tests/partner-intake.test.mjs`, loader in `tests/care-db.mjs`; architecture rule in `AGENTS.md`, roadmap and project requirements memory.

## Verification and limits
- Actual `anon`/`authenticated` roles with JWT claims exercised in isolated PostgreSQL; synthetic fixtures only.
- Covers scope, non-login identity, configuration authority/MFA, unconfigured gates, red flags/escalation, consent refusal/evidence, age/guardian/jurisdiction, exclusions/history, operational readiness, retry idempotency, no intake credit effects, immutable audit/evidence, assignment revocation and stale configuration.
- Browser verified `/partner-apply`, `/auth`, protected `/partner-customers`, `/partner-review`, `/doctor-recruitment` signed-out redirects and preserved `/preview/partner`; no runtime errors.
- Signed-in browser create→screen→request→read-back remains **unverified**: `auth-session --self` cannot find the requesting user's account; ordinary mint reports multiple accounts, which cannot be selected without approval. No production test records or accounts were created.
- Consent and factual screening evidence are staff-recorded attestations, not independently verified customer signatures or diagnosis. Any inaccurate staff entry still requires clinical review; no automatic clinical approval exists.
- New UI follows existing Thai/English copy conventions; other locales use the established English fallback.
- Manual escalation is stored in the intake event/queue, not sent externally. Notifications, payments, MCS and publishing remain off/unchanged.