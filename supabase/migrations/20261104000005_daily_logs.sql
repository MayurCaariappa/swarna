-- Swarna · migration 5 · daily log + per-field partner sharing
--
-- Apply: Supabase dashboard → SQL Editor → paste → Run.
--
-- daily_logs         her full entries (only she can read them)
-- shared_daily_logs  a partner copy holding ONLY the fields she shares, kept
--                    up to date by triggers. Unshared fields never leave her rows.
--
-- What each sharing switch reveals:
--   share_periods  → flow          share_symptoms → symptoms (incl. acne, hair changes)
--   share_mood     → mood          share_energy   → energy
--   share_sex      → sex           share_notes    → notes
--   discharge and weight are never shared.

-- ───────────────────────── daily_logs ─────────────────────────
create table public.daily_logs (
  owner_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  date       date not null,
  flow       text check (flow in ('spotting', 'light', 'medium', 'heavy')),
  symptoms   text[] not null default '{}',
  mood       text check (mood in ('happy', 'calm', 'okay', 'low', 'sad', 'irritable')),
  energy     smallint check (energy between 1 and 4),
  discharge  text check (discharge in ('none', 'sticky', 'creamy', 'watery', 'egg-white')),
  sex        text check (sex in ('none', 'protected', 'unprotected')),
  weight_kg  numeric(5, 2) check (weight_kg between 20 and 300),
  notes      text check (char_length(notes) <= 4000),
  deleted    boolean not null default false,
  updated_at timestamptz not null default now(),
  synced_at  timestamptz not null default now(),
  primary key (owner_id, date)
);
create index daily_logs_sync_idx on public.daily_logs (owner_id, synced_at);

create trigger daily_logs_synced before insert or update on public.daily_logs
  for each row execute function public.stamp_synced_at();
create trigger daily_logs_newest before update on public.daily_logs
  for each row execute function public.keep_newest();

alter table public.daily_logs enable row level security;

create policy "daily: owner reads" on public.daily_logs
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "daily: owner inserts" on public.daily_logs
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "daily: owner updates" on public.daily_logs
  for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

revoke all on public.daily_logs from anon;
revoke delete on public.daily_logs from authenticated;

-- ───────────────────────── shared_daily_logs (partner copy) ─────────────────────────
create table public.shared_daily_logs (
  owner_id   uuid not null references public.profiles (id) on delete cascade,
  date       date not null,
  flow       text,
  symptoms   text[],
  mood       text,
  energy     smallint,
  sex        text,
  notes      text,
  updated_at timestamptz not null,
  primary key (owner_id, date)
);

alter table public.shared_daily_logs enable row level security;

-- The partner (and she herself) can read it; nobody writes it except the triggers.
create policy "shared daily: owner or partner reads" on public.shared_daily_logs
  for select to authenticated
  using (owner_id = (select auth.uid()) or public.is_partner_of(owner_id));

revoke all on public.shared_daily_logs from anon;
revoke insert, update, delete on public.shared_daily_logs from authenticated;

alter publication supabase_realtime add table public.shared_daily_logs;

-- Rebuild the partner copy for one day (p_date) or all days (p_date null).
create function public.refresh_shared_daily(p_owner uuid, p_date date default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  s public.sharing_settings;
begin
  select * into s from public.sharing_settings where owner_id = p_owner;

  -- Drop rows that are deleted or no longer have anything shared.
  delete from public.shared_daily_logs x
   where x.owner_id = p_owner
     and (p_date is null or x.date = p_date)
     and not exists (
       select 1 from public.daily_logs d
        where d.owner_id = x.owner_id and d.date = x.date and not d.deleted
          and s.owner_id is not null
          and (   (s.share_periods  and d.flow is not null)
               or (s.share_symptoms and cardinality(d.symptoms) > 0)
               or (s.share_mood     and d.mood is not null)
               or (s.share_energy   and d.energy is not null)
               or (s.share_sex      and d.sex is not null)
               or (s.share_notes    and coalesce(d.notes, '') <> ''))
     );

  if s.owner_id is null then return; end if;

  insert into public.shared_daily_logs as x (owner_id, date, flow, symptoms, mood, energy, sex, notes, updated_at)
  select d.owner_id, d.date,
         case when s.share_periods  then d.flow end,
         case when s.share_symptoms and cardinality(d.symptoms) > 0 then d.symptoms end,
         case when s.share_mood     then d.mood end,
         case when s.share_energy   then d.energy end,
         case when s.share_sex      then d.sex end,
         case when s.share_notes    then nullif(d.notes, '') end,
         d.updated_at
    from public.daily_logs d
   where d.owner_id = p_owner and not d.deleted
     and (p_date is null or d.date = p_date)
     and (   (s.share_periods  and d.flow is not null)
          or (s.share_symptoms and cardinality(d.symptoms) > 0)
          or (s.share_mood     and d.mood is not null)
          or (s.share_energy   and d.energy is not null)
          or (s.share_sex      and d.sex is not null)
          or (s.share_notes    and coalesce(d.notes, '') <> ''))
  on conflict (owner_id, date) do update
     set flow = excluded.flow, symptoms = excluded.symptoms, mood = excluded.mood,
         energy = excluded.energy, sex = excluded.sex, notes = excluded.notes,
         updated_at = excluded.updated_at;
end $$;

revoke execute on function public.refresh_shared_daily(uuid, date) from public, anon, authenticated;

-- Her log changed → refresh that day's partner copy.
create function public.daily_logs_share() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.refresh_shared_daily(new.owner_id, new.date);
  return null;
end $$;

create trigger daily_logs_share after insert or update on public.daily_logs
  for each row execute function public.daily_logs_share();

-- She changed what she shares → rebuild the whole partner copy.
create function public.sharing_settings_reshare() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.refresh_shared_daily(new.owner_id, null);
  return null;
end $$;

create trigger sharing_settings_reshare after update on public.sharing_settings
  for each row
  when (old.share_periods  is distinct from new.share_periods
     or old.share_symptoms is distinct from new.share_symptoms
     or old.share_mood     is distinct from new.share_mood
     or old.share_energy   is distinct from new.share_energy
     or old.share_sex      is distinct from new.share_sex
     or old.share_notes    is distinct from new.share_notes)
  execute function public.sharing_settings_reshare();
