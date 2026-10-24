# Notification event and outbox framework

## Delivery
- `/notifications`: private inbox, unread filter, read/unread controls, redacted previews, per-event preferences and history. Scoped Admin/Superadmin outbox controls suppress/retry/manual review; source authorization is rechecked, not inferred from route or client role.
- Eight approved event families use immutable template version 1 and state-only payloads. No customer names, medical data, reasons, document contents, private paths, links, contacts, credentials or secrets enter notification payloads.
- Authoritative application/request/handoff/certificate event inserts and Doctor audit inserts populate the outbox transactionally. Manual-review intake and actual negative credit-lot anomalies are scoped to reviewers.
- Deterministic event/recipient keys avoid duplicate enqueue; command keys and row/advisory locks prevent duplicate actions. Retry requests are limited to three with 60/120/240-second eligibility delays; the third goes to manual review. These are operator requeue counts, not claims of attempted external delivery.
- Preferences suppress new and pending queued notifications. Retry cannot override preferences or revoked recipient scope. Templates are an immutable function registry, not ordinary-user editable rows.
- Overdue reminders are explicitly evaluated against existing scheduled times; no SLA threshold is invented. No cron or provider was configured. A future approved worker must recheck scope/preferences before sending. `sent_placeholder` and `failed` are reserved states; this disabled phase never claims delivery or fabricates failures.
- New worker and existing legacy dispatcher are no-op. No email/SMS/push/webhook/messaging, MCS, payment, notification provider or publishing action was performed.

## Applied database changes
- Canonical `db/0059_notification_outbox.sql` → Cloud-confirmed `drizzle/migrations/0042_private_operational_notification_outbox.sql`.
- `db/0060_notification_explicit_private_grants.sql` → Cloud-confirmed `0043_notification_explicit_private_grants.sql`.
- `db/0061_notification_anomaly_capture.sql` → Cloud-confirmed `0044_notification_scoped_anomaly_capture.sql`.
- All four new tables have RLS. Final live catalog verified no anon SELECT and no authenticated INSERT; enqueue and anon command execution denied. Existing data/history was not reset, rewritten or removed.

## Application files
- New: `src/lib/notification-outbox.types.ts`, `notification-outbox.functions.ts`, `src/components/NotificationCenter.tsx`, `src/routes/_authenticated/notifications.tsx`.
- Updated: `src/components/AppShell.tsx`, `src/lib/notifications.server.ts`, `AGENTS.md`, `roadmap.md`.
- Tests: new `tests/notification-outbox.test.mjs`, `notification-worker.test.ts`; existing request-lifecycle and certificate suites now load notification triggers to verify unchanged economic/file rules with capture active.

## Verified results
- Final full Node suite: 260 tests, 259 passed, 0 failed, 1 optional independent-PostgreSQL concurrency test skipped.
- Bun file/export/worker checks: 6 passed, 0 failed.
- Actual authenticated/anon-role checks exercise organization isolation, Doctor identity/revocation, immutable records, preference suppression, invalid argument rejection, redaction, duplicate keys and bounded retries.
- Request lifecycle and certificate suites passed with new triggers active, preserving exactly-once credit/entitlement and private-file rules.
- Automatic typecheck/build: latest observed `build OK` at 2026-10-20 05:24:06 UTC. No manual build/typecheck was invoked.
- Browser checked `/`, `/partner-apply`, `/auth`, `/notifications`, `/notifications?manage=true`, and existing Admin/Superadmin/Doctor preview consoles: no page errors; both notification URLs redirected signed out to `/auth?signup=false`.

## Limitations
- Signed-in inbox/control/browser flow remains unverified: managed session mint failed because no auth user matches the requesting user's email. No other account was selected and no production test user/records were created.
- Inbox displays the newest 100 matching records and total count; history remains retained in the database.
- New operational controls use Thai/English copy, matching current operations conventions; state codes remain operational identifiers.
- No external delivery can be tested in this phase because it is intentionally disabled.