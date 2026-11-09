-- Rate limits v2: 180 new reports/hour overall, 1800 waiting for moderation, 3 per minute per client.
-- "Client" = hash of the caller IP (no accounts). The hash is kept for one hour only (cleared on later inserts)
-- and the column is not readable by anon/authenticated (column-level SELECT below).
alter table public.remonty_reports add column client_hash text;

revoke select on table public.remonty_reports from anon, authenticated;
grant select (id, lat, lng, description, starts_on, ends_on, source_url, status, created_at)
  on table public.remonty_reports to anon, authenticated;

create or replace function public.remonty_reports_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare h json; ip text;
begin
  begin h := current_setting('request.headers', true)::json; exception when others then h := null; end;
  ip := coalesce(h->>'cf-connecting-ip', split_part(coalesce(h->>'x-forwarded-for', ''), ',', 1));
  if ip <> '' then new.client_hash := md5(ip || ':remonty-lodz'); end if;
  update public.remonty_reports set client_hash = null where client_hash is not null and created_at < now() - interval '1 hour';
  if new.client_hash is not null
     and (select count(*) from public.remonty_reports where client_hash = new.client_hash and created_at > now() - interval '1 minute') >= 3 then
    raise exception 'rate_limit_user' using errcode = 'P0001';
  end if;
  if (select count(*) from public.remonty_reports where created_at > now() - interval '1 hour') >= 180 then
    raise exception 'rate_limit_hour' using errcode = 'P0001';
  end if;
  if (select count(*) from public.remonty_reports where status = 'pending') >= 1800 then
    raise exception 'rate_limit_pending' using errcode = 'P0001';
  end if;
  return new;
end $$;
