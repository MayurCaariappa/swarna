import {
  DEFAULT_TRACKING,
  EMPTY_DAILY_LOG,
  db,
  type DailyLogFields,
  type PeriodRow,
  type TrackingRow,
} from "./db";
import { requestSync } from "./sync";

// Every write goes to the phone first (instant, works offline), then syncs.

export async function setPillTaken(
  ownerId: string,
  date: string,
  taken: boolean,
) {
  const now = new Date().toISOString();
  await db.pillLogs.put({
    owner_id: ownerId,
    date,
    taken_at: taken ? now : null,
    deleted: !taken,
    updated_at: now,
    dirty: 1,
  });
  requestSync();
}

/** Mark many days taken at once (used when setting up a pack mid-way). */
export async function markPillsTaken(ownerId: string, dates: string[]) {
  const now = new Date().toISOString();
  await db.pillLogs.bulkPut(
    dates.map((date) => ({
      owner_id: ownerId,
      date,
      taken_at: now,
      deleted: false,
      updated_at: now,
      dirty: 1 as const,
    })),
  );
  requestSync();
}

export async function saveTracking(
  ownerId: string,
  patch: Partial<Omit<TrackingRow, "owner_id" | "updated_at" | "dirty">>,
) {
  await db.transaction("rw", db.tracking, async () => {
    const current = await db.tracking.get(ownerId);
    await db.tracking.put({
      ...DEFAULT_TRACKING,
      ...current,
      ...patch,
      owner_id: ownerId,
      updated_at: new Date().toISOString(),
      dirty: 1,
    });
  });
  requestSync();
}

// ── Periods ──

function writePeriod(row: Omit<PeriodRow, "updated_at" | "dirty">) {
  return db.periods.put({
    ...row,
    updated_at: new Date().toISOString(),
    dirty: 1,
  });
}

/** One tap: "Period started" (today, or another day). */
export async function startPeriod(ownerId: string, date: string) {
  await writePeriod({
    id: crypto.randomUUID(),
    owner_id: ownerId,
    start_date: date,
    end_date: null,
    deleted: false,
  });
  requestSync();
}

/** One tap: "Period ended". */
export async function endPeriod(period: PeriodRow, date: string) {
  await writePeriod({
    ...period,
    end_date: date < period.start_date ? period.start_date : date,
  });
  requestSync();
}

/** Create or edit a period with explicit dates (calendar editor). */
export async function savePeriod(
  ownerId: string,
  id: string | null,
  start: string,
  end: string | null,
) {
  await writePeriod({
    id: id ?? crypto.randomUUID(),
    owner_id: ownerId,
    start_date: start,
    end_date: end,
    deleted: false,
  });
  requestSync();
}

export async function deletePeriod(period: PeriodRow) {
  await writePeriod({ ...period, deleted: true });
  requestSync();
}

// ── Daily log ──

/** Merge changes into a day's log (creates it if needed). Saves instantly. */
export async function saveDailyLog(ownerId: string, date: string, patch: Partial<DailyLogFields>) {
  await db.transaction("rw", db.dailyLogs, async () => {
    const current = await db.dailyLogs.get([ownerId, date]);
    await db.dailyLogs.put({
      ...EMPTY_DAILY_LOG,
      ...current,
      ...patch,
      owner_id: ownerId,
      date,
      deleted: false,
      updated_at: new Date().toISOString(),
      dirty: 1,
    });
  });
  requestSync();
}
