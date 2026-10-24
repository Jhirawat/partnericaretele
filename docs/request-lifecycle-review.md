# Consultation request lifecycle review — 2026-10-20

## Delivered
- `/requests`: RLS-scoped Partner/Admin/assigned-Doctor queue, state filter, draft/submission, queue/accept, scheduling, start/complete, cancellation/rejection/manual review and history.
- States: draft, submitted, queued, accepted, scheduled, in_consultation, completed, cancelled, rejected, manual_review.
- All-PASS intake and recorded consent before submission; active licensed Doctor, active organization/branch and matching assignment revalidated for queue/start/complete and assignment changes.
- Existing `care_command` reserves on queue or acceptance, releases before consultation, consumes once on completion. ANNUAL uses only Annual entitlement, DIRECT stays isolated. No economic mathematics changed.
- Additive permission extension lets scoped Operations Admin handle request-linked queues; no global authority added. Reviewer actions retain MFA.
- Existing intake submissions automatically appear in the request queue. Existing care-command actions synchronize request state and cannot bypass active assignment checks. Old records are not backfilled or rewritten.
- Events retain actor, reason, timestamp and correlation ID; underlying coverage audit retains balance/source effects. Request/events are read-only to clients; event/operation history append-only.

## Files
- `db/0053_consultation_request_lifecycle.sql` canonical test source.
- Cloud confirmed `drizzle/migrations/0036_consultation_request_lifecycle.sql`; identical SQL apart from trailing newline. Ledger hash `ead86f8060b72a285c104a21038e917768ede2ea0d70cbc769c17c53d20e4089` verified.
- `src/lib/request-lifecycle.schema.ts`, `src/lib/request-lifecycle.functions.ts`, `src/components/RequestWorkspace.tsx`, `src/routes/_authenticated/requests.tsx`, navigation in `src/components/AppShell.tsx`.
- `tests/request-lifecycle.test.mjs`, `tests/care-db.mjs`, `AGENTS.md`, `roadmap.md`. Cloud regenerated database types.

## Verified
- Full suite: 234 tests, 233 pass, 0 fail, 1 skip. The skip is optional independent PostgreSQL test when its local database is absent.
- Separate isolated PostgreSQL 17 run: 11 tests, 11 pass, 0 fail, 0 skip. Two independent sessions were observed waiting on a held partner lock; releasing it allowed exactly one reservation and rejected the other with INSUFFICIENT_CREDITS. Cancellation restored the credit. The temporary server was stopped.
- Actual authenticated-role tests cover failed screening/consent, cross-organization denial, assignment revocation, duplicate actions/keys, cancellation/rejection release, exactly-once completion, existing command synchronization and Annual/DIRECT isolation.
- Cloud: three new tables, RLS enabled, two read policies and command present; request count zero after migration. No production fixture data created.
- Automatic typecheck/build: latest harness entry build OK after types regeneration.
- Browser: `/partner-apply`, `/auth`, `/requests` signed-out redirect and `/preview/partner` verified; no runtime errors.

## Limitations and remaining approval gates
- Signed-in browser central flow NOT VERIFIED: safe session mint for the requesting user reports no matching account. No account was selected or created on their behalf.
- No real screening rules were invented or activated. Existing clinical start/completion approval remains fail closed; production active manual_clinical_enabled was absent at verification.
- No video room, MCS, external API, payment, notification or publishing action was performed.
- Scheduling stores a future timestamp and rejects identical Doctor/start-time collisions among new active requests. It does not invent a session duration or guarantee availability across legacy appointment systems; a duration/availability scheduling policy is not supplied in this block.
- Queue and history reads are bounded (300 requests, 1000 events); no full-history export added.
- Thai-first labels use the existing intake locale convention, English fallback for other locales; historical clinical/audit data unchanged.

## Re-run independent concurrency test
Start a disposable PostgreSQL server on localhost, create an empty database named `request_isolated`, then set `REQUEST_TEST_DATABASE_URL` to that local database and run `node --test tests/request-lifecycle.test.mjs`. The runner refuses any other hostname/database name. This runner creates synthetic schema/roles and must never target an application database.