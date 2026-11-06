// Swarna · send-reminders Edge Function
//
// Called two ways:
//  1. Every minute by pg_cron (header x-cron-secret) → sends whatever is due.
//  2. By the app with the user's login (body {"test": true}) → sends a test push
//     to that user's devices.
//
// Secrets (npx supabase secrets set --env-file supabase/functions/.env):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, CRON_SECRET
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.

import {
  createClient,
  type SupabaseClient,
} from "npm:@supabase/supabase-js@2.118.0";
import webpush from "npm:web-push@3.6.7";
import { predictNextStart } from "../_shared/cycle.ts";
import {
  addDays,
  calibratedBleedOffDay,
  daysBetween,
  localNow,
  packDay,
  toMinutes,
} from "../_shared/pack.ts";

const WINDOW = 10; // minutes: a reminder is still sent if cron runs up to 10 min late
const PILL_STAGES = [0, 30, 60]; // first reminder, then +30 and +60 until taken
const BLEED_NOTICE_TIME = 10 * 60; // 10:00 local for "bleed expected in 2 days" / "late"
const LATE_DAYS = 3; // "bleed late" after this many days past the expected start

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// The subject must be a URL or mailto: — accept a bare domain too.
const rawSubject = (Deno.env.get("VAPID_SUBJECT") ?? "").trim();
const vapidSubject = /^(https?:|mailto:)/.test(rawSubject)
  ? rawSubject
  : `https://${rawSubject || "swarna.vercel.app"}`;

webpush.setVapidDetails(
  vapidSubject,
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
);

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  {
    auth: { persistSession: false },
  },
);

interface Push {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

// ───────────── sending ─────────────

async function sendTo(userId: string, push: Push): Promise<number> {
  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);
  let delivered = 0;
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(push),
        { TTL: 60 * 60, urgency: "high" },
      );
      delivered++;
    } catch (err) {
      const code = (err as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) {
        // Phone unsubscribed / app removed: forget this device.
        await admin.from("push_subscriptions").delete().eq("id", s.id);
      } else {
        console.error("push failed", code, (err as Error).message);
      }
    }
  }
  return delivered;
}

/** Send once per (user, kind, ref). Returns false if it was already sent. */
async function sendOnce(userId: string, kind: string, ref: string, push: Push) {
  const { data, error } = await admin
    .from("notification_log")
    .upsert(
      { user_id: userId, kind, ref },
      { onConflict: "user_id,kind,ref", ignoreDuplicates: true },
    )
    .select();
  if (error || !data?.length) return false;
  await sendTo(userId, push);
  return true;
}

const inWindow = (now: number, at: number) => now >= at && now < at + WINDOW;

// ───────────── what's due ─────────────

