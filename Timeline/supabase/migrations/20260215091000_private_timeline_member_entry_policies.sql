-- Fix RLS so private/limited timeline members can read/write content.
-- Required for client-side media upload flows (TUS) and private timelines in general.

-- ENTRIES
-- Allow members/owners to SELECT entries on timelines they can access.
drop policy if exists entries_select_member on public.entries;
create policy entries_select_member on public.entries
for select
using (
  -- admins can see all
  public.is_admin(auth.uid())
  -- timeline owner can see all entries
  or exists (
    select 1
    from public.timelines t
    where t.id = entries.timeline_id
      and t.created_by = auth.uid()
  )
  -- curators can see all entries on their timelines
  or public.has_timeline_role(entries.timeline_id, auth.uid(), array['curator']::public.timeline_role[])
  -- entry author and contributors can see active/disputed
  or (
    (entries.created_by = auth.uid()
      or public.has_timeline_role(entries.timeline_id, auth.uid(), array['contributor']::public.timeline_role[]))
    and entries.status in ('active','disputed')
  )
);

-- Allow members/owners to INSERT entries on private/limited timelines.
drop policy if exists entries_insert_authed on public.entries;
create policy entries_insert_authed on public.entries
for insert
with check (
  auth.uid() = created_by
  and (
    public.is_admin(auth.uid())
    or exists (
      select 1
      from public.timelines t
      where t.id = entries.timeline_id
        and t.created_by = auth.uid()
    )
    or public.has_timeline_role(entries.timeline_id, auth.uid(), array['curator','contributor']::public.timeline_role[])
  )
);

-- SOURCES
drop policy if exists sources_select_member on public.sources;
create policy sources_select_member on public.sources
for select
using (
  exists (
    select 1
    from public.entries e
    where e.id = sources.entry_id
      and (
        public.is_admin(auth.uid())
        or e.created_by = auth.uid()
        or exists (
          select 1
          from public.timelines t
          where t.id = e.timeline_id
            and t.created_by = auth.uid()
        )
        or public.has_timeline_role(e.timeline_id, auth.uid(), array['curator','contributor']::public.timeline_role[])
      )
  )
);

-- ENTRY_MEDIA
drop policy if exists entry_media_select_member on public.entry_media;
create policy entry_media_select_member on public.entry_media
for select
using (
  exists (
    select 1
    from public.entries e
    where e.id = entry_media.entry_id
      and (
        public.is_admin(auth.uid())
        or e.created_by = auth.uid()
        or exists (
          select 1
          from public.timelines t
          where t.id = e.timeline_id
            and t.created_by = auth.uid()
        )
        or public.has_timeline_role(e.timeline_id, auth.uid(), array['curator','contributor']::public.timeline_role[])
      )
  )
);

