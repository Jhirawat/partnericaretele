# Master Workflow Phase 1 — Partner onboarding

## What will be built
- A public Partner application entry with existing email/password signup and confirmation, returning applicants to a separate onboarding page.
- Private application forms for the three approved organization types, owner/contact details, branch/location and license document metadata/uploads.
- Draft, submission, review, request-more-documents, resubmission, approval, activation, rejection and suspension states with clear reasons and history.
- Scoped Admin/Superadmin review and an approved Partner workspace using the existing organization and branch records.

## Access rules
- SUPERADMIN maps to existing `SUPER_ADMIN`: global access and decisions.
- ADMIN maps to existing `OPERATIONS_ADMIN`: only explicitly authorized organization scope; a backend-provisioned global membership is global. Unassigned applications need a global reviewer to assign scope.
- PARTNER maps to existing owner/manager/staff memberships: own organization only; no Doctor recruitment or approval.
- DOCTOR remains case-scoped; no new Doctor screens.
- Signup creates a private profile only, never a Patient record or privileged membership. Approval grants only Partner owner access through a trusted atomic command. Existing MFA requirements remain.

## Technical implementation
- Add reviewed SQL for application/document/history records, explicit grants, RLS, narrow commands and private storage policies. Inspect deployed definitions before tightening legacy scope paths.
- Use existing TanStack routes, authenticated server functions, design components and i18n. Thai labels with English fallback for the new flow; retain existing locale/RTL behavior.
- Add real anon/authenticated-role regressions for ownership, role/scope, MFA, transitions, atomic approval, retries, suspension and storage access; run the full existing suite and browser checks.

## Boundaries
- The approved onboarding organization category exception does not introduce product or prescription sales.
- Preserve all existing data, demo behavior, credit lifecycle and payment gates.
- Do not publish, connect payments/MCS/APIs, or implement later phases.
- Report exact changed files/routes/policies, executed checks and any external confirmation/upload checks that remain unverified.