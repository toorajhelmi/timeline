-- Timeline MVP schema + RLS
-- Run via Supabase SQL editor or Supabase CLI migrations.

create extension if not exists "pgcrypto";

-- Enums
do $$
begin
  if not exists (select 1 from pg_type where typname = 'timeline_visibility') then
    create type public.timeline_visibility as enum ('public', 'limited', 'private');
  end if;

  if not exists (select 1 from pg_type where typname = 'timeline_role') then
    create type public.timeline_role as enum ('curator', 'contributor');
  end if;

  if not exists (select 1 from pg_type where typname = 'entry_type') then
    create type public.entry_type as enum ('update', 'evidence', 'claim', 'context', 'correction');
  end if;

  if not exists (select 1 from pg_type where typname = 'content_status') then
    create type public.content_status as enum ('active', 'hidden', 'removed', 'disputed');
  end if;

  if not exists (select 1 from pg_type where typname = 'report_object_type') then
    create type public.report_object_type as enum ('timeline', 'entry', 'comment');
  end if;

  if not exists (select 1 from pg_type where typname = 'report_status') then
    create type public.report_status as enum ('open', 'triaged', 'resolved', 'dismissed');
  end if;
end $$;

-- Profiles (pseudonymous public identity)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  handle text unique,
  display_name text,
  created_at timestamptz not null default now(),
  is_admin boolean not null default false
);

alter table public.profiles enable row level security;

-- Timelines
create table if not exists public.timelines (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text not null default '',
  tags text[] not null default '{}',
  visibility public.timeline_visibility not null default 'public',
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  canonical_timeline_id uuid references public.timelines (id)
);

create index if not exists timelines_updated_at_idx on public.timelines(updated_at desc);
create index if not exists timelines_tags_idx on public.timelines using gin(tags);

alter table public.timelines enable row level security;

-- Timeline members (roles)
create table if not exists public.timeline_members (
  timeline_id uuid not null references public.timelines (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.timeline_role not null,
  created_at timestamptz not null default now(),
  primary key (timeline_id, user_id)
);

alter table public.timeline_members enable row level security;

-- Entries
create table if not exists public.entries (
  id uuid primary key default gen_random_uuid(),
  timeline_id uuid not null references public.timelines (id) on delete cascade,
  type public.entry_type not null,
  title text,
  body text not null,
  time_start timestamptz not null,
  time_end timestamptz,
  status public.content_status not null default 'active',
  corrects_entry_id uuid references public.entries (id),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists entries_timeline_time_idx on public.entries(timeline_id, time_start desc);
create index if not exists entries_status_idx on public.entries(status);

alter table public.entries enable row level security;

-- Sources
create table if not exists public.sources (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.entries (id) on delete cascade,
  url text not null,
  source_type text not null default 'web',
  added_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create index if not exists sources_entry_idx on public.sources(entry_id);

alter table public.sources enable row level security;

-- Entry revisions (audit trail)
create table if not exists public.entry_revisions (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.entries (id) on delete cascade,
  editor_id uuid not null references public.profiles (id),
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists entry_revisions_entry_idx on public.entry_revisions(entry_id, created_at desc);

alter table public.entry_revisions enable row level security;

-- Comments
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.entries (id) on delete cascade,
  body text not null,
  status public.content_status not null default 'active',
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists comments_entry_idx on public.comments(entry_id, created_at asc);

alter table public.comments enable row level security;

-- Reports
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id),
  object_type public.report_object_type not null,
  object_id uuid not null,
  reason text not null,
  status public.report_status not null default 'open',
  created_at timestamptz not null default now()
);

create index if not exists reports_status_idx on public.reports(status, created_at desc);

alter table public.reports enable row level security;

-- Helpers
create or replace function public.is_admin(uid uuid)
returns boolean
language sql
stable
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = uid), false)
$$;

create or replace function public.has_timeline_role(tid uuid, uid uuid, roles public.timeline_role[])
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.timeline_members tm
    where tm.timeline_id = tid
      and tm.user_id = uid
      and tm.role = any(roles)
  )
