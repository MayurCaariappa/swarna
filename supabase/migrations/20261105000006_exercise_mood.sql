-- Swarna · migration 6 · exercise logging + "anxious" mood
--
-- Apply: Supabase dashboard → SQL Editor → paste → Run.
-- Apply this BEFORE pushing the matching app code (the app syncs these columns).
--
-- daily_logs.exercise        rest / light / moderate / intense (one per day)
-- daily_logs.exercise_types  walk, yoga, pilates, strength, cardio, other (any)
-- sharing_settings.share_exercise  new switch, OFF by default, so nothing new
--                                  reaches the partner until she turns it on.
-- New symptoms (cravings, nausea, trouble sleeping, upset stomach) need no
-- change here: symptoms is a free text[] column.

-- ───────────────────────── her log ─────────────────────────
alter table public.daily_logs
  add column exercise text check (exercise in ('rest', 'light', 'moderate', 'intense')),
  add column exercise_types text[] not null default '{}';

alter table public.daily_logs drop constraint daily_logs_mood_check;
alter table public.daily_logs add constraint daily_logs_mood_check
  check (mood in ('happy', 'calm', 'okay', 'low', 'sad', 'irritable', 'anxious'));

-- ───────────────────────── sharing ─────────────────────────
alter table public.sharing_settings
  add column share_exercise boolean not null default false;

alter table public.shared_daily_logs
  add column exercise text,
  add column exercise_types text[];

-- Same as migration 5, plus exercise (shown only when share_exercise is on).
create or replace function public.refresh_shared_daily(p_owner uuid, p_date date default null) returns void
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
               or (s.share_exercise and (d.exercise is not null or cardinality(d.exercise_types) > 0))
               or (s.share_sex      and d.sex is not null)
               or (s.share_notes    and coalesce(d.notes, '') <> ''))
     );

  if s.owner_id is null then return; end if;

  insert into public.shared_daily_logs as x
         (owner_id, date, flow, symptoms, mood, energy, exercise, exercise_types, sex, notes, updated_at)
  select d.owner_id, d.date,
         case when s.share_periods  then d.flow end,
         case when s.share_symptoms and cardinality(d.symptoms) > 0 then d.symptoms end,
         case when s.share_mood     then d.mood end,
         case when s.share_energy   then d.energy end,
         case when s.share_exercise then d.exercise end,
         case when s.share_exercise and cardinality(d.exercise_types) > 0 then d.exercise_types end,
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
          or (s.share_exercise and (d.exercise is not null or cardinality(d.exercise_types) > 0))
          or (s.share_sex      and d.sex is not null)
          or (s.share_notes    and coalesce(d.notes, '') <> ''))
  on conflict (owner_id, date) do update
     set flow = excluded.flow, symptoms = excluded.symptoms, mood = excluded.mood,
         energy = excluded.energy, exercise = excluded.exercise,
         exercise_types = excluded.exercise_types, sex = excluded.sex,
         notes = excluded.notes, updated_at = excluded.updated_at;
end $$;

revoke execute on function public.refresh_shared_daily(uuid, date) from public, anon, authenticated;

-- Rebuild the partner copy when the new switch changes too.
drop trigger sharing_settings_reshare on public.sharing_settings;
create trigger sharing_settings_reshare after update on public.sharing_settings
  for each row
  when (old.share_periods  is distinct from new.share_periods
     or old.share_symptoms is distinct from new.share_symptoms
     or old.share_mood     is distinct from new.share_mood
     or old.share_energy   is distinct from new.share_energy
     or old.share_exercise is distinct from new.share_exercise
     or old.share_sex      is distinct from new.share_sex
     or old.share_notes    is distinct from new.share_notes)
  execute function public.sharing_settings_reshare();
