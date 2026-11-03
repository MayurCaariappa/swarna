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

interface MetaRow {
  key: string;
  value: string;
}

export const db = new Dexie("swarna") as Dexie & {
  tracking: EntityTable<TrackingRow, "owner_id">;
  pillLogs: Table<PillLogRow, [string, string]>;
  meta: EntityTable<MetaRow, "key">;
};

db.version(1).stores({
  tracking: "owner_id, dirty",
  pillLogs: "[owner_id+date], owner_id, dirty",
  meta: "key",
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
};

/** Wipe everything stored on this phone (used on sign-out). */
export async function clearLocalData() {
  await Promise.all(db.tables.map((t) => t.clear()));
}
