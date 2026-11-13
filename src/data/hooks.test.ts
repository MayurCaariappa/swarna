import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { clearLocalData, db, EMPTY_DAILY_LOG, DEFAULT_TRACKING } from "./db";
import {
  hasContent,
  useAllDailyLogs,
  useDailyLog,
  useLoggedDates,
  usePeriods,
  usePillLogs,
  useTracking,
} from "./hooks";

const ME = "owner-1";
const meta = { owner_id: ME, updated_at: "2026-11-01T00:00:00Z", dirty: 0 as const };
afterEach(() => clearLocalData());

async function seed() {
  await db.tracking.put({ ...DEFAULT_TRACKING, ...meta });
  await db.pillLogs.bulkPut([
    { ...meta, date: "2026-11-01", taken_at: "x", deleted: false },
    { ...meta, date: "2026-11-02", taken_at: null, deleted: true },
    { ...meta, date: "2026-12-01", taken_at: "x", deleted: false },
  ]);
  await db.periods.bulkPut([
    { ...meta, id: "b", start_date: "2026-11-03", end_date: null, deleted: false },
    { ...meta, id: "a", start_date: "2026-10-03", end_date: null, deleted: false },
    { ...meta, id: "c", start_date: "2026-09-03", end_date: null, deleted: true },
    { ...meta, owner_id: "someone-else", id: "d", start_date: "2026-09-03", end_date: null, deleted: false },
  ]);
  await db.dailyLogs.bulkPut([
    { ...EMPTY_DAILY_LOG, ...meta, date: "2026-11-05", mood: "calm", deleted: false },
    { ...EMPTY_DAILY_LOG, ...meta, date: "2026-11-04", deleted: false }, // empty
    { ...EMPTY_DAILY_LOG, ...meta, date: "2026-11-03", flow: "light", deleted: true },
  ]);
}

describe("data hooks", () => {
  it("read her data from the phone", async () => {
    await seed();
    const tracking = renderHook(() => useTracking(ME));
    await waitFor(() => expect(tracking.result.current).toMatchObject({ mode: "pill" }));

    const pills = renderHook(() => usePillLogs(ME, "2026-11-01", "2026-11-30"));
    await waitFor(() => expect([...(pills.result.current?.keys() ?? [])]).toEqual(["2026-11-01"]));

    const periods = renderHook(() => usePeriods(ME));
    await waitFor(() => expect(periods.result.current?.map((p) => p.id)).toEqual(["a", "b"]));

    const day = renderHook(() => useDailyLog(ME, "2026-11-05"));
    await waitFor(() => expect(day.result.current).toMatchObject({ mood: "calm" }));
    const empty = renderHook(() => useDailyLog(ME, "2026-11-20"));
    await waitFor(() => expect(empty.result.current).toBeNull());

    const logged = renderHook(() => useLoggedDates(ME, "2026-11-01", "2026-11-30"));
    await waitFor(() => expect([...(logged.result.current ?? [])]).toEqual(["2026-11-05"]));

    const all = renderHook(() => useAllDailyLogs(ME));
    await waitFor(() => expect(all.result.current?.map((l) => l.date)).toEqual(["2026-11-04", "2026-11-05"]));
  });

  it("return empty results without an owner", async () => {
    const t = renderHook(() => useTracking(undefined));
    const p = renderHook(() => usePillLogs(undefined, "a", "b"));
    const ps = renderHook(() => usePeriods(undefined));
    const d = renderHook(() => useDailyLog(undefined, "a"));
    const l = renderHook(() => useLoggedDates(undefined, "a", "b"));
    const a = renderHook(() => useAllDailyLogs(undefined));
    await waitFor(() => {
      expect(t.result.current).toBeNull();
      expect(p.result.current?.size).toBe(0);
      expect(ps.result.current).toEqual([]);
      expect(d.result.current).toBeNull();
      expect(l.result.current?.size).toBe(0);
      expect(a.result.current).toEqual([]);
    });
  });

  it("returns null tracking when never set up", async () => {
    const t = renderHook(() => useTracking(ME));
    await waitFor(() => expect(t.result.current).toBeNull());
  });
});

describe("hasContent", () => {
  it("is true when anything was logged", () => {
    expect(hasContent(EMPTY_DAILY_LOG)).toBe(false);
    expect(hasContent({ ...EMPTY_DAILY_LOG, notes: "  " })).toBe(false);
    expect(hasContent({ ...EMPTY_DAILY_LOG, exercise_types: undefined as unknown as string[] })).toBe(false);
    for (const patch of [
      { flow: "light" },
      { symptoms: ["acne"] },
      { mood: "calm" },
      { energy: 2 },
      { exercise: "rest" },
      { exercise_types: ["yoga"] },
      { discharge: "none" },
      { sex: "none" },
      { weight_kg: 60 },
      { notes: "hi" },
    ])
      expect(hasContent({ ...EMPTY_DAILY_LOG, ...patch } as typeof EMPTY_DAILY_LOG)).toBe(true);
  });
});
