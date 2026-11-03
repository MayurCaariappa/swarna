import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import Disclaimer from "../components/Disclaimer";
import { expectedBleed, packDay, type PackConfig } from "../lib/pill";
import { supabase } from "../lib/supabase";
import type { SharingSettings } from "../lib/types";
import { useToday } from "../lib/useToday";

interface Shared {
  sharing: Pick<SharingSettings, "share_periods" | "share_pill_status"> | null;
  tracking: {
    mode: "pill" | "natural";
    pack_start_date: string | null;
    active_days: number;
    break_days: number;
  } | null;
  pillToday: { taken_at: string | null; deleted: boolean } | null;
  pillDate: string | null;
}

const EMPTY: Shared = { sharing: null, tracking: null, pillToday: null, pillDate: null };
const cacheKey = (owner: string) => `swarna.partner.${owner}`;

/** Read-only view of what she has chosen to share. */
export default function PartnerHome() {
  const { counterpart, link } = useAuth();
  const ownerId = link!.owner_id;
  const name = counterpart?.display_name || "Your partner";
  // Use HER timezone so "today" matches her pill day.
  const today = useToday(counterpart?.timezone);

  const [data, setData] = useState<Shared>(() => {
    try {
      return JSON.parse(localStorage.getItem(cacheKey(ownerId)) ?? "") as Shared;
    } catch {
      return EMPTY;
    }
  });

  const load = useCallback(async () => {
    const [s, t, p] = await Promise.all([
      supabase.from("sharing_settings").select("share_periods, share_pill_status").eq("owner_id", ownerId).maybeSingle(),
      supabase
        .from("tracking_settings")
        .select("mode, pack_start_date, active_days, break_days")
        .eq("owner_id", ownerId)
        .maybeSingle(),
      supabase.from("pill_logs").select("taken_at, deleted").eq("owner_id", ownerId).eq("date", today).maybeSingle(),
    ]);
    if (s.error || t.error || p.error) return; // offline: keep cached view
    const next: Shared = { sharing: s.data, tracking: t.data, pillToday: p.data, pillDate: today };
    setData(next);
    try {
      localStorage.setItem(cacheKey(ownerId), JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, [ownerId, today]);

  // Load now, on every change she makes (Realtime), and when the app reopens.
  useEffect(() => {
    void load();
    const channel = supabase.channel(`partner-${ownerId}`);
    for (const table of ["sharing_settings", "tracking_settings", "pill_logs"]) {
      channel.on("postgres_changes", { event: "*", schema: "public", table, filter: `owner_id=eq.${ownerId}` }, () =>
        load(),
      );
    }
    channel.subscribe();
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      void supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [ownerId, load]);

  const { sharing, tracking } = data;
  const showPeriods = sharing?.share_periods ?? false;
  const showPill = sharing?.share_pill_status ?? false;
  const pillMode = tracking?.mode === "pill" && tracking.pack_start_date;

  const cfg: PackConfig | null = pillMode
    ? { packStart: tracking.pack_start_date!, activeDays: tracking.active_days, breakDays: tracking.break_days }
    : null;
  const todayDate = parseISO(today);
  const info = cfg ? packDay(cfg, todayDate) : null;
  const bleed = info && cfg ? expectedBleed(info, cfg) : null;
  const takenToday = data.pillDate === today && data.pillToday && !data.pillToday.deleted;

  return (
    <div className="stack">
      <h1>{name}</h1>

      {!showPeriods && !showPill && (
        <section className="card">
          <p className="muted">{name} isn't sharing cycle or pill info with you right now.</p>
        </section>
      )}

      {(showPeriods || showPill) && !tracking && (
        <section className="card">
          <p className="muted">{name} hasn't set up tracking yet.</p>
        </section>
      )}

      {showPeriods && info && cfg && (
        <section className="card hero">
          {info.kind === "active" && (
            <>
              <p className="muted">Pill pack</p>
              <p className="hero-text">
                Pill {info.number} of {cfg.activeDays}
              </p>
              <p className="muted">
                Break starts in {differenceInCalendarDays(info.breakStart, todayDate)} days
              </p>
            </>
          )}
          {info.kind === "off" && (
            <>
              <p className="muted">Break week</p>
              <p className="hero-text">
                Off day {info.number} of {cfg.breakDays}
              </p>
              <p className="muted">New pack starts {format(info.nextPackStart, "EEEE")}</p>
            </>
          )}
          {info.kind === "before" && <p className="hero-text">New pack starts {format(info.packStart, "EEE d MMM")}</p>}
          {bleed && info.kind !== "before" && differenceInCalendarDays(bleed.end, todayDate) >= 0 && (
            <p className="muted small">
              Bleed expected around {format(bleed.start, "EEE d MMM")}–{format(bleed.end, "EEE d MMM")}
            </p>
          )}
        </section>
      )}

      {showPeriods && tracking?.mode === "natural" && (
        <section className="card">
          <p className="muted">Cycle predictions will appear here once {name} starts logging periods.</p>
        </section>
      )}

      {showPill && pillMode && info?.kind === "active" && (
        <section className="card">
          <p className="muted small">Pill today</p>
          {takenToday ? (
            <p className="taken-badge">
              Taken ✓
              {data.pillToday?.taken_at && ` at ${format(parseISO(data.pillToday.taken_at), "HH:mm")}`}
            </p>
          ) : (
            <p>Not marked yet</p>
          )}
        </section>
      )}

      <Disclaimer />
    </div>
  );
}
