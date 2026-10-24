# Incident & rollback runbook (release readiness)

Safe, non-destructive steps only. Never publish, reset, squash, delete or rewrite migrations, disable RLS, or connect providers from this runbook.

1. **Announce** — global Superadmin/Operations admin turns on the maintenance banner in `/release-readiness` with a reason (append-only event, correlation ID recorded).
2. **Contain** — external delivery, payments and MCS remain disabled by code (`disabledOutboxWorker`, MCS adapter `MOCK`). Do not enable them to "fix" an incident.
3. **Roll back code** — restore a previous version from project history. Database schema is never rolled back by deleting migrations; schema fixes are new additive migrations.
4. **Repair data** — only via compensating entries (financial reconciliation) or existing JWT-derived commands. Ledgers, certificates, audit and privacy histories are immutable.
5. **Verify** — run smoke checks; record a new sign-off version for each affected checklist item. Sensitive items need a second, different reviewer.
6. **Close** — turn the banner off with a reason.

Signed-in flow checks stay **blocked** until a real authorized test account exists; they are never reported as passed.
