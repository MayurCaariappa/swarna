import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deletePeriod,
  endPeriod,
  markPillsTaken,
  restorePeriod,
  saveDailyLog,
  savePeriod,
  saveTracking,
  setPillTaken,
  startPeriod,
} from "./actions";
import { clearLocalData, db, DEFAULT_TRACKING } from "./db";
import { requestSync } from "./sync";

vi.mock("./sync", () => ({ requestSync: vi.fn() }));

afterEach(() => clearLocalData());
const ME = "owner-1";

describe("pills", () => {
  it("marks a pill taken and un-taken, queued for sync", async () => {
    await setPillTaken(ME, "2026-11-10", true);
    let row = await db.pillLogs.get([ME, "2026-11-10"]);
    expect(row).toMatchObject({ deleted: false, dirty: 1 });
    expect(row!.taken_at).not.toBeNull();
    await setPillTaken(ME, "2026-11-10", false);
    row = await db.pillLogs.get([ME, "2026-11-10"]);
    expect(row).toMatchObject({ deleted: true, taken_at: null, dirty: 1 });
    expect(requestSync).toHaveBeenCalledTimes(2);
  });

  it("marks many days at once", async () => {
    await markPillsTaken(ME, ["2026-11-01", "2026-11-02"]);
    expect(await db.pillLogs.where("owner_id").equals(ME).count()).toBe(2);
    expect(requestSync).toHaveBeenCalledTimes(1);
  });
});

describe("tracking settings", () => {
  it("starts from the defaults and merges later changes", async () => {
    await saveTracking(ME, { pack_start_date: "2026-11-01" });
    expect(await db.tracking.get(ME)).toMatchObject({ ...DEFAULT_TRACKING, pack_start_date: "2026-11-01", dirty: 1 });
    await saveTracking(ME, { reminder_time: "08:00" });
    expect(await db.tracking.get(ME)).toMatchObject({ pack_start_date: "2026-11-01", reminder_time: "08:00" });
  });
});

describe("periods", () => {
  it("starts, ends, edits, deletes and restores a period", async () => {
    const p = await startPeriod(ME, "2026-11-10");
    expect(await db.periods.get(p.id)).toMatchObject({ start_date: "2026-11-10", end_date: null, dirty: 1 });

    const saved = (await db.periods.get(p.id))!;
    await endPeriod(saved, "2026-11-14");
    expect((await db.periods.get(p.id))!.end_date).toBe("2026-11-14");
    await endPeriod(saved, "2026-11-01"); // before the start: clamps to the start
    expect((await db.periods.get(p.id))!.end_date).toBe("2026-11-10");

    await savePeriod(ME, p.id, "2026-11-09", "2026-11-12");
    expect(await db.periods.get(p.id)).toMatchObject({ start_date: "2026-11-09", end_date: "2026-11-12" });

    const before = (await db.periods.get(p.id))!;
    await deletePeriod(before);
    expect((await db.periods.get(p.id))!.deleted).toBe(true);
    await restorePeriod(before);
    expect((await db.periods.get(p.id))!.deleted).toBe(false);
  });

  it("creates a new period from the editor", async () => {
    await savePeriod(ME, null, "2026-10-01", null);
    expect(await db.periods.where("owner_id").equals(ME).count()).toBe(1);
  });
});

describe("daily log", () => {
  it("creates a day and merges later changes", async () => {
    await saveDailyLog(ME, "2026-11-10", { mood: "calm" });
    await saveDailyLog(ME, "2026-11-10", { symptoms: ["cramps"] });
    expect(await db.dailyLogs.get([ME, "2026-11-10"])).toMatchObject({
      mood: "calm",
      symptoms: ["cramps"],
      flow: null,
      deleted: false,
      dirty: 1,
    });
  });
});

describe("clearLocalData", () => {
  it("wipes every table", async () => {
    await setPillTaken(ME, "2026-11-10", true);
    await db.meta.put({ key: "k", value: "v" });
    await clearLocalData();
    expect(await db.pillLogs.count()).toBe(0);
    expect(await db.meta.count()).toBe(0);
  });
});
