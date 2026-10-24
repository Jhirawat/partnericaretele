# Manual certificate / ภท.33 document workflow

## Delivered
- `/certificates`: scoped completed consultation records, private upload/replacement, Admin review/reject/manual review, reviewed release to Partner or authorization for manual customer handover, private download and document history.
- No medical certificate generation or automatic issuance. No delivery messages, external integrations or publishing. Customer records remain non-login.
- Authorized active assigned Doctors or scoped Admins upload. Only scoped Admins review and release. Partners only read the current version after reviewed release to their organization/branch.
- Replacement preserves every old revision, removes Partner access and resets review. Rejection/manual review withdraws release. Previously downloaded copies cannot be recalled; signed download URLs expire after 60 seconds.
- PDF/JPEG/PNG up to 5 MiB; server checks size and magic bytes, hashes bytes, assigns opaque paths without original filenames. No OCR, medical content validation, antivirus or legal eligibility determination is claimed.
- File metadata/revisions remain private and are not added to aggregate dashboards. Download link creation and all document commands record attributed append-only events.
- Existing MCS handoff status tracking is preserved separately. Its legacy `certificate_uploaded` status is not proof of a file or certificate approval; this document workflow is the authoritative review/download gate.

## Files
- `db/0055_certificate_workflow.sql`, applied by Cloud as `drizzle/migrations/0038_private_certificate_workflow.sql`.
- `db/0056_certificate_storage_defence.sql`, applied by Cloud as `drizzle/migrations/0039_certificate_storage_defence.sql`.
- `src/lib/certificates.schema.ts`, `src/lib/certificates.functions.ts`.
- `src/components/CertificateWorkspace.tsx`, `src/routes/_authenticated/certificates.tsx`, navigation in `src/components/AppShell.tsx`.
- `tests/certificates.test.mjs`, `tests/certificate-files.test.ts`, storage metadata support in `tests/care-db.mjs`.
- `AGENTS.md`, `roadmap.md`, certificate safety project memory. Cloud regenerated schema types and migration journal/snapshots.

## Verification
- Cloud confirmed both additive migrations applied. All four new tables have RLS enabled; the bucket is private with a 5 MiB limit. Restrictive storage policies prevent broad existing or future permissive policies from widening read/write/delete access.
- Focused database tests: 5 passed, zero failed, with actual authenticated/anonymous roles. Includes failed early upload, Partner/cross-org/revoked-doctor denials, type/size validation, storage presence, review gating, replacement/rejection, private storage isolation under deliberately broad sibling policies, immutable audit and unchanged credits.
- Byte-validation tests: 2 passed, zero failed; accepted signatures, spoofed MIME/signatures, empty/oversized/misreported sizes.
- Full existing database suite: 245 passed, zero failed, one optional independent local-PostgreSQL contention test skipped. No live integrations exercised.
- Automatic preview typecheck/build reported clean. Public `/`, `/partner-apply`, `/auth` and preserved `/preview/mcs`, `/preview/partner` rendered without page errors. Signed-out `/certificates` redirected to sign-in.

## Unverified and blocked
- Signed-in real upload, review, download and customer handover were not browser-verified. Managed account minting failed because no auth user matches the requesting user's email. No other person's account was selected and no production fixtures/accounts were created.
- Actual storage metadata behavior/file transfer and full signed-in layout need review with an authorized signed-in account and a completed scoped consultation. Database tests use synthetic storage metadata, not a real Storage API transfer.
- Manual customer handover authorizes an operator to download and deliver through the existing verified customer channel; no message is sent and no delivery receipt is implied.