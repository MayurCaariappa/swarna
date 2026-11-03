-- Swarna · migration 3 · Web Push reminders
--
-- Apply: Supabase dashboard → SQL Editor → paste → Run.
-- BEFORE this file, run the one-off secrets snippet (supabase/.temp/setup-cron-secrets.sql,
-- not committed) so the cron job knows where to call and with which secret.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- ───────────────────────── push_subscriptions ─────────────────────────
-- One row per phone/browser that turned on reminders.
create table public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

create policy "push: own rows" on public.push_subscriptions
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.push_subscriptions from anon;

-- ───────────────────────── notification_log ─────────────────────────
-- Makes every notification send-once: (user, kind, ref) can only be inserted once.
-- Only the Edge Function (service role) touches this table.
create table public.notification_log (
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind    text not null,        -- 'pill', 'pack-tomorrow', 'bleed-soon', 'partner-pill', …
  ref     text not null,        -- e.g. '2026-11-03:30' (date + re-remind stage)
  sent_at timestamptz not null default now(),
  primary key (user_id, kind, ref)
);
alter table public.notification_log enable row level security;  -- no policies = no app access
revoke all on public.notification_log from anon, authenticated;

-- ───────────────────────── Scheduling ─────────────────────────
-- Every minute: call the send-reminders Edge Function. It works out what's due
-- in each person's own timezone. (Also keeps the free project from pausing.)
select cron.schedule(
  'swarna-reminders',
  '* * * * *',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'swarna_functions_url') || '/send-reminders',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'swarna_cron_secret')
               ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
  $$
);

-- Daily tidy-up of the send log.
select cron.schedule(
  'swarna-cleanup',
  '17 3 * * *',
  $$ delete from public.notification_log where sent_at < now() - interval '90 days'; $$
);
