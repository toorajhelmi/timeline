-- Background video transcode jobs (optimized variants)

-- Ensure entry_media exists (some environments created it manually).
create table if not exists public.entry_media (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.entries (id) on delete cascade,
  kind text not null,
  storage_bucket text not null,
  storage_path text not null,
  variant text not null default 'original',
  original_url text,
  mime_type text,
  bytes bigint,
  width int,
  height int,
  duration_seconds numeric,
  sha256 text,
  uploaded_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create index if not exists entry_media_entry_idx on public.entry_media(entry_id, created_at asc);
create index if not exists entry_media_kind_variant_idx on public.entry_media(kind, variant, created_at desc);
create unique index if not exists entry_media_unique_object on public.entry_media(storage_bucket, storage_path);

alter table public.entry_media enable row level security;

-- Jobs table
create table if not exists public.video_transcode_jobs (
  id uuid primary key default gen_random_uuid(),
  entry_media_id uuid not null references public.entry_media (id) on delete cascade,
  entry_id uuid not null references public.entries (id) on delete cascade,
  storage_bucket text not null,
  storage_path text not null,
  uploaded_by uuid not null references public.profiles (id),
  out_variant text not null default 'optimized',
  status text not null default 'queued', -- queued | processing | done | error
  attempts int not null default 0,
  locked_at timestamptz,
  locked_by text,
  last_error text,
  out_storage_path text,
  out_bytes bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists video_transcode_jobs_unique
  on public.video_transcode_jobs(storage_bucket, storage_path, out_variant);
create index if not exists video_transcode_jobs_status_idx
  on public.video_transcode_jobs(status, created_at asc);

-- Atomic claim function for workers
create or replace function public.claim_video_transcode_job(p_worker_id text)
returns setof public.video_transcode_jobs
language plpgsql
security definer
as $$
declare
  v_job public.video_transcode_jobs;
begin
  update public.video_transcode_jobs j
  set
    status = 'processing',
    locked_at = now(),
    locked_by = p_worker_id,
    attempts = j.attempts + 1,
    updated_at = now()
  where j.id = (
    select jj.id
    from public.video_transcode_jobs jj
    where
      jj.status in ('queued','processing')
      and (jj.locked_at is null or jj.locked_at < now() - interval '10 minutes')
      and jj.attempts < 10
    order by jj.created_at asc
    limit 1
    for update skip locked
  )
  returning * into v_job;

  if v_job.id is null then
    return;
  end if;

  return next v_job;
end;
$$;

-- Enqueue on original video insert (only for large files).
create or replace function public.enqueue_video_transcode_job()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.kind = 'video' and coalesce(new.variant, 'original') = 'original' and coalesce(new.bytes, 0) >= 100 * 1024 * 1024 then
    insert into public.video_transcode_jobs (
      entry_media_id,
      entry_id,
      storage_bucket,
      storage_path,
      uploaded_by,
      out_variant,
      status
    )
    values (
      new.id,
      new.entry_id,
      new.storage_bucket,
      new.storage_path,
      new.uploaded_by,
      'optimized',
      'queued'
    )
    on conflict (storage_bucket, storage_path, out_variant) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enqueue_video_transcode_job on public.entry_media;
create trigger trg_enqueue_video_transcode_job
after insert on public.entry_media
for each row execute function public.enqueue_video_transcode_job();

