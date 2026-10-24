REVOKE ALL ON public.fin_reconciliation_snapshots,public.fin_adjustments,public.fin_control_events,public.fin_compensating_entries,public.fin_control_operations FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.fin_reconciliation_snapshots,public.fin_adjustments,public.fin_control_events,public.fin_compensating_entries TO authenticated;
GRANT ALL ON public.fin_reconciliation_snapshots,public.fin_adjustments,public.fin_control_events,public.fin_compensating_entries,public.fin_control_operations TO service_role;
-- Wrapper accepts omitted branch for organization reporting; generated RPC types reflect defaults.
CREATE FUNCTION public.fin_period_report(_p uuid,_from timestamptz,_to timestamptz,_l uuid DEFAULT NULL) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT fin_report(_p,_l,_from,_to) $$;
REVOKE ALL ON FUNCTION public.fin_period_report(uuid,timestamptz,timestamptz,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fin_period_report(uuid,timestamptz,timestamptz,uuid) TO authenticated;