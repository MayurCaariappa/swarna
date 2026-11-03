import { DEFAULT_TRACKING, db, type TrackingRow } from "./db";
import { requestSync } from "./sync";

// Every write goes to the phone first (instant, works offline), then syncs.

export async function setPillTaken(ownerId: string, date: string, taken: boolean) {
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
    dates.map((date) => ({ owner_id: ownerId, date, taken_at: now, deleted: false, updated_at: now, dirty: 1 as const })),
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
