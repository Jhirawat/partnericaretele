DROP POLICY "notes readable in scope" ON public.consultation_notes;
DROP POLICY "notes insert in scope" ON public.consultation_notes;
DROP POLICY "notes update in scope" ON public.consultation_notes;
CREATE POLICY "notes readable in scope" ON public.consultation_notes FOR SELECT TO authenticated
  USING (public.is_platform_staff(auth.uid()) OR public.belongs_to_partner(auth.uid(), partner_id));
CREATE POLICY "notes insert in scope" ON public.consultation_notes FOR INSERT TO authenticated
  WITH CHECK (public.can_write_platform(auth.uid()) OR public.can_manage_partner(auth.uid(), partner_id));
CREATE POLICY "notes update in scope" ON public.consultation_notes FOR UPDATE TO authenticated
  USING (public.can_write_platform(auth.uid()) OR public.can_manage_partner(auth.uid(), partner_id))
  WITH CHECK (public.can_write_platform(auth.uid()) OR public.can_manage_partner(auth.uid(), partner_id));