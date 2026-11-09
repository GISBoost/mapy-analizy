-- Citizen reports of road works for remonty-lodz.
-- Public flow: anyone (anon) may INSERT a pending report and SELECT approved ones.
-- Moderation: change `status` in Supabase Dashboard (Table Editor runs as postgres, bypasses RLS).

create table public.remonty_reports (
  id          uuid primary key default gen_random_uuid(),
  lat         double precision not null check (lat between 51.65 and 51.90),   -- Lodz bounding box
  lng         double precision not null check (lng between 19.28 and 19.70),
  description text not null check (char_length(btrim(description)) between 1 and 500),
  starts_on   date not null check (starts_on between date '2021-01-01' and date '2030-12-31'),
  ends_on     date check (ends_on between date '2021-01-01' and date '2030-12-31'),
  source_url  text check (char_length(source_url) <= 500 and source_url ~* '^https?://[^[:space:]]+$'),
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at  timestamptz not null default now(),
  constraint remonty_reports_end_after_start check (ends_on is null or ends_on >= starts_on)
);

-- The map only reads approved rows, newest start first.
create index remonty_reports_approved_idx on public.remonty_reports (starts_on desc) where status = 'approved';

alter table public.remonty_reports enable row level security;

-- Privileges: start from nothing, grant only what the public client needs.
revoke all on table public.remonty_reports from anon, authenticated;
grant select on table public.remonty_reports to anon, authenticated;
-- Column-level INSERT: a client cannot set id, status or created_at at all.
grant insert (lat, lng, description, starts_on, ends_on, source_url) on table public.remonty_reports to anon, authenticated;

create policy "public reads approved" on public.remonty_reports
  for select to anon, authenticated using (status = 'approved');

create policy "public submits pending" on public.remonty_reports
  for insert to anon, authenticated with check (status = 'pending');
