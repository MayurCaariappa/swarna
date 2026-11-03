-- Swarna · migration 1 · accounts, partner linking, sharing settings, feedback
--
-- How to apply (pick one):
--   a) Supabase dashboard → SQL Editor → New query → paste this whole file → Run
--   b) npx supabase link --project-ref <ref>  then  npx supabase db push
--
-- Every table has Row Level Security (RLS) ON. Writes that need extra checks
-- (choosing a role, creating/redeeming invite codes) go through the functions
-- at the bottom, which validate everything server-side.

-- ───────────────────────── Types ─────────────────────────
create type public.user_role as enum ('owner', 'partner');

-- ───────────────────────── Tables ─────────────────────────

-- One row per login. Created automatically when someone signs up.
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  role         public.user_role,              -- null until onboarding is done
  display_name text not null default '',
  timezone     text not null default 'UTC',
  created_at   timestamptz not null default now()
);

-- The owner ↔ partner link. One partner per owner, one owner per partner.
create table public.partner_links (
  owner_id   uuid primary key references public.profiles (id) on delete cascade,
  partner_id uuid not null unique references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (owner_id <> partner_id)
);

-- Short-lived codes the owner generates and the partner types in.
create table public.invite_codes (
  code       text primary key,
  owner_id   uuid not null references public.profiles (id) on delete cascade,
  expires_at timestamptz not null default now() + interval '7 days',
  used_by    uuid references public.profiles (id) on delete set null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);
create index invite_codes_owner_idx on public.invite_codes (owner_id);

-- What the owner lets the partner see. Private by default except periods.
create table public.sharing_settings (
  owner_id                uuid primary key references public.profiles (id) on delete cascade,
  share_periods           boolean not null default true,   -- bleeds + predictions + phase
  share_pill_status       boolean not null default false,  -- "taken today ✓"
  share_mood              boolean not null default false,
  share_energy            boolean not null default false,
  share_symptoms          boolean not null default false,
  share_sex               boolean not null default false,
  share_notes             boolean not null default false,
  partner_pill_alert      boolean not null default false,  -- alert partner if pill not taken…
  partner_pill_alert_time time,                            -- …by this local time
  updated_at              timestamptz not null default now()
);

-- In-app feedback / suggestions.
create table public.feedback (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  message    text not null check (char_length(message) between 1 and 4000),
  app_version text,
  created_at timestamptz not null default now()
);

-- ───────────────────────── Helpers ─────────────────────────

-- Generic updated_at bumper.
create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger sharing_settings_touch before update on public.sharing_settings
  for each row execute function public.touch_updated_at();

-- Create a profile row whenever a new auth user signs up.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- True if the signed-in user is the linked partner of p_owner.
-- SECURITY DEFINER so RLS policies can call it without recursion.
create function public.is_partner_of(p_owner uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.partner_links
    where owner_id = p_owner and partner_id = (select auth.uid())
  );
$$;

-- True if p_other is linked to the signed-in user (either direction).
create function public.is_linked_with(p_other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.partner_links
    where (owner_id = (select auth.uid()) and partner_id = p_other)
       or (partner_id = (select auth.uid()) and owner_id = p_other)
  );
$$;

-- ───────────────────────── Row Level Security ─────────────────────────
alter table public.profiles         enable row level security;
alter table public.partner_links    enable row level security;
alter table public.invite_codes     enable row level security;
alter table public.sharing_settings enable row level security;
alter table public.feedback         enable row level security;

-- profiles: see yourself and the person you're linked with; edit only your
-- own name/timezone (role is set via set_role()).
create policy "profiles: read self or linked" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.is_linked_with(id));

create policy "profiles: update self" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (display_name, timezone) on public.profiles to authenticated;

-- partner_links: either side can see and remove the link. Creation only via redeem_invite().
create policy "links: read own" on public.partner_links
  for select to authenticated
  using (owner_id = (select auth.uid()) or partner_id = (select auth.uid()));

create policy "links: either side can unlink" on public.partner_links
  for delete to authenticated
  using (owner_id = (select auth.uid()) or partner_id = (select auth.uid()));

revoke insert, update on public.partner_links from anon, authenticated;

-- invite_codes: owner can see and delete their own codes. Creation via create_invite().
create policy "invites: owner reads" on public.invite_codes
  for select to authenticated using (owner_id = (select auth.uid()));

