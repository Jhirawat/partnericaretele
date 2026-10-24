-- Restrictive bucket boundaries compose with all existing/future permissive policies.
CREATE POLICY certificate_storage_read_defence ON storage.objects AS RESTRICTIVE
FOR SELECT TO authenticated USING(bucket_id<>'care-certificates' OR public.certificate_file_read(name,auth.uid()));
CREATE POLICY certificate_storage_anon_defence ON storage.objects AS RESTRICTIVE
FOR SELECT TO anon USING(bucket_id<>'care-certificates');
CREATE POLICY certificate_storage_insert_defence ON storage.objects AS RESTRICTIVE
FOR INSERT TO authenticated,anon WITH CHECK(bucket_id<>'care-certificates');
CREATE POLICY certificate_storage_update_defence ON storage.objects AS RESTRICTIVE
FOR UPDATE TO authenticated,anon USING(bucket_id<>'care-certificates') WITH CHECK(bucket_id<>'care-certificates');
CREATE POLICY certificate_storage_delete_defence ON storage.objects AS RESTRICTIVE
FOR DELETE TO authenticated,anon USING(bucket_id<>'care-certificates');