async function runSchedule(db: SupabaseClient) {
  const { data: owners, error } = await db
    .from("tracking_settings")
    .select(
      "owner_id, mode, pack_start_date, active_days, break_days, reminder_time, natural_since, profiles!inner(display_name, timezone)",
    );
  if (error) throw error;

  let sent = 0;
  for (const t of owners ?? []) {
    const profile = t.profiles as unknown as {
      display_name: string;
      timezone: string;
    };
    const name = profile.display_name || "She";
    const now = localNow(profile.timezone);

    // Natural-cycle mode: only the "late" check applies.
    if (t.mode === "natural") {
      if (await checkNaturalLate(db, t.owner_id, t.natural_since, now)) sent++;
      continue;
    }
    if (!t.pack_start_date) continue;

    const today = packDay(
      t.pack_start_date,
      t.active_days,
      t.break_days,
      now.date,
    );
    const reminderAt = toMinutes(t.reminder_time);

    const [{ data: taken }, { data: link }, { data: sharing }] =
      await Promise.all([
        db
          .from("pill_logs")
          .select("date")
          .eq("owner_id", t.owner_id)
          .eq("date", now.date)
          .eq("deleted", false)
          .maybeSingle(),
        db
          .from("partner_links")
          .select("partner_id")
          .eq("owner_id", t.owner_id)
          .maybeSingle(),
        db
          .from("sharing_settings")
          .select(
            "share_periods, share_pill_status, partner_pill_alert, partner_pill_alert_time",
          )
          .eq("owner_id", t.owner_id)
          .maybeSingle(),
      ]);

    // 1. Daily pill reminder + re-reminders, active days only, until marked taken.
    if (today.kind === "active" && !taken) {
      for (const stage of PILL_STAGES) {
        if (!inWindow(now.minutes, reminderAt + stage)) continue;
        const ok = await sendOnce(t.owner_id, "pill", `${now.date}:${stage}`, {
          title:
            stage === 0
              ? `Time for pill ${today.number} 💊`
              : `Pill ${today.number} not marked yet`,
          body:
            stage === 0 ? "Tap to mark it taken." : "Tap when you've taken it.",
          url: "/today?take=1",
          tag: `pill-${now.date}`,
        });
        if (ok) sent++;
      }
    }

    // 2. "New pack starts tomorrow", on the last off day, in the evening.
    if (today.kind === "off" && today.number === t.break_days) {
      const at = Math.max(reminderAt, 18 * 60);
      if (inWindow(now.minutes, at)) {
        if (
          await sendOnce(t.owner_id, "pack-tomorrow", now.date, {
            title: "New pack starts tomorrow 💊",
            body: "Have your next pack ready.",
            url: "/today",
          })
        )
          sent++;
      }
    }

    // 3. Withdrawal bleed expected in 2 days → her, and partner if periods are shared.
    // When her bleed usually starts (learned from her logged bleeds).
    const { data: recentPeriods } = await db
      .from("periods")
      .select("start_date")
      .eq("owner_id", t.owner_id)
      .eq("deleted", false)
      .gte("start_date", addDays(now.date, -200))
      .order("start_date", { ascending: true });
    const bleedDay = calibratedBleedOffDay(
      t.pack_start_date,
      t.active_days,
      t.break_days,
      recentPeriods ?? [],
    );
    const inTwo = packDay(
      t.pack_start_date,
      t.active_days,
      t.break_days,
      addDays(now.date, 2),
    );
    if (
      bleedDay &&
      inTwo.kind === "off" &&
      inTwo.number === bleedDay &&
      inWindow(now.minutes, BLEED_NOTICE_TIME)
    ) {
      if (
        await sendOnce(t.owner_id, "bleed-soon", now.date, {
          title: "Bleed expected in about 2 days",
          body: "Based on your pack schedule. Just a heads-up.",
          url: "/today",
        })
      )
        sent++;
      if (link && sharing?.share_periods) {
        if (
          await sendOnce(
            link.partner_id,
            "bleed-soon",
            `${t.owner_id}:${now.date}`,
            {
              title: `${name}'s bleed is expected in about 2 days`,
              body: "Based on her pack schedule.",
              url: "/partner",
            },
          )
        )
          sent++;
      }
    }

    // 3b. No bleed logged 3+ days after the expected start of this break → her.
    if (
      bleedDay &&
      today.kind === "off" &&
      today.number === bleedDay + LATE_DAYS &&
      inWindow(now.minutes, BLEED_NOTICE_TIME)
    ) {
      const breakStart = addDays(now.date, -(today.number - 1));
      const { count } = await db
        .from("periods")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", t.owner_id)
        .eq("deleted", false)
        // A bleed that began in the last 2 active days counts as this break's bleed.
        .gte("start_date", addDays(breakStart, -2));
      if (
        !count &&
        (await sendOnce(t.owner_id, "bleed-late", breakStart, {
          title: "No bleed logged yet this break",
          body: "If it has started, tap to log it. Predictions are estimates.",
          url: "/today",
        }))
      )
        sent++;
    }

    // 4. Optional: tell the partner if the pill isn't marked by her chosen time.
    if (
      link &&
      sharing?.share_pill_status && // the alert reveals pill status, so it needs that switch on
      sharing?.partner_pill_alert &&
      sharing.partner_pill_alert_time &&
      today.kind === "active" &&
      !taken &&
      inWindow(now.minutes, toMinutes(sharing.partner_pill_alert_time))
    ) {
      if (
        await sendOnce(
          link.partner_id,
          "partner-pill",
          `${t.owner_id}:${now.date}`,
          {
            title: `${name}'s pill isn't marked yet today`,
            body: "Maybe a gentle nudge?",
            url: "/partner",
          },
        )
      )
        sent++;
    }
  }
  return sent;
}

