# Operations consoles — verified results

## Delivered
- `/admin-console`: organization-scoped queues for Partner applications, document review/missing primary licenses, Doctor recruitment/assignments, consultation requests, manual intake review, handoffs, certificates and credit reconciliation/anomalies.
- `/superadmin-console`: active global SUPER_ADMIN only; aggregate organization health, consultation state counts, completed funnel stage, busy requests versus active assignments, document expiry, backlogs and coverage summaries. No customer names, patient IDs, screening evidence, clinical notes, document paths, links or files in aggregate responses.
- `/audit`: scoped audit projection, filters, 50-row pagination, current-page CSV export, numeric before/after allowlist, free-text reason redaction, validated correlation/target references and integrity fingerprints. Existing legacy audit endpoint now uses the same redacted projection.
- Filters stored in the URL: organization/Partner (same tenant boundary), branch, Doctor ID, dates, request/handoff/certificate/coverage status, queue kind and status; audit actor/action/target filters. Work queues link to existing independently permission-checked workspaces.

## Changes
- `db/0057_operations_console.sql`, `db/0058_operations_evidence_private_grants.sql`.
- Cloud confirmed `drizzle/migrations/0040_operations_console_audit_integrity.sql` and `0041_operations_evidence_private_grants.sql` applied; generated types refreshed.
- `src/lib/operations-console.types.ts`, `src/lib/operations-console.functions.ts`, `src/components/OperationsConsole.tsx`.
- Protected Admin/Superadmin route files, existing audit route, AppShell navigation, legacy `listAuditLog`, AGENTS.md and roadmap.md.
- Tests: `tests/operations-console.test.mjs`, `tests/operations-export.test.ts`.

## Verification
- Full Node suite: 251 passed, zero failed, one optional isolated PostgreSQL concurrency test skipped (252 total).
- Focused workflow/security suite: 77 passed, zero failed, one optional concurrency test skipped (78 total).
- New actual-role SQL tests: six passed, with authenticated/anonymous role switching and JWT subject; Admin A cannot read B, Partner/Doctor cannot use consoles, scoped Admin cannot use Superadmin, revoked role denies access, redaction/filter/integrity tests and unchanged credit/document protections.
- Certificate file tests: two passed. Spreadsheet export tests: two passed.
- Automatic typecheck/build: build OK after correcting navigation types and schema-generated RPC typing.
- Public `/`, `/partner-apply`, `/auth` and unchanged `/preview/admin`, `/preview/superadmin` rendered; signed-out console/audit routes redirected to sign-in; no browser page errors.

## Limitations
- Signed-in browser flow and visual console layout remain unverified: the requesting user's email has no matching app account; no alternate identity or production fixtures were created.
- SLA thresholds were not supplied. Queues show elapsed hours and actual overdue scheduled/expiry dates; no invented breach threshold. Busy requests / active assignments are workload counts, not a fabricated utilization percentage.
- Financial summaries are lifetime organization coverage counts; date/branch/Doctor filters apply to operational rows, not the organization's wallet. Credit anomalies flag unreconciled models and inconsistent lot units; no new financial settlement logic.
- Historical audit roles/branches/correlation values that were never recorded remain absent. Reasons are redacted rather than claimed safe. Fingerprints establish a baseline at installation, not proof of pre-installation history; database-owner tampering with both records and evidence is outside this guarantee.
- System status does not claim live provider readiness: payment readiness is unverified; no external service was called or enabled. No publish.