$$;

-- Updated-at triggers
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'timelines_set_updated_at') then
    create trigger timelines_set_updated_at
    before update on public.timelines
    for each row execute function public.set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'entries_set_updated_at') then
    create trigger entries_set_updated_at
    before update on public.entries
    for each row execute function public.set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'comments_set_updated_at') then
    create trigger comments_set_updated_at
    before update on public.comments
    for each row execute function public.set_updated_at();
  end if;
end $$;

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, handle, display_name)
  values (new.id, null, null)
  on conflict (id) do nothing;
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'on_auth_user_created') then
    create trigger on_auth_user_created
    after insert on auth.users
    for each row execute procedure public.handle_new_user();
  end if;
end $$;

-- RLS POLICIES

-- profiles: public read basic identity; self can update
drop policy if exists profiles_select_public on public.profiles;
create policy profiles_select_public on public.profiles
for select
using (true);

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles
for insert
with check (auth.uid() = id);

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);

-- timelines: public read public timelines; authenticated can create; curators/admin can update
drop policy if exists timelines_select_public on public.timelines;
create policy timelines_select_public on public.timelines
for select
using (visibility = 'public');

drop policy if exists timelines_insert_authed on public.timelines;
create policy timelines_insert_authed on public.timelines
for insert
with check (auth.uid() = created_by);

drop policy if exists timelines_update_curator_or_admin on public.timelines;
create policy timelines_update_curator_or_admin on public.timelines
for update
using (
  public.is_admin(auth.uid())
  or public.has_timeline_role(id, auth.uid(), array['curator']::public.timeline_role[])
)
with check (
  public.is_admin(auth.uid())
  or public.has_timeline_role(id, auth.uid(), array['curator']::public.timeline_role[])
);

-- timeline_members: only admin/curator can manage membership; members can view their own membership
drop policy if exists timeline_members_select_member on public.timeline_members;
create policy timeline_members_select_member on public.timeline_members
for select
using (
  public.is_admin(auth.uid())
  or user_id = auth.uid()
  or public.has_timeline_role(timeline_id, auth.uid(), array['curator']::public.timeline_role[])
);

drop policy if exists timeline_members_insert_curator_or_admin on public.timeline_members;
create policy timeline_members_insert_curator_or_admin on public.timeline_members
for insert
with check (
  public.is_admin(auth.uid())
  or public.has_timeline_role(timeline_id, auth.uid(), array['curator']::public.timeline_role[])
);

drop policy if exists timeline_members_update_curator_or_admin on public.timeline_members;
create policy timeline_members_update_curator_or_admin on public.timeline_members
for update
using (
  public.is_admin(auth.uid())
  or public.has_timeline_role(timeline_id, auth.uid(), array['curator']::public.timeline_role[])
)
with check (
  public.is_admin(auth.uid())
  or public.has_timeline_role(timeline_id, auth.uid(), array['curator']::public.timeline_role[])
);

drop policy if exists timeline_members_delete_curator_or_admin on public.timeline_members;
create policy timeline_members_delete_curator_or_admin on public.timeline_members
for delete
using (
  public.is_admin(auth.uid())
  or public.has_timeline_role(timeline_id, auth.uid(), array['curator']::public.timeline_role[])
);

-- entries: public read entries from public timelines; hidden/removed only for admin/curator
drop policy if exists entries_select_public on public.entries;
create policy entries_select_public on public.entries
for select
using (
  exists (
    select 1
    from public.timelines t
    where t.id = entries.timeline_id
      and t.visibility = 'public'
  )
  and (
    status in ('active','disputed')
    or public.is_admin(auth.uid())
    or public.has_timeline_role(entries.timeline_id, auth.uid(), array['curator']::public.timeline_role[])
  )
);

drop policy if exists entries_insert_authed on public.entries;
create policy entries_insert_authed on public.entries
for insert
with check (
  auth.uid() = created_by
  and exists (
    select 1 from public.timelines t
    where t.id = entries.timeline_id
      and t.visibility = 'public'
  )
);

