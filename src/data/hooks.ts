import { useLiveQuery } from "dexie-react-hooks";
import { db, type PillLogRow, type TrackingRow } from "./db";

/** undefined = still loading; null = never set up. Re-renders on every change. */
export function useTracking(
  ownerId: string | undefined,
): TrackingRow | null | undefined {
  return useLiveQuery(
    async () => (ownerId ? ((await db.tracking.get(ownerId)) ?? null) : null),
    [ownerId],
  );
}

/** Taken pills between two dates (inclusive), as a map of date → row. */
export function usePillLogs(
  ownerId: string | undefined,
  from: string,
  to: string,
) {
  return useLiveQuery(async () => {
    const map = new Map<string, PillLogRow>();
    if (!ownerId) return map;
    const rows = await db.pillLogs
      .where("[owner_id+date]")
      .between([ownerId, from], [ownerId, to], true, true)
      .toArray();
    for (const r of rows) if (!r.deleted) map.set(r.date, r);
    return map;
  }, [ownerId, from, to]);
}

/** All her logged periods, oldest first (deleted ones left out). */
export function usePeriods(ownerId: string | undefined) {
  return useLiveQuery(async () => {
    if (!ownerId) return [];
    const rows = await db.periods
      .where("[owner_id+start_date]")
      .between([ownerId, ""], [ownerId, "￿"])
      .toArray();
    return rows.filter((r) => !r.deleted);
  }, [ownerId]);
}
