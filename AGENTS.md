<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- Agent integrations: MCP server at /mcp, protected by app sign-in (OAuth); tools live in src/lib/mcp — why: tools run as the signed-in user so database access rules apply
- Partner onboarding uses private application/document/event records and a JWT-derived, row-locking transactional command; approval alone provisions organization, branch and Partner owner membership, because applicant metadata must never confer authority.
- Onboarding copy is isolated from core-care copy and uses the existing locale context with Thai labels and English fallback, because the onboarding category exception must not widen public clinical or sales content.
- Existing enum roles remain authoritative; global staff requires a null tenant scope and scoped operations access requires a matching organization, because presentation labels must not introduce parallel role authority.
- Doctor recruitment, verification, organization/branch assignment and availability go only through the JWT-derived `doctor_command` (db/0050, Cloud copy drizzle 0032); assignment tables are read-only to clients, because Partner roles must never recruit/approve doctors and scope must be enforced in the database.
- Partner intake uses read-only scoped customer associations, immutable configuration versions and a JWT-derived transactional command; enrolled customers require a four-PASS assessment before the existing financial INTAKE command, because clinical configuration and credit settlement must remain separate.
- Consultation requests use a separate scoped state machine synchronized with existing care consultations; all economic operations delegate to care_command, because request presentation must not duplicate entitlement or ledger mathematics.
- Manual MCS handoff (db/0054, /mcs-handoff) stores only operator-entered case IDs and links; no code path may call MCS automatically or fabricate identifiers, because the MCS contract is unverified and the adapter stays in MOCK mode.
- Certificate files use immutable revisions in private storage; JWT-derived commands enforce completed-case scope, review and manual forwarding, while the authenticated server validates bytes before privileged storage upload, because client metadata cannot prove file validity or confer access.
- Operations consoles use JWT-derived database projections with explicit existing review scope, aggregate-only Superadmin responses, and a numeric allowlisted audit export; immutable audit fingerprints baseline historical rows without rewriting them, because dashboard authority and privacy cannot rely on client filtering.
- Operational notifications are transactionally captured from authoritative workflow events, with current source-scope checks, immutable state-only payloads and JWT-derived commands; templates are a versioned database registry and external workers remain no-op, because recipient authority and delivery approval cannot come from client data or credentials alone.
- SLA policies use independently reviewed immutable effective versions and JWT-derived operational commands; source episodes pin versions and interval-union clocks exclude pauses/maintenance, because operational escalation must not mutate clinical assignment or credit settlement.
- Privacy uses scoped independently approved requests and immutable consent/retention events; operational identity overlays preserve raw shared clinical/accounting records, because data-lifecycle actions must not rewrite authoritative history or confer global access.
- Financial reconciliation normalizes existing source ledgers and appends independently approved reporting-only compensating entries; shared pools are never allocated as branch wallets, because controls must not change spendable balances or consultation consumption.
- Release readiness (db/0069) keeps append-only versioned sign-offs with independent second approval for sensitive items and count-only smoke checks; release evidence (db/0070) is an append-only redacted registry that never changes sign-offs or claims readiness, because release proof must come from independent human sign-off.
- Subdirectories have their own `AGENTS.md` (e.g. src/lib for SEO/QA rules); read it before changing files there.
- Release drills (db/0072) are simulation-only on frozen synthetic state; backup (db/0073-0074) and protection (db/0075) evidence registers are append-only versioned redacted manual metadata that pass only after a different signed-in reviewer confirms the latest version, each a publish-gate hard blocker, because release proof must never be inferred or self-approved.
- Production test prerequisites use closed-vocabulary metadata and separate immutable independent reviews on the latest version; availability never executes or passes campaign checks, because credentials and readiness authority must not be inferred from an attestation.
- Final release bundles capture only allowlisted readiness structural metadata into immutable snapshots; independent assembly confirmation never grants source readiness, because release authority stays with authoritative source reviews.
