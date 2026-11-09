-- pgTAP: RLS and privileges of public.remonty_reports. Run: `supabase test db` (needs Docker).
begin;
select plan(19);

-- fixtures as postgres (bypass RLS)
insert into public.remonty_reports (id, lat, lng, description, starts_on, status) values
  ('00000000-0000-0000-0000-000000000001', 51.76, 19.46, 'approved', '2026-01-01', 'approved'),
  ('00000000-0000-0000-0000-000000000002', 51.76, 19.46, 'pending',  '2026-01-01', 'pending'),
  ('00000000-0000-0000-0000-000000000003', 51.76, 19.46, 'rejected', '2026-01-01', 'rejected');

set local role anon;

select is((select count(*)::int from public.remonty_reports where description = 'approved'), 1, 'anon sees approved');
select is((select count(*)::int from public.remonty_reports where description = 'pending'),  1, 'anon sees pending (shown greyed out)');
select is((select count(*)::int from public.remonty_reports where description = 'rejected'), 0, 'anon does not see rejected');

select lives_ok($$insert into public.remonty_reports (lat, lng, description, starts_on, ends_on, source_url)
  values (51.77, 19.45, 'valid report', '2026-05-01', '2026-06-01', 'https://example.com/x')$$, 'anon can submit a valid report');

select throws_ok($$insert into public.remonty_reports (lat, lng, description, starts_on, status)
  values (51.77, 19.45, 'x', '2026-05-01', 'approved')$$, '42501', null, 'anon cannot set status on insert');
select throws_ok($$update public.remonty_reports set description = 'hacked' where id = '00000000-0000-0000-0000-000000000001'$$, '42501', null, 'anon cannot update');
select throws_ok($$delete from public.remonty_reports where id = '00000000-0000-0000-0000-000000000001'$$, '42501', null, 'anon cannot delete');

select throws_ok($$insert into public.remonty_reports (lat, lng, description, starts_on) values (10, 19.45, 'x', '2026-05-01')$$, '23514', null, 'coordinates outside Lodz rejected');
select throws_ok($$insert into public.remonty_reports (lat, lng, description, starts_on) values (51.77, 19.45, '   ', '2026-05-01')$$, '23514', null, 'blank description rejected');
select throws_ok($$insert into public.remonty_reports (lat, lng, description, starts_on, ends_on) values (51.77, 19.45, 'x', '2026-05-01', '2026-04-01')$$, '23514', null, 'end before start rejected');
select throws_ok($$insert into public.remonty_reports (lat, lng, description, starts_on, source_url) values (51.77, 19.45, 'x', '2026-05-01', 'javascript:alert(1)')$$, '23514', null, 'non-http source rejected');
select throws_ok($$insert into public.remonty_reports (lat, lng, description, starts_on) values (51.77, 19.45, 'zobacz https://spam.example', '2026-05-01')$$, '23514', null, 'link in description rejected');

reset role;
select is((select status from public.remonty_reports where description = 'valid report'), 'pending', 'new report is pending');
select is((select count(*)::int from public.remonty_reports where description = 'hacked'), 0, 'existing rows untouched');

-- per-client cap: 3 per minute for the same IP
set local role anon;
set local "request.headers" = '{"x-forwarded-for": "203.0.113.7"}';
select lives_ok($$insert into public.remonty_reports (lat, lng, description, starts_on) values (51.77, 19.45, 'u1', '2026-05-01')$$, 'client report 1');
select lives_ok($$insert into public.remonty_reports (lat, lng, description, starts_on) values (51.77, 19.45, 'u2', '2026-05-01')$$, 'client report 2');
select lives_ok($$insert into public.remonty_reports (lat, lng, description, starts_on) values (51.77, 19.45, 'u3', '2026-05-01')$$, 'client report 3');
select throws_ok($$insert into public.remonty_reports (lat, lng, description, starts_on) values (51.77, 19.45, 'u4', '2026-05-01')$$, 'P0001', 'rate_limit_user', 'fourth report in a minute refused');
reset role;

-- flood: triggers off for the fixture insert, then anon must hit the hourly cap
set local session_replication_role = replica;
insert into public.remonty_reports (lat, lng, description, starts_on) select 51.76, 19.46, 'flood ' || g, '2026-05-01' from generate_series(1, 185) g;
set local session_replication_role = origin;
set local role anon;
select throws_ok($$insert into public.remonty_reports (lat, lng, description, starts_on) values (51.77, 19.45, 'one too many', '2026-05-01')$$, 'P0001', 'rate_limit_hour', 'hourly cap enforced');
reset role;

select * from finish();
rollback;
