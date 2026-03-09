-- Run this in Supabase SQL Editor
create extension if not exists pgcrypto;

create table if not exists public.places (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  area text not null,
  purpose text not null,
  details text not null default '',
  address text not null,
  photos text[] not null default '{}',
  source text not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_places_area on public.places(area);
create index if not exists idx_places_purpose on public.places(purpose);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_places_updated_at on public.places;
create trigger trg_places_updated_at
before update on public.places
for each row
execute function public.set_updated_at();

alter table public.places enable row level security;

-- Public collaborative policies
-- Anyone with the app link can read and write.
drop policy if exists "Public read places" on public.places;
create policy "Public read places"
on public.places for select
to anon, authenticated
using (true);

drop policy if exists "Public insert places" on public.places;
create policy "Public insert places"
on public.places for insert
to anon, authenticated
with check (true);

drop policy if exists "Public update places" on public.places;
create policy "Public update places"
on public.places for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "Public delete places" on public.places;
create policy "Public delete places"
on public.places for delete
to anon, authenticated
using (true);

-- Storage bucket for photos
insert into storage.buckets (id, name, public)
values ('place-photos', 'place-photos', true)
on conflict (id) do update
set public = true;

-- Storage policies (bucket-level access)
drop policy if exists "Public read place photos" on storage.objects;
create policy "Public read place photos"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'place-photos');

drop policy if exists "Public upload place photos" on storage.objects;
create policy "Public upload place photos"
on storage.objects for insert
to anon, authenticated
with check (bucket_id = 'place-photos');

drop policy if exists "Public update place photos" on storage.objects;
create policy "Public update place photos"
on storage.objects for update
to anon, authenticated
using (bucket_id = 'place-photos')
with check (bucket_id = 'place-photos');

drop policy if exists "Public delete place photos" on storage.objects;
create policy "Public delete place photos"
on storage.objects for delete
to anon, authenticated
using (bucket_id = 'place-photos');
-- Option management tables for Area/Purpose
create table if not exists public.place_areas (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_by text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.place_purposes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_by text not null default '',
  created_at timestamptz not null default now()
);

alter table public.place_areas enable row level security;
alter table public.place_purposes enable row level security;

drop policy if exists "Public read areas" on public.place_areas;
create policy "Public read areas"
on public.place_areas for select
to anon, authenticated
using (true);

drop policy if exists "Public insert areas" on public.place_areas;
create policy "Public insert areas"
on public.place_areas for insert
to anon, authenticated
with check (true);

drop policy if exists "Public update areas" on public.place_areas;
create policy "Public update areas"
on public.place_areas for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "Public delete areas" on public.place_areas;
create policy "Public delete areas"
on public.place_areas for delete
to anon, authenticated
using (true);

drop policy if exists "Public read purposes" on public.place_purposes;
create policy "Public read purposes"
on public.place_purposes for select
to anon, authenticated
using (true);

drop policy if exists "Public insert purposes" on public.place_purposes;
create policy "Public insert purposes"
on public.place_purposes for insert
to anon, authenticated
with check (true);

drop policy if exists "Public update purposes" on public.place_purposes;
create policy "Public update purposes"
on public.place_purposes for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "Public delete purposes" on public.place_purposes;
create policy "Public delete purposes"
on public.place_purposes for delete
to anon, authenticated
using (true);

-- Seed options from places if empty
insert into public.place_areas (name, created_by)
select distinct area, 'System'
from public.places
where coalesce(area, '') <> ''
on conflict (name) do nothing;

insert into public.place_purposes (name, created_by)
select distinct purpose, 'System'
from public.places
where coalesce(purpose, '') <> ''
on conflict (name) do nothing;
