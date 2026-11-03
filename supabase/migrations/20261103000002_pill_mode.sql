-- Swarna · migration 2 · tracking settings (pill / natural) + pill logs
--
-- Apply: Supabase dashboard → SQL Editor → New query → paste → Run.
--
-- Offline sync rules (used by every synced table from now on):
--   updated_at = when the change was made ON THE PHONE (phone clock). The newest
--                change wins; an older offline change can never overwrite a newer one.
--   synced_at  = when the SERVER received it. Phones ask "what changed since X?"
--                using this column, so phone clocks don't matter for that.
--   deleted    = soft delete, so deletions also reach other devices.

-- ───────────────────────── Shared helpers ─────────────────────────

create function public.stamp_synced_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.synced_at := clock_timestamp();
  return new;
end $$;

-- Skip an update if it is older than what's already stored (last write wins).
create function public.keep_newest() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.updated_at < old.updated_at then
    return null;  -- silently ignore the stale write
  end if;
  return new;
end $$;

-- Can the signed-in partner see this category of the owner's data?
create function public.partner_can_see(p_owner uuid, p_category text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.partner_links l
    join public.sharing_settings s on s.owner_id = l.owner_id
    where l.owner_id = p_owner
      and l.partner_id = (select auth.uid())
      and case p_category
            when 'periods'     then s.share_periods
            when 'pill_status' then s.share_pill_status
            when 'mood'        then s.share_mood
            when 'energy'      then s.share_energy
            when 'symptoms'    then s.share_symptoms
            when 'sex'         then s.share_sex
            when 'notes'       then s.share_notes
            else false
          end
  );
$$;

-- ───────────────────────── tracking_settings ─────────────────────────

create table public.tracking_settings (
  owner_id        uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  mode            text not null default 'pill' check (mode in ('pill', 'natural')),
  pack_start_date date,                         -- first pill of a (any) pack; later packs follow on
  active_days     smallint not null default 21 check (active_days between 1 and 365),
  break_days      smallint not null default 7  check (break_days between 0 and 60),
  reminder_time   time not null default '21:00',
  updated_at      timestamptz not null default now(),
  synced_at       timestamptz not null default now()
);

create trigger tracking_settings_synced before insert or update on public.tracking_settings
  for each row execute function public.stamp_synced_at();
create trigger tracking_settings_newest before update on public.tracking_settings
  for each row execute function public.keep_newest();

alter table public.tracking_settings enable row level security;

create policy "tracking: owner reads" on public.tracking_settings
  for select to authenticated using (owner_id = (select auth.uid()));

create policy "tracking: partner reads if periods or pill shared" on public.tracking_settings
  for select to authenticated
  using (public.partner_can_see(owner_id, 'periods') or public.partner_can_see(owner_id, 'pill_status'));

create policy "tracking: owner inserts" on public.tracking_settings
  for insert to authenticated with check (owner_id = (select auth.uid()));

create policy "tracking: owner updates" on public.tracking_settings
  for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

revoke all on public.tracking_settings from anon;
revoke delete on public.tracking_settings from authenticated;

-- ───────────────────────── pill_logs ─────────────────────────
-- One row per day she marks a pill as taken. "Missed" is worked out by the app
-- (an active pill day in the past with no taken row).

create table public.pill_logs (
  owner_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  date       date not null,                     -- her local calendar date
  taken_at   timestamptz,
  deleted    boolean not null default false,    -- true = "un-marked"
  updated_at timestamptz not null default now(),
  synced_at  timestamptz not null default now(),
  primary key (owner_id, date)
);
create index pill_logs_sync_idx on public.pill_logs (owner_id, synced_at);

create trigger pill_logs_synced before insert or update on public.pill_logs
  for each row execute function public.stamp_synced_at();
create trigger pill_logs_newest before update on public.pill_logs
  for each row execute function public.keep_newest();

alter table public.pill_logs enable row level security;

create policy "pills: owner reads" on public.pill_logs
  for select to authenticated using (owner_id = (select auth.uid()));

create policy "pills: partner reads if pill status shared" on public.pill_logs
  for select to authenticated using (public.partner_can_see(owner_id, 'pill_status'));

create policy "pills: owner inserts" on public.pill_logs
  for insert to authenticated with check (owner_id = (select auth.uid()));

create policy "pills: owner updates" on public.pill_logs
  for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

revoke all on public.pill_logs from anon;
revoke delete on public.pill_logs from authenticated;

-- ───────────────────────── Realtime ─────────────────────────
alter publication supabase_realtime add table public.tracking_settings;
alter publication supabase_realtime add table public.pill_logs;
