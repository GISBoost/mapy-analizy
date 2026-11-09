-- Pending reports become publicly visible (shown greyed out on the map, so people see the place is already reported).
-- Rejected rows stay hidden. INSERT rules are unchanged: clients still cannot set status.
drop policy "public reads approved" on public.remonty_reports;

create policy "public reads approved and pending" on public.remonty_reports
  for select to anon, authenticated using (status in ('approved', 'pending'));

-- The partial index only covers approved rows; the table is small, so a plain scan is fine for pending ones.
