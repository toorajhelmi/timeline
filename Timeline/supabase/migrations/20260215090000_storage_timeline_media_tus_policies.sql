-- Allow authenticated users to upload/update timeline media objects (for TUS resumable uploads)
-- Objects are stored under: <timeline-slug>/<entry-id>/<filename>
-- We only allow uploads for entries the user can manage (author, curator, admin).
--
-- Storage objects live in the `storage` schema (Supabase).
--
-- Regex for UUID (accept any UUID format)
-- We guard the cast to uuid by checking the regex first.

do $$
begin
  -- INSERT (create object)
  execute 'drop policy if exists timeline_media_objects_insert_for_entry_managers on storage.objects';
  execute $POL$
    create policy timeline_media_objects_insert_for_entry_managers
    on storage.objects
    for insert
    to authenticated
    with check (
      bucket_id = 'timeline-media'
      and (split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
      and exists (
        select 1
        from public.entries e
        where e.id = (split_part(storage.objects.name, '/', 2))::uuid
          and (
            e.created_by = auth.uid()
            or public.is_admin(auth.uid())
            or public.has_timeline_role(e.timeline_id, auth.uid(), array['curator']::public.timeline_role[])
          )
      )
    );
  $POL$;

  -- UPDATE (TUS PATCH/HEAD update the same object row)
  execute 'drop policy if exists timeline_media_objects_update_for_entry_managers on storage.objects';
  execute $POL$
    create policy timeline_media_objects_update_for_entry_managers
    on storage.objects
    for update
    to authenticated
    using (
      bucket_id = 'timeline-media'
      and (split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
      and exists (
        select 1
        from public.entries e
        where e.id = (split_part(storage.objects.name, '/', 2))::uuid
          and (
            e.created_by = auth.uid()
            or public.is_admin(auth.uid())
            or public.has_timeline_role(e.timeline_id, auth.uid(), array['curator']::public.timeline_role[])
          )
      )
    )
    with check (
      bucket_id = 'timeline-media'
      and (split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
      and exists (
        select 1
        from public.entries e
        where e.id = (split_part(storage.objects.name, '/', 2))::uuid
          and (
            e.created_by = auth.uid()
            or public.is_admin(auth.uid())
            or public.has_timeline_role(e.timeline_id, auth.uid(), array['curator']::public.timeline_role[])
          )
      )
    );
  $POL$;

  -- DELETE (optional cleanup)
  execute 'drop policy if exists timeline_media_objects_delete_for_entry_managers on storage.objects';
  execute $POL$
    create policy timeline_media_objects_delete_for_entry_managers
    on storage.objects
    for delete
    to authenticated
    using (
      bucket_id = 'timeline-media'
      and (split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
      and exists (
        select 1
        from public.entries e
        where e.id = (split_part(storage.objects.name, '/', 2))::uuid
          and (
            e.created_by = auth.uid()
            or public.is_admin(auth.uid())
            or public.has_timeline_role(e.timeline_id, auth.uid(), array['curator']::public.timeline_role[])
          )
      )
    );
  $POL$;
end $$;

