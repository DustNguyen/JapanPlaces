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
