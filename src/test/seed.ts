import { vi } from "vitest";
import { db, DEFAULT_TRACKING, EMPTY_DAILY_LOG, type DailyLogRow, type TrackingRow } from "../data/db";
import { OWNER_ID } from "./harness";

// Helpers to put her data on the (fake) phone database before a screen renders.

/** Freeze "now" (only the clock — timers keep running for the database). */
export function setNow(iso: string) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(iso));
}

export const putTracking = (patch: Partial<TrackingRow> = {}) =>
  db.tracking.put({ ...DEFAULT_TRACKING, owner_id: OWNER_ID, updated_at: "", dirty: 0, ...patch });

export const putPeriod = (id: string, start_date: string, end_date: string | null = null) =>
  db.periods.put({ id, owner_id: OWNER_ID, start_date, end_date, deleted: false, updated_at: "", dirty: 0 });

export const putTaken = (...dates: string[]) =>
  db.pillLogs.bulkPut(
    dates.map((date) => ({ owner_id: OWNER_ID, date, taken_at: `${date}T09:00:00`, deleted: false, updated_at: "", dirty: 0 as const })),
  );

export const putLog = (date: string, f: Partial<DailyLogRow> = {}) =>
  db.dailyLogs.put({ ...EMPTY_DAILY_LOG, owner_id: OWNER_ID, date, deleted: false, updated_at: "", dirty: 0, ...f });