create policy "invites: owner deletes" on public.invite_codes
  for delete to authenticated using (owner_id = (select auth.uid()));

revoke insert, update on public.invite_codes from anon, authenticated;

-- sharing_settings: owner reads + edits; linked partner can read (so the app
-- knows what to show).
create policy "sharing: owner reads, partner reads" on public.sharing_settings
  for select to authenticated
  using (owner_id = (select auth.uid()) or public.is_partner_of(owner_id));

create policy "sharing: owner updates" on public.sharing_settings
  for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

revoke insert, delete on public.sharing_settings from anon, authenticated;

-- feedback: write your own, read your own.
create policy "feedback: insert own" on public.feedback
  for insert to authenticated with check (user_id = (select auth.uid()));

create policy "feedback: read own" on public.feedback
  for select to authenticated using (user_id = (select auth.uid()));

-- Nothing here is for logged-out visitors.
revoke all on public.profiles, public.partner_links, public.invite_codes,
              public.sharing_settings, public.feedback from anon;

-- ───────────────────────── Functions the app calls ─────────────────────────

-- Onboarding: "I'm tracking" (owner) or "I'm the partner".
create function public.set_role(p_role public.user_role, p_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Not signed in'; end if;

  if exists (select 1 from public.partner_links where owner_id = v_uid or partner_id = v_uid) then
    raise exception 'Unlink your partner before changing your role';
  end if;

  update public.profiles
     set role = p_role,
         display_name = coalesce(nullif(trim(p_name), ''), display_name)
   where id = v_uid;

  if p_role = 'owner' then
    insert into public.sharing_settings (owner_id) values (v_uid) on conflict do nothing;
  end if;
end $$;

-- Owner: make a fresh 6-character invite code (replaces any unused ones).
create function public.create_invite() returns public.invite_codes
language plpgsql security definer set search_path = '' as $$
declare
  v_uid      uuid := auth.uid();
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  -- no 0/O/1/I
  v_code     text;
  v_row      public.invite_codes;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;

  if not exists (select 1 from public.profiles where id = v_uid and role = 'owner') then
    raise exception 'Only the person tracking can create an invite';
  end if;

  if exists (select 1 from public.partner_links where owner_id = v_uid) then
    raise exception 'You already have a linked partner';
  end if;

  delete from public.invite_codes where owner_id = v_uid and used_at is null;

  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.invite_codes where code = v_code);
  end loop;

  insert into public.invite_codes (code, owner_id) values (v_code, v_uid) returning * into v_row;
  return v_row;
end $$;

-- Partner: type in the code to link with the owner.
create function public.redeem_invite(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := auth.uid();
  v_invite public.invite_codes;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;

  if not exists (select 1 from public.profiles where id = v_uid and role = 'partner') then
    raise exception 'Only a partner account can use an invite code';
  end if;

  if exists (select 1 from public.partner_links where partner_id = v_uid) then
    raise exception 'You are already linked';
  end if;

  select * into v_invite from public.invite_codes
   where code = upper(trim(p_code))
   for update;

  if v_invite.code is null or v_invite.used_at is not null or v_invite.expires_at < now() then
    raise exception 'That code is invalid or has expired';
  end if;

  if exists (select 1 from public.partner_links where owner_id = v_invite.owner_id) then
    raise exception 'That person already has a linked partner';
  end if;

  insert into public.partner_links (owner_id, partner_id) values (v_invite.owner_id, v_uid);
  update public.invite_codes set used_by = v_uid, used_at = now() where code = v_invite.code;

  return v_invite.owner_id;
end $$;

-- Only signed-in users may call the app functions.
revoke execute on function public.set_role(public.user_role, text) from public, anon;
revoke execute on function public.create_invite() from public, anon;
revoke execute on function public.redeem_invite(text) from public, anon;
grant  execute on function public.set_role(public.user_role, text) to authenticated;
grant  execute on function public.create_invite() to authenticated;
grant  execute on function public.redeem_invite(text) to authenticated;

-- ───────────────────────── Realtime ─────────────────────────
-- Lets her phone notice instantly when the partner redeems the invite.
alter publication supabase_realtime add table public.partner_links;
alter publication supabase_realtime add table public.sharing_settings;
