# Configurable SLA and operational escalation review

## Delivered
- `/sla`: scoped Admin queue, warning/breach counters, state filter, operational owner assignment, reason-required pause/resume and escalation acknowledgment, policy version proposal/submission/independent approval/rejection, maintenance windows and append-only timeline.
- `/sla-health`: Superadmin aggregate totals only; no organization names, individual cases, policy reasons, actors, timeline, customer details or document contents in this response.
- `/system-health`: Superadmin-only observed catalog/RLS status, private certificate bucket status, storage policy count, disabled outbox/provider state, schema version and last recorded health-check time. Test timestamps remain **not verified** rather than being invented. Migration field explicitly distinguishes catalog presence from ledger attestation.
- Existing Admin/Superadmin dashboards link to the new SLA views; existing preview consoles are preserved.
- Policy scope is derived from the authenticated actor and existing `partner_review_scope`; a branch must actually belong to the selected organization. No client-supplied identity confers authority.
- Eight configured queues: Partner review, requested missing documents, pending/suspended Doctor assignment, consultation queue, manual MCS handoff, certificate review, manual-review sources and overdue follow-up.
- Each policy version stores effective dates, warning/breach minutes, business/calendar mode, timezone, configured working days/hours, escalation level, owner role, suppression and maintenance windows, reason and reviewer. Approved/rejected versions cannot be changed or deleted; overlapping approved effective windows in the same scope are rejected.
- Policies are not seeded with invented deadlines. Unconfigured work is `manual_review`, not falsely on track. Source episodes pin their policy version; configuration approval alone never changes an existing case's clock.
- Calendar/business clocks clip exact intervals, respect configured weekdays/timezone and subtract the union of pauses/maintenance without double-counting. Suppression prevents outbox events but does not hide a breach. Warning/breach event identities are stable and duplicate scans do not enqueue twice.
- Operational reassignment checks current role/organization, and for Doctors checks active Doctor/branch assignment. It changes only SLA ownership—not clinical assignment, credit holds or workflow state.
- Internal reminders use the existing immutable state-only `sla_reminder` template and disabled outbox. No external delivery, providers, APIs, MCS connection, payments, publishing, production test accounts or test fixtures were enabled/created.

## Database changes confirmed by Lovable Cloud
- `db/0062_operational_sla.sql` applied as `drizzle/migrations/0045_operational_sla_control_plane.sql`; byte-for-byte source comparison passed.
- `db/0063_sla_explicit_private_grants.sql` applied as `drizzle/migrations/0046_sla_explicit_private_grants.sql`. Explicit revocation was needed because the live default privileges included broader access than the initial explicit grants.
- Final live catalog: all six new tables have RLS; anon SELECT=false and authenticated INSERT=false on every new table. Private helper execution is denied to anon. Authenticated users access commands/read projections; direct writes are not granted.
- No existing migrations were reset, squashed, deleted or rewritten. No existing data or RLS protections were removed.

## Changed files
- New: both canonical SQL files above; `src/lib/operational-sla.types.ts`, `src/lib/operational-sla.functions.ts`, `src/components/SlaConsole.tsx`; three protected routes above; `tests/operational-sla.test.mjs`.
- Updated: `src/components/AppShell.tsx`, `src/components/OperationsConsole.tsx`, `tests/request-lifecycle.test.mjs`, `tests/certificates.test.mjs`, `AGENTS.md`, `roadmap.md`.
- Cloud regenerated its database types and migration journal; these were not manually edited.

## Verified results
- Full Node suite: **268 tests, 267 passed, 0 failed, 1 optional independent-PostgreSQL concurrency test skipped**.
- Separate file/export/disabled-worker suite: **6 passed, 0 failed**.
- New actual-role SLA tests: calendar/business/weekend math, overlapping excluded intervals, cross-organization/branch isolation, role forgery denial, independent approval, overlapping version rejection, immutable approved policy, duplicate scan/command idempotency, breach reminder deduplication, pause/resume, acknowledgment, reassignment denial, redacted aggregates, immutable timeline, maintenance/source resolution, suppression and exact grants.
- Existing request/credit and certificate tests load the SLA schema and continue passing. SLA tests confirm no holds/revisions are created by SLA commands.
- Automatic typecheck/build: `build OK` observed at **2026-10-20 05:39:39 UTC**; manual typecheck/build commands were not run because the environment performs them automatically.
- Public/signed-out preview checks: `/`, `/auth`, `/partner-apply`, `/sla`, `/sla-health`, `/system-health`, `/notifications`, existing `/preview/admin`, `/preview/superadmin`, `/preview/doctor`; no page errors. All protected new views redirected signed-out users to `/auth?signup=false`.

## Limits and prerequisites for review
- **Signed-in browser flow remains unverified:** the session service found no account matching the requesting user's email. No other user was selected; no production account/records were fabricated. Sign in with an authorized account in the preview to enable this check.
- Clocks are evaluated explicitly using “Evaluate clocks”; no scheduler or external cron was connected. Pause/resume and maintenance affect SLA accounting only, not clinical workflow availability. No global shutdown gate was introduced.
- Approved business hours currently support same-day working windows; overnight hours are rejected. No holiday calendar is invented. Dates entered in the browser use its local timezone, while business-hour math uses the policy timezone.
- Pending Doctor rows need an existing organization/branch association; globally unscoped recruitment rows have no invented tenant. Follow-ups without a stored branch use organization scope. Missing-document clocks follow the authoritative `NEED_MORE_DOCUMENTS` state, not an invented legal checklist.
- Existing episodes pin the policy observed when opened, including no-policy manual review; later policy approval does not silently rewrite history. Unscoped applications require existing onboarding review scope before an organization-specific SLA can apply.
- SLA queue shows the first 100 prioritized cases and latest 200 timeline entries; retained history is not deleted. Policy/maintenance forms use current Thai/English operations conventions; operational codes remain identifiers.
- Health exposes observed schema version/catalog presence, not a fabricated migration hash or test attestation; storage policy count is not presented as a security audit result.