-- Key moments + thread locks (MVP)

alter table public.entries
add column if not exists is_locked boolean not null default false;

create table if not exists public.timeline_key_moments (
  timeline_id uuid not null references public.timelines (id) on delete cascade,
  entry_id uuid not null references public.entries (id) on delete cascade,
  pinned_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  primary key (timeline_id, entry_id)
);

alter table public.timeline_key_moments enable row level security;

-- Public can read key moments of public timelines
drop policy if exists timeline_key_moments_select_public on public.timeline_key_moments;
create policy timeline_key_moments_select_public on public.timeline_key_moments
for select
using (
  exists (
    select 1
    from public.timelines t
    where t.id = timeline_key_moments.timeline_id
      and t.visibility = 'public'
  )
);

-- Curator/admin can pin/unpin
drop policy if exists timeline_key_moments_insert_curator_or_admin on public.timeline_key_moments;
create policy timeline_key_moments_insert_curator_or_admin on public.timeline_key_moments
for insert
with check (
  public.is_admin(auth.uid())
  or public.has_timeline_role(timeline_id, auth.uid(), array['curator']::public.timeline_role[])
);

drop policy if exists timeline_key_moments_delete_curator_or_admin on public.timeline_key_moments;
create policy timeline_key_moments_delete_curator_or_admin on public.timeline_key_moments
for delete
using (
  public.is_admin(auth.uid())
  or public.has_timeline_role(timeline_id, auth.uid(), array['curator']::public.timeline_role[])
);

-- Update comment insert policy to block locked entries
drop policy if exists comments_insert_authed on public.comments;
create policy comments_insert_authed on public.comments
for insert
with check (
  auth.uid() = created_by
  and exists (
    select 1
    from public.entries e
    join public.timelines t on t.id = e.timeline_id
    where e.id = comments.entry_id
      and t.visibility = 'public'
      and e.status in ('active','disputed')
      and e.is_locked = false
  )
);

