import Dexie, { type EntityTable, type Table } from "dexie";

// The on-phone database (IndexedDB). Everything she logs is written here
// first, so the app works with no network; src/data/sync.ts copies it to
// Supabase in the background.
//
// dirty = 1 means "changed on this phone, not yet uploaded".

export type Mode = "pill" | "natural";

export interface TrackingRow {
  owner_id: string;
  mode: Mode;
  pack_start_date: string | null; // yyyy-MM-dd
  active_days: number;
  break_days: number;
  reminder_time: string; // HH:MM or HH:MM:SS
  natural_since: string | null; // yyyy-MM-dd, set when switching to natural mode
  updated_at: string;
  dirty: 0 | 1;
}

export interface PillLogRow {
  owner_id: string;
  date: string; // yyyy-MM-dd, her local date
  taken_at: string | null;
  deleted: boolean;
  updated_at: string;
  dirty: 0 | 1;
}

export interface PeriodRow {
  id: string;
  owner_id: string;
  start_date: string; // yyyy-MM-dd
  end_date: string | null; // null = still bleeding
  deleted: boolean;
  updated_at: string;
  dirty: 0 | 1;
}

export type Flow = "spotting" | "light" | "medium" | "heavy";
export type Mood = "happy" | "calm" | "okay" | "low" | "sad" | "irritable";
export type Discharge = "none" | "sticky" | "creamy" | "watery" | "egg-white";
export type Sex = "none" | "protected" | "unprotected";

export interface DailyLogRow {
  owner_id: string;
  date: string; // yyyy-MM-dd
  flow: Flow | null;
  symptoms: string[];
  mood: Mood | null;
  energy: number | null; // 1 low … 4 high
  discharge: Discharge | null;
  sex: Sex | null;
  weight_kg: number | null;
  notes: string | null;
  deleted: boolean;
  updated_at: string;
  dirty: 0 | 1;
}

export type DailyLogFields = Omit<DailyLogRow, "owner_id" | "date" | "deleted" | "updated_at" | "dirty">;

export const EMPTY_DAILY_LOG: DailyLogFields = {
  flow: null,
  symptoms: [],
  mood: null,
  energy: null,
  discharge: null,
  sex: null,
  weight_kg: null,
  notes: null,
};

interface MetaRow {
  key: string;
  value: string;
}

export const db = new Dexie("swarna") as Dexie & {
  tracking: EntityTable<TrackingRow, "owner_id">;
  pillLogs: Table<PillLogRow, [string, string]>;
  periods: EntityTable<PeriodRow, "id">;
  dailyLogs: Table<DailyLogRow, [string, string]>;
  meta: EntityTable<MetaRow, "key">;
};

db.version(1).stores({
  tracking: "owner_id, dirty",
  pillLogs: "[owner_id+date], owner_id, dirty",
  meta: "key",
});

db.version(2).stores({
  periods: "id, owner_id, [owner_id+start_date], dirty",
});

db.version(3).stores({
  dailyLogs: "[owner_id+date], owner_id, dirty",
});

export const DEFAULT_TRACKING: Omit<
  TrackingRow,
  "owner_id" | "updated_at" | "dirty"
> = {
  mode: "pill",
  pack_start_date: null,
  active_days: 21,
  break_days: 7,
  reminder_time: "21:00",
  natural_since: null,
};

/** Wipe everything stored on this phone (used on sign-out). */
export async function clearLocalData() {
  await Promise.all(db.tables.map((t) => t.clear()));
}
