# Phase 0 — Audit of the existing build vs. the iCare Wellness OS brief

No database or code changes were made. This is a read-only report plus a migration plan awaiting your approval.

## Headline finding

The brief assumes the existing project already contains Thaikanyacare wellness entities — customers, therapists, bookings, treatments, assessments, locations, Wellness Passport. **None of those exist in this project.** What exists is THAIKANYA PartnerCare: a B2B telemedicine partner platform (partners, patients, consultations, CareCredits, MCS clinical integration, notifications, audit).

So there is nothing to duplicate — but also nothing to "extend" for the wellness side. Two possible readings, and this changes everything downstream:

- **A.** The wellness/assessment app is a *different* Lovable project, and this one should stay telemedicine-only.
- **B.** This project is the intended home, and the wellness OS gets built here as new schema alongside PartnerCare.

I need your answer before Phase 1.

## Existing tables found (15)

`profiles`, `user_roles`, `partners`, `patients`, `consultations`, `consultation_notes`, `credit_orders`, `credit_transactions`, `membership_plans`, `memberships`, `notification_deliveries`, `webhook_events`, `integration_conflicts`, `platform_settings`, `audit_log`.

Enums: app_role, partner_status, consultation_status/source, credit_status, credit_txn_type, credit_order_status, membership_status, member_status, notification_channel/status, webhook_processing_status, conflict_status.

Helper functions (SECURITY DEFINER): `has_role`, `is_platform_staff`, `can_write_platform`, `can_manage_partner`, `belongs_to_partner`, `apply_credit_transaction` (atomic credit ledger), `handle_new_user`, `bootstrap_first_super_admin`, `set_updated_at`.

## Tables to reuse (no new equivalents)

| Brief entity | Reuse |
|---|---|
| profiles | `profiles` |
| tenants | `partners` (rename conceptually only, do not rename the table) |
| customers | `patients` — extend, do not create a `customers` table |
| membership_plans / memberships | existing tables |
| wallets / wallet_transactions | `partners.credit_balance` + `credit_transactions` + `apply_credit_transaction()` |
| notifications | `notification_deliveries` (5 languages, 3 channels already) |
| audit_logs | `audit_log` |
| hotel_partners | `partners` + a partner_type column |
| payment webhooks | `webhook_events` (unique provider+external_event_id, replay-safe) |

## Tables to alter (additive only)

- `partners`: add `partner_type` (CLINIC / SPA / HOTEL / CORPORATE), `default_location_id`.
- `patients`: add `customer_type`, optional `tenant_id` alignment; keep `external_patient_id` and MCS fields untouched.
- `membership_plans`: add `tenant_id`, `service_scope`.
- `audit_log`: add `location_id`.

## New tables required (Phase 1 scope only)

locations, services, service_prices, rooms, resources, service_resources, therapists, therapist_qualifications, therapist_service_eligibility, therapist_availability, therapist_time_off, bookings, booking_items, booking_resources, payment_transactions, refunds, ledger_accounts, ledger_entries, commission_plans, commission_rules, commission_snapshots, therapist_earnings.

Later phases (not now): dispatch_jobs/events, home_service_requests, attendance, payroll_*, payouts, inventory_*, treatment_recipes, packages, package_credits, ratings, partner_contracts, partner_commissions.

Assessment/Wellness Passport tables (assessments, assessment_answers, safety_results, wellness_profiles, treatment_recommendations, professional_reviews, wellness_passport) are **not** in scope until you answer A vs. B above.

## Duplicates to avoid

Do not create: `customers` (use patients), `tenants` (use partners), `wallets`/`wallet_transactions` (use credit ledger), `notifications` (use notification_deliveries), `audit_logs` (use audit_log), a second membership system, a second webhook table, or a second credit engine.

## Existing RLS

All 15 tables have RLS on with 41 policies, all scoped to `authenticated`, built on the helper functions. Pattern: platform staff see everything; partner members see their partner; patients see their own rows; finance-sensitive rows are insert/update-restricted; `credit_transactions`, `webhook_events`, `notification_deliveries` are read-only to clients.

### RLS gaps for the new model

1. No location-level scoping — a location manager role does not exist yet.
2. No therapist role scoping (`app_role` has DOCTOR, not THERAPIST).
3. No hotel-partner read scope separate from clinic partner scope.
4. No finance-only scope on the new ledger tables (FINANCE_ADMIN exists but no financial tables yet).
5. Customer self-service scope currently keys off `patients.auth_user_id` — fine, must be reused for bookings.

## Edge functions / server logic

This stack uses TanStack server functions and file routes, not Supabase Edge Functions — there are none, and none should be added.

Existing server logic to reuse: `partnercare.functions.ts` (partners, patients, consultations, access, audit), `commerce.functions.ts` (orders, credits, memberships), `integration.functions.ts`, `portal.functions.ts`, `notifications.server.ts`, `mcs/adapter.server.ts`, `mcs/events.server.ts`, `case-summary.server.ts` (AI Gateway).

Public HTTP routes: `/api/public/mcs-webhook` (HMAC verified), `/api/public/notifications-dispatch` (cron secret).

New server modules needed: `booking.functions.ts`, `scheduling.server.ts`, `pos.functions.ts`, `payments.server.ts` + `/api/public/payment-webhook`, `ledger.server.ts`, `commission.server.ts`.

## Routes and components

Reuse: AppShell nav, PageHeader, StatusBadge, CaseSummaryView, LanguageSwitcher, full shadcn set, the 5-language i18n system, the `_authenticated` gate, and the existing dashboard/partners/patients/consultations/credits/integrations/portal/audit pages.

New routes: `/locations`, `/services`, `/therapists`, `/bookings`, `/calendar`, `/pos`, `/payments`, `/commission`, plus a customer booking flow.

## Breaking-change risks

1. Adding `tenant_id` to existing tables would break current RLS — avoid; `partner_id` already plays that role.
2. `bookings` vs `consultations` must stay separate records linked by a nullable `consultation_id`, or the MCS credit lifecycle breaks.
3. The credit ledger is immutable and idempotent; POS/payments must post through `apply_credit_transaction()` or a parallel ledger, never by direct balance writes.
4. Any new `has_role` enum value requires an enum extension migration before policies reference it.
5. Existing published app queries the current schema — every migration must be additive.

## Proposed migration order (Phase 1, on approval)

1. `0007` — enum extensions (app_role: THERAPIST, LOCATION_MANAGER, HOTEL_PARTNER, CUSTOMER; new service/booking/payment enums) + partner_type/customer_type columns.
2. `0008` — locations, rooms, resources + RLS + grants + location-scope helper functions.
3. `0009` — services, service_prices, service_resources.
4. `0010` — therapists and the four therapist sub-tables.
5. `0011` — bookings, booking_items, booking_resources + overlap-prevention constraints.
6. `0012` — ledger_accounts, ledger_entries, payment_transactions, refunds.
7. `0013` — commission_plans, commission_rules, commission_snapshots, therapist_earnings.
8. `0014` — RLS hardening pass and explicit policy tests.

Each migration: CREATE TABLE → GRANT → ENABLE RLS → CREATE POLICY. No drops, no renames, no data deletion.

## Before Phase 1 I need

1. A or B on the wellness/assessment question above.
2. Confirmation that `partners` is the tenant boundary (no separate tenants table).
3. Confirmation that `patients` becomes the single customer identity.