drop policy if exists entries_update_author_or_curator_or_admin on public.entries;
create policy entries_update_author_or_curator_or_admin on public.entries
for update
using (
  public.is_admin(auth.uid())
  or public.has_timeline_role(entries.timeline_id, auth.uid(), array['curator']::public.timeline_role[])
  or created_by = auth.uid()
)
with check (
  public.is_admin(auth.uid())
  or public.has_timeline_role(entries.timeline_id, auth.uid(), array['curator']::public.timeline_role[])
  or created_by = auth.uid()
);

-- sources: public read for visible entries; insert by authed users (must be entry author/curator/admin)
drop policy if exists sources_select_public on public.sources;
create policy sources_select_public on public.sources
for select
using (
  exists (
    select 1
    from public.entries e
    join public.timelines t on t.id = e.timeline_id
    where e.id = sources.entry_id
      and t.visibility = 'public'
      and e.status in ('active','disputed')
  )
);

drop policy if exists sources_insert_author_or_curator_or_admin on public.sources;
create policy sources_insert_author_or_curator_or_admin on public.sources
for insert
with check (
  auth.uid() = added_by
  and exists (
    select 1
    from public.entries e
    where e.id = sources.entry_id
      and (
        e.created_by = auth.uid()
        or public.is_admin(auth.uid())
        or public.has_timeline_role(e.timeline_id, auth.uid(), array['curator']::public.timeline_role[])
      )
  )
);

-- entry_revisions: public read for visible entries; insert only by author/curator/admin
drop policy if exists entry_revisions_select_public on public.entry_revisions;
create policy entry_revisions_select_public on public.entry_revisions
for select
using (
  exists (
    select 1
    from public.entries e
    join public.timelines t on t.id = e.timeline_id
    where e.id = entry_revisions.entry_id
      and t.visibility = 'public'
      and e.status in ('active','disputed')
  )
);

drop policy if exists entry_revisions_insert_author_or_curator_or_admin on public.entry_revisions;
create policy entry_revisions_insert_author_or_curator_or_admin on public.entry_revisions
for insert
with check (
  auth.uid() = editor_id
  and exists (
    select 1
    from public.entries e
    where e.id = entry_revisions.entry_id
      and (
        e.created_by = auth.uid()
        or public.is_admin(auth.uid())
        or public.has_timeline_role(e.timeline_id, auth.uid(), array['curator']::public.timeline_role[])
      )
  )
);

-- comments: public read for visible entries; insert by authed; update by author/curator/admin
drop policy if exists comments_select_public on public.comments;
create policy comments_select_public on public.comments
for select
using (
  exists (
    select 1
    from public.entries e
    join public.timelines t on t.id = e.timeline_id
    where e.id = comments.entry_id
      and t.visibility = 'public'
      and e.status in ('active','disputed')
  )
  and status in ('active','disputed')
);

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
  )
);

drop policy if exists comments_update_author_or_curator_or_admin on public.comments;
create policy comments_update_author_or_curator_or_admin on public.comments
for update
using (
  public.is_admin(auth.uid())
  or created_by = auth.uid()
  or exists (
    select 1
    from public.entries e
    where e.id = comments.entry_id
      and public.has_timeline_role(e.timeline_id, auth.uid(), array['curator']::public.timeline_role[])
  )
)
with check (
  public.is_admin(auth.uid())
  or created_by = auth.uid()
  or exists (
    select 1
    from public.entries e
    where e.id = comments.entry_id
      and public.has_timeline_role(e.timeline_id, auth.uid(), array['curator']::public.timeline_role[])
  )
);

-- reports: authenticated can create; only admins can read/manage
drop policy if exists reports_insert_authed on public.reports;
create policy reports_insert_authed on public.reports
for insert
with check (auth.uid() = reporter_id);

drop policy if exists reports_select_admin on public.reports;
create policy reports_select_admin on public.reports
for select
using (public.is_admin(auth.uid()));

drop policy if exists reports_update_admin on public.reports;
create policy reports_update_admin on public.reports
for update
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

