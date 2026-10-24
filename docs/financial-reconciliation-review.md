# Internal financial controls — verified review

## Delivered
- `/credit-reconciliation`: scoped organization/branch and period selection; opening, grants, reservations, releases, exactly-once consumption, calculated expiration, lifecycle adjustments and closing balances, with Partner, Annual and DIRECT separated.
- `/credit-health`: redacted aggregate snapshot/adjustment counts for global Superadmin. Explicit financial organization selection is permitted to global Superadmin by the existing role boundary; ordinary Operations Admin is limited to its active organization. No health/customer identity is included.
- Immutable reporting snapshots and fingerprint; repeated unchanged scope/period snapshots reuse evidence. Independent clear-period close rejects pending adjustments, observed exceptions, already-closed snapshots and changed report fingerprints. Acknowledgment does not repair or erase exceptions.
- Immutable adjustment proposals, verification events, independent approval/rejection, approved compensating entries and new independently reviewed reversal proposals. Reason, evidence reference, verifier method, actor, approver, time and correlation are retained. Current role/scope is rechecked on idempotent retry.
- Adjustments are **internal reporting/control entries only**; they do not change spendable Partner credits, Annual entitlements, external payment balances or consultation consumption. DIRECT adjustments are denied. Existing economic reversal remains governed by the existing care workflow and is not exposed by this control-ledger action.
- Existing shared organization pools are not manufactured into branch wallets: branch reports show branch movements only; organization-wide grants/expirations remain in the organization report. Source adjustments require organization-pool scope.
- Exceptions: negative availability, orphan reservations/missing reserve posting, duplicate consume, cancelled/failed/no-show reservation missing release, ledger/counter mismatch, expired Annual entitlement mismatch. Reconciliation is observational; no automatic repair.
- Redacted snapshot JSON exports use current authorization and immutable captured data. Export includes only financial source/reference, quantity, action, request/correlation references and times; approved adjustment evidence includes actor/approver IDs but not free-text reason/evidence references. No patient names/contact/health data, clinical text, certificates/files, private links, secrets or payment credentials.
- State-only financial anomaly/approval events use existing approved credit-anomaly template, current financial source scope, private in-app queue/preferences and disabled external worker. Audit events use the existing append-only redacted viewer.

## Applied Cloud changes
- `db/0066_financial_reconciliation.sql` = `drizzle/migrations/0049_internal_financial_reconciliation.sql`.
- `db/0067_financial_explicit_private_grants.sql` = `drizzle/migrations/0050_financial_explicit_private_grants.sql`.
- `db/0068_financial_projection_defence.sql` = `drizzle/migrations/0051_financial_projection_defence.sql`.
- Cloud confirmed all three applied; generated types refreshed by Cloud. Final live catalog: five new tables RLS=true, anon SELECT=false, authenticated INSERT=false. All inspected financial RPC/private ledger functions deny anon EXECUTE. Explicit grant hardening was necessary because the live deployment initially supplied broader default privileges; RLS stayed enabled throughout and no write policies were granted.
- Existing ledger histories, balances and workflows were not rewritten; no database reset, history squash/delete, RLS disablement, production fixtures, integration connection or publishing.

## Files
- New: SQL files above, `src/lib/financial-reconciliation.types.ts`, `src/lib/financial-reconciliation.functions.ts`, `src/components/FinancialReconciliation.tsx`, `src/routes/_authenticated/credit-reconciliation.tsx`, `credit-health.tsx`, `tests/financial-reconciliation.test.mjs`.
- Updated: AppShell navigation, `AGENTS.md`, `roadmap.md`; request-lifecycle, privacy-lifecycle and certificate tests load the final financial definitions. Request tests assert Partner closing equals the existing balance, exactly one Partner and Annual consume, Annual closing=11 after one use, DIRECT closing=0 and no anomalies in the valid lifecycle.

## Verified
- Full suite: **289 Node tests total: 288 passed, 0 failed, 1 optional independent PostgreSQL contention test skipped**.
- Separate certificate-byte, export-redaction/formula and disabled-worker checks: **6 passed**.
- Financial actual-role focused suite: **9 passed**, including the final repeated-snapshot assertion. Existing request/credit concurrency/idempotency, privacy, certificates and populated history protections passed with the financial migrations loaded.
- Automatic typecheck/build: latest observed **build OK, 2026-10-20 06:26:35 UTC**. No manual build/typecheck was run; the environment performs these automatically.
- Browser: `/credit-reconciliation`, `/credit-health`, `/privacy` redirected signed-out users to `/auth?signup=false`; `/partner-apply`, `/auth`, `/preview/admin`, `/preview/superadmin`, `/preview/doctor` rendered without page errors. Screenshot confirmed the protected sign-in state.

## Limitations / not claimed
- **Signed-in end-to-end remains unverified:** session minting for the requesting user reports no matching account. No alternate account was selected; authorized preview sign-in is required for real reconciliation → proposal → independent approval → export click-through.
- These are internal reporting adjustments, not economic credit grants/debits. Annual/Partner spendable balances are deliberately unchanged to satisfy this block's no-balance-change constraint. No provider financial reconciliation or bank statement import exists.
- Period data uses supplied timezone-aware timestamps and `[from,to)` boundaries; user-selected daily or longer periods, maximum 366 days. No automatic scheduled daily close or invented financial threshold.
- Exception evidence is current authoritative state at capture, not a reconstructed historical anomaly state. Immutable snapshot fingerprints are deterministic for identical source/capture state, not guaranteed unchanged after underlying source states change. Close is a review marker, not a lock preventing future care activity or later compensating records.
- Reports display at most 500 movements; totals use all movements and `entry_count`/`complete_export` identifies truncation. Console limits: 50 snapshots, 100 adjustments/events/entries. No full paginated statutory accounting export is claimed.
- Legacy pre-lot purchases, disputed/refunded membership state and malformed historical data can require manual reconciliation; unexplained available-balance differences are exceptions and must block close, never be silently repaired. No historical entitlement provenance is fabricated.
- Fingerprints are deterministic MD5 change detectors, not cryptographic signatures or external attestations. Evidence reference and verifier method are operator attestations; no automated document verification/provider access.
- Negative balances and duplicate consumption are primarily prevented by existing constraints and transactional care commands; detection additionally exposes historically inconsistent records. No production data corruption was used to test anomalies.
- Partner credits remain distinct from DIRECT coverage; Annual Care stays on its entitlement. Required health/certificate/privacy histories are retained and tested, not included in financial exports.