/** Natural mode: period 3+ days later than predicted → tell her once. */
async function checkNaturalLate(
  db: SupabaseClient,
  ownerId: string,
  naturalSince: string | null,
  now: { date: string; minutes: number },
) {
  if (!inWindow(now.minutes, BLEED_NOTICE_TIME)) return false;
  let q = db
    .from("periods")
    .select("start_date, end_date")
    .eq("owner_id", ownerId)
    .eq("deleted", false)
    .order("start_date", { ascending: true });
  if (naturalSince) q = q.gte("start_date", naturalSince);
  const { data: periods } = await q;
  const next = predictNextStart(periods ?? []);
  if (!next || daysBetween(next, now.date) !== LATE_DAYS) return false;
  return sendOnce(ownerId, "bleed-late", next, {
    title: `Period ${LATE_DAYS} days later than predicted`,
    body: "Predictions are estimates. If it has started, tap to log it.",
    url: "/today",
  });
}

/** Instant: she logged "period started" → tell the partner (if periods are shared). */
async function notifyPeriodStarted(periodId: string) {
  const { data: period } = await admin
    .from("periods")
    .select("id, owner_id, start_date, deleted")
    .eq("id", periodId)
    .maybeSingle();
  if (!period || period.deleted) return 0;

  const [{ data: link }, { data: sharing }, { data: owner }] =
    await Promise.all([
      admin
        .from("partner_links")
        .select("partner_id")
        .eq("owner_id", period.owner_id)
        .maybeSingle(),
      admin
        .from("sharing_settings")
        .select("share_periods")
        .eq("owner_id", period.owner_id)
        .maybeSingle(),
      admin
        .from("profiles")
        .select("display_name")
        .eq("id", period.owner_id)
        .maybeSingle(),
    ]);
  if (!link || !sharing?.share_periods) return 0;

  const name = owner?.display_name || "Your partner";
  const ok = await sendOnce(link.partner_id, "period-started", period.id, {
    title: `${name}'s period started`,
    body: "Logged just now. Maybe extra care today 💛",
    url: "/partner",
  });
  return ok ? 1 : 0;
}

// ───────────── entry point ─────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });

  try {
    // Cron call
    const cronSecret = Deno.env.get("CRON_SECRET");
    if (cronSecret && req.headers.get("x-cron-secret") === cronSecret) {
      const body = await req.json().catch(() => ({}));
      // From the periods trigger (migration 4)
      if (body?.event === "period-started" && body.period_id) {
        return json({
          ok: true,
          sent: await notifyPeriodStarted(body.period_id),
        });
      }
      const sent = await runSchedule(admin);
      return json({ ok: true, sent });
    }

    // App call: "Send test notification"
    const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Unauthorized" }, 401);
    const {
      data: { user },
    } = await admin.auth.getUser(token);
    if (!user) return json({ error: "Unauthorized" }, 401);

    const delivered = await sendTo(user.id, {
      title: "Swarna reminders are on 🔔",
      body: "This is a test. Real reminders will look like this.",
      url: "/",
    });
    return json({ ok: true, delivered });
  } catch (err) {
    console.error(err);
    return json({ error: (err as Error).message }, 500);
  }
});
