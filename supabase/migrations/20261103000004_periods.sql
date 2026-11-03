-- Swarna · migration 4 · periods (bleeds) + "period started" partner alert
--
-- Apply: Supabase dashboard → SQL Editor → paste → Run.
-- Uses the sync rules from migration 2 (updated_at / synced_at / deleted).

-- When she switched to natural-cycle mode. Bleeds before this were withdrawal
-- bleeds on the pill and are left out of natural-cycle predictions.
alter table public.tracking_settings add column natural_since date;

-- ───────────────────────── periods ─────────────────────────
create table public.periods (
  id         uuid primary key,                  -- generated on the phone
  owner_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  start_date date not null,
  end_date   date,                              -- null = still bleeding
  deleted    boolean not null default false,
  updated_at timestamptz not null default now(),
  synced_at  timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);
create index periods_owner_start_idx on public.periods (owner_id, start_date);
create index periods_sync_idx on public.periods (owner_id, synced_at);

create trigger periods_synced before insert or update on public.periods
  for each row execute function public.stamp_synced_at();
create trigger periods_newest before update on public.periods
  for each row execute function public.keep_newest();

alter table public.periods enable row level security;

create policy "periods: owner reads" on public.periods
  for select to authenticated using (owner_id = (select auth.uid()));

create policy "periods: partner reads if shared" on public.periods
  for select to authenticated using (public.partner_can_see(owner_id, 'periods'));

create policy "periods: owner inserts" on public.periods
  for insert to authenticated with check (owner_id = (select auth.uid()));

create policy "periods: owner updates" on public.periods
  for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

revoke all on public.periods from anon;
revoke delete on public.periods from authenticated;

alter publication supabase_realtime add table public.periods;

-- ───────────────────────── "Period started" → partner, instantly ─────────────────────────
-- When a recent period is logged (not old history being back-filled), ask the
-- send-reminders function to notify the partner. pg_net sends it in the background.
create function public.notify_period_started() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.deleted = false
     and (tg_op = 'INSERT' or old.deleted = true)
     and new.start_date >= current_date - 2 then
    perform net.http_post(
      url     := (select decrypted_secret from vault.decrypted_secrets where name = 'swarna_functions_url') || '/send-reminders',
      headers := jsonb_build_object(
                   'Content-Type', 'application/json',
                   'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'swarna_cron_secret')
                 ),
      body    := jsonb_build_object('event', 'period-started', 'period_id', new.id)
    );
  end if;
  return new;
end $$;

create trigger periods_notify_started after insert or update on public.periods
  for each row execute function public.notify_period_started();
