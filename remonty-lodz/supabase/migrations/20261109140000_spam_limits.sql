-- Spam limits for the public form (anon can INSERT without an account).
-- 1) no links in the description (links go in source_url, which is shown only after approval)
alter table public.remonty_reports
  add constraint remonty_reports_description_no_links_check check (description !~* '(https?://|www\.)');

-- 2) global caps, enforced in the database (the browser cannot bypass them):
--    max 20 new reports per hour, max 200 waiting for moderation. SECURITY DEFINER because anon cannot see rejected rows.
create function public.remonty_reports_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.remonty_reports where created_at > now() - interval '1 hour') >= 20 then
    raise exception 'rate_limit_hour' using errcode = 'P0001';
  end if;
  if (select count(*) from public.remonty_reports where status = 'pending') >= 200 then
    raise exception 'rate_limit_pending' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger remonty_reports_limit before insert on public.remonty_reports
  for each row execute function public.remonty_reports_limit();
