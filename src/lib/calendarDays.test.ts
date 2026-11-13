import { parseISO } from "date-fns";
import { describe, expect, it } from "vitest";
import { buildMonthDays, monthGrid, pillStatus, type TrackingLike } from "./calendarDays";

const nov = parseISO("2026-11-01");
const pill: TrackingLike = {
  mode: "pill",
  pack_start_date: "2026-11-01",
  active_days: 21,
  break_days: 7,
  natural_since: null,
};
const natural: TrackingLike = { ...pill, mode: "natural", pack_start_date: null };
const byDate = <T extends { date: string }>(days: T[]) =>
  Object.fromEntries(days.map((x) => [x.date, x]));

describe("monthGrid", () => {
  it("covers whole Monday-first weeks", () => {
    expect(monthGrid(nov)).toMatchObject({ from: "2026-10-26", to: "2026-12-06" });
  });
});

describe("buildMonthDays", () => {
  it("marks in-month days and logged periods without tracking", () => {
    const period = { start_date: "2026-11-03", end_date: "2026-11-05" };
    const days = buildMonthDays(nov, "2026-11-10", [period], null, null);
    expect(days).toHaveLength(42);
    const m = byDate(days);
    expect(m["2026-10-26"].inMonth).toBe(false);
    expect(m["2026-11-01"].inMonth).toBe(true);
    expect(m["2026-11-04"].period).toBe(period);
    expect(m["2026-11-06"].period).toBeUndefined();
    expect(days.some((x) => x.predictedBleed || x.fertile || x.pill || x.off)).toBe(false);
  });

  it("shows pills, break days and the predicted bleed in pill mode", () => {
    const m = byDate(buildMonthDays(nov, "2026-11-10", [], pill, new Set(["2026-11-05"])));
    expect(m["2026-11-05"].pill).toEqual({ number: 5, taken: true, missed: false });
    expect(m["2026-11-06"].pill).toEqual({ number: 6, taken: false, missed: true });
    expect(m["2026-11-10"].pill).toEqual({ number: 10, taken: false, missed: false });
    expect(m["2026-11-22"].off).toBe(1);
    expect(m["2026-11-23"].predictedBleed).toBe(false);
    expect(m["2026-11-24"].predictedBleed).toBe(true);
    expect(m["2026-11-27"].predictedBleed).toBe(true);
    expect(m["2026-11-28"].predictedBleed).toBe(false);
  });

  it("hides pill dots when pill status isn't shared", () => {
    const days = buildMonthDays(nov, "2026-11-10", [], pill, null);
    expect(days.some((x) => x.pill)).toBe(false);
    expect(byDate(days)["2026-11-22"].off).toBe(1);
  });

  it("drops the prediction once this break's bleed is logged, but not for a mid-pack bleed", () => {
    const logged = buildMonthDays(nov, "2026-11-10", [{ start_date: "2026-11-20", end_date: "2026-11-21" }], pill, null);
    expect(logged.some((x) => x.predictedBleed)).toBe(false);
    const midPack = buildMonthDays(nov, "2026-11-10", [{ start_date: "2026-11-08", end_date: "2026-11-09" }], pill, null);
    expect(byDate(midPack)["2026-11-24"].predictedBleed).toBe(true);
  });

  it("doesn't predict days already past", () => {
    const m = byDate(buildMonthDays(nov, "2026-11-26", [], pill, null));
    expect(m["2026-11-25"].predictedBleed).toBe(false);
    expect(m["2026-11-26"].predictedBleed).toBe(true);
  });

  it("ignores pill mode without a pack start", () => {
    const days = buildMonthDays(nov, "2026-11-10", [], { ...pill, pack_start_date: null }, new Set());
    expect(days.some((x) => x.pill || x.off)).toBe(false);
  });

  it("predicts bleeds, fertile window and ovulation in natural mode", () => {
    const periods = [{ start_date: "2026-10-04", end_date: "2026-10-08" }];
    // Next start 1 Nov; then 29 Nov (ovulation 15 Nov, fertile 10–16 Nov).
    const m = byDate(buildMonthDays(nov, "2026-10-28", periods, natural, null));
    expect(m["2026-11-01"].predictedBleed).toBe(true);
    expect(m["2026-11-05"].predictedBleed).toBe(true);
    expect(m["2026-11-06"].predictedBleed).toBe(false);
    expect(m["2026-11-15"].ovulation).toBe(true);
    expect(m["2026-11-10"].fertile).toBe(true);
    expect(m["2026-11-16"].fertile).toBe(true);
    expect(m["2026-11-17"].fertile).toBe(false);
    expect(m["2026-11-29"].predictedBleed).toBe(true);
  });

  it("doesn't predict a bleed right after one was logged", () => {
    // Logged out of order: the prediction (4–7 Oct) lands right after the 4 Oct bleed.
    const periods = [
      { start_date: "2026-10-04", end_date: "2026-10-04" },
      { start_date: "2026-09-06", end_date: "2026-09-10" },
    ];
    const m = byDate(buildMonthDays(parseISO("2026-10-01"), "2026-10-01", periods, natural, null));
    expect(m["2026-10-04"].period).toBeDefined();
    expect(m["2026-10-05"].predictedBleed).toBe(false);
    expect(m["2026-10-05"].period).toBeUndefined();
  });

  it("uses only periods since switching to natural mode", () => {
    const periods = [{ start_date: "2026-10-04", end_date: "2026-10-08" }];
    const days = buildMonthDays(nov, "2026-10-28", periods, { ...natural, natural_since: "2026-10-20" }, null);
    expect(days.some((x) => x.predictedBleed || x.fertile)).toBe(false);
  });
});

describe("pillStatus", () => {
  it("words each state the same everywhere", () => {
    expect(pillStatus({ taken: true, missed: false }, "2026-11-01", "2026-11-05")).toBe("taken");
    expect(pillStatus({ taken: false, missed: true }, "2026-11-01", "2026-11-05")).toBe("not marked");
    expect(pillStatus({ taken: false, missed: false }, "2026-11-05", "2026-11-05")).toBe("not taken yet");
    expect(pillStatus({ taken: false, missed: false }, "2026-11-06", "2026-11-05")).toBe("upcoming");
  });
});
