import { addDays, format, parseISO } from "date-fns";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "../auth/AuthProvider";
import type { PeriodLike, TrackingLike } from "../lib/calendarDays";
import { supabase } from "../lib/supabase";
import type { SharingSettings } from "../lib/types";
import { useToday } from "../lib/useToday";

// Everything the partner can see, loaded once for all partner screens, kept
// live with Realtime, and cached on the phone so it opens offline.
// The database (RLS) decides what's visible; anything not shared simply
// comes back empty.

export interface SharedPeriod extends PeriodLike {
  id: string;
}

export interface PartnerSnapshot {
  sharing: Pick<SharingSettings, "share_periods" | "share_pill_status"> | null;
  tracking: TrackingLike | null;
  periods: SharedPeriod[];
  takenDates: string[]; // pill marked taken (last ~4 months), only if shared
  takenAt: Record<string, string | null>;
  /** Her daily logs, only the fields she shares, by date (last ~4 months). */
  logs: Record<string, SharedDayLog>;
  loaded: boolean;
}

export interface SharedDayLog {
  date: string;
  flow: string | null;
  symptoms: string[] | null;
  mood: string | null;
  energy: number | null;
  exercise: string | null;
  exercise_types: string[] | null;
  sex: string | null;
  notes: string | null;
}

const EMPTY: PartnerSnapshot = {
  sharing: null,
  tracking: null,
  periods: [],
  takenDates: [],
  takenAt: {},
  logs: {},
  loaded: false,
};

interface Ctx extends PartnerSnapshot {
  ownerId: string;
  ownerName: string;
  today: string;
}

const PartnerContext = createContext<Ctx | null>(null);
const cacheKey = (owner: string) => `swarna.partner2.${owner}`;

export function PartnerDataProvider({ children }: { children: ReactNode }) {
  const { link, counterpart } = useAuth();
  const ownerId = link!.owner_id;
  // Her timezone, so "today" matches her pill day.
  const today = useToday(counterpart?.timezone);

  const [snap, setSnap] = useState<PartnerSnapshot>(() => {
    try {
      return {
        ...EMPTY,
        ...JSON.parse(localStorage.getItem(cacheKey(ownerId)) ?? "{}"),
      };
    } catch {
      return EMPTY;
    }
  });

  const load = useCallback(async () => {
    const since = format(addDays(parseISO(today), -130), "yyyy-MM-dd");
    const [s, t, p, l, d] = await Promise.all([
      supabase
        .from("sharing_settings")
        .select("share_periods, share_pill_status")
        .eq("owner_id", ownerId)
        .maybeSingle(),
      supabase
        .from("tracking_settings")
        .select("mode, pack_start_date, active_days, break_days, natural_since")
        .eq("owner_id", ownerId)
        .maybeSingle(),
      supabase
        .from("periods")
        .select("id, start_date, end_date")
        .eq("owner_id", ownerId)
        .eq("deleted", false)
        .order("start_date", { ascending: true }),
      supabase
        .from("pill_logs")
        .select("date, taken_at")
        .eq("owner_id", ownerId)
        .eq("deleted", false)
        .gte("date", since),
      supabase
        .from("shared_daily_logs")
        .select(
          "date, flow, symptoms, mood, energy, exercise, exercise_types, sex, notes",
        )
        .eq("owner_id", ownerId)
        .gte("date", since),
    ]);
    if (s.error || t.error || p.error || l.error || d.error) return; // offline: keep the cached view
    const next: PartnerSnapshot = {
      sharing: s.data,
      tracking: t.data,
      periods: p.data ?? [],
      takenDates: (l.data ?? []).map((r) => r.date),
      takenAt: Object.fromEntries(
        (l.data ?? []).map((r) => [r.date, r.taken_at]),
      ),
      logs: Object.fromEntries((d.data ?? []).map((r) => [r.date, r])),
      loaded: true,
    };
    setSnap(next);
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
    for (const table of [
      "sharing_settings",
      "tracking_settings",
      "pill_logs",
      "periods",
      "shared_daily_logs",
    ]) {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: `owner_id=eq.${ownerId}`,
        },
        () => load(),
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

  return (
    <PartnerContext.Provider
      value={{
        ...snap,
        ownerId,
        ownerName: counterpart?.display_name || "Your partner",
        today,
      }}
    >
      {children}
    </PartnerContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePartnerData() {
  const ctx = useContext(PartnerContext);
  if (!ctx)
    throw new Error("usePartnerData must be used inside <PartnerDataProvider>");
  return ctx;
}
