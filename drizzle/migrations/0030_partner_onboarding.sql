CREATE TABLE IF NOT EXISTS public.partner_applications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_user_id uuid NOT NULL,
 organization_type text NOT NULL DEFAULT 'CLINIC' CHECK (organization_type IN ('CLINIC','HEALTH_ESTABLISHMENT','MEDICAL_SERVICE')),
 form jsonb NOT NULL DEFAULT '{}', status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SUBMITTED','UNDER_REVIEW','NEED_MORE_DOCUMENTS','APPROVED','ACTIVE','REJECTED','SUSPENDED')),
 scope_partner_id uuid REFERENCES public.partners(id), partner_id uuid UNIQUE REFERENCES public.partners(id),
 reason text, reviewer uuid, reviewed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(owner_user_id)
);
GRANT SELECT ON public.partner_applications TO authenticated;
GRANT ALL ON public.partner_applications TO service_role;
ALTER TABLE public.partner_applications ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS public.partner_application_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), application_id uuid NOT NULL REFERENCES public.partner_applications(id),
 document_type text NOT NULL CHECK(length(document_type) BETWEEN 1 AND 120), primary_license boolean NOT NULL DEFAULT false,
 object_path text NOT NULL UNIQUE, file_name text NOT NULL CHECK(length(file_name) BETWEEN 1 AND 200),
 issue_date date NOT NULL, expiry_date date, review_status text NOT NULL DEFAULT 'PENDING' CHECK(review_status IN ('PENDING','ACCEPTED','NEED_MORE_INFO','REJECTED')),
 reviewer uuid, reviewed_at timestamptz, reason text, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.partner_application_documents TO authenticated;
GRANT ALL ON public.partner_application_documents TO service_role;
ALTER TABLE public.partner_application_documents ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS public.partner_application_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), application_id uuid NOT NULL REFERENCES public.partner_applications(id), actor_user_id uuid NOT NULL,
 action text NOT NULL, from_state text, to_state text, reason text, context jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.partner_application_events TO authenticated;
GRANT ALL ON public.partner_application_events TO service_role;
ALTER TABLE public.partner_application_events ENABLE ROW LEVEL SECURITY;