-- Phase 1 step 1: extend roles and classify organisations / people.
-- Additive only. New enum values must land in their own migration before any
-- policy or default references them.

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'THERAPIST';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'LOCATION_MANAGER';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'HOTEL_PARTNER';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'CUSTOMER';

CREATE TYPE public.partner_type AS ENUM ('CLINIC', 'SPA', 'HOTEL', 'CORPORATE');
CREATE TYPE public.customer_type AS ENUM ('PATIENT', 'WELLNESS', 'HOTEL_GUEST', 'CORPORATE');

ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS partner_type public.partner_type NOT NULL DEFAULT 'CLINIC';

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS customer_type public.customer_type NOT NULL DEFAULT 'PATIENT',
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS notes text;

COMMENT ON COLUMN public.patients.customer_type IS 'Single customer identity shared by clinical consultations and wellness bookings.';
