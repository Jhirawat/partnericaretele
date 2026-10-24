ALTER TABLE public.consultations
  ADD COLUMN IF NOT EXISTS mcs_consultation_id TEXT,
  ADD COLUMN IF NOT EXISTS mcs_last_event_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS consultations_mcs_consultation_idx ON public.consultations (mcs_consultation_id) WHERE mcs_consultation_id IS NOT NULL;