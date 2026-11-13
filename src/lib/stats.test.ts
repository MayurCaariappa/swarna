import { describe, expect, it } from "vitest";
import {
  completedCycles,
  monthlyTrends,
  pillAdherence,
  summarize,
  symptomPatterns,
  weightSeries,
} from "./stats";

const P = (start_date: string, end_date: string | null = null) => ({ start_date, end_date });

describe("completedCycles", () => {
  it("lists cycles with their bleed, skipping implausible gaps", () => {
    const out = completedCycles([
      P("2026-01-01", "2026-01-05"),
      P("2026-01-29"),
      P("2026-02-05"), // 7 days: skipped
      P("2026-03-05"),
    ]);
    expect(out).toEqual([
      { start: "2026-01-01", length: 28, bleed: 5 },
      { start: "2026-02-05", length: 28, bleed: null },
    ]);
  });
  it("keeps the newest `max`", () => {
    const out = completedCycles([P("2026-01-01"), P("2026-01-29"), P("2026-02-26")], 1);
    expect(out.map((c) => c.start)).toEqual(["2026-01-29"]);
  });
});

describe("summarize", () => {
  it("is empty without cycles", () => {
    expect(summarize([P("2026-01-01")])).toEqual({
      avgCycle: null,
      avgBleed: null,
      shortest: null,
      longest: null,
      regularity: null,
      variation: null,
      periodsLogged: 1,
    });
  });
  it("averages and grades regularity", () => {
    const s = summarize([P("2026-01-01", "2026-01-04"), P("2026-01-29", "2026-02-02"), P("2026-02-28")]);
    expect(s).toMatchObject({ avgCycle: 29, avgBleed: 4.5, shortest: 28, longest: 30, regularity: "regular", variation: 1 });
    expect(summarize([P("2026-01-01"), P("2026-01-27"), P("2026-03-01")]).regularity).toBe("somewhat"); // 26, 33
    expect(summarize([P("2026-01-01"), P("2026-01-21"), P("2026-03-06")]).regularity).toBe("irregular"); // 20, 44
  });
});

describe("symptomPatterns", () => {
  const periods = [P("2026-01-01"), P("2026-01-29"), P("2026-02-26")];
  const log = (date: string, symptoms: string[]) => ({ date, symptoms });

  it("finds the usual cycle days", () => {
    const out = symptomPatterns(periods, [
      log("2026-01-01", ["cramps"]),
      log("2026-01-02", ["cramps"]),
      log("2026-01-29", ["cramps"]),
      log("2026-01-30", ["cramps"]),
      log("2026-02-26", ["cramps"]),
      log("2025-12-20", ["cramps"]), // before any period: ignored
    ]);
    expect(out).toEqual([
      { symptom: "cramps", label: "Cramps", count: 5, from: 1, to: 2, inWindow: 5 },
    ]);
  });

  it("needs a repeated peak and 3+ logs", () => {
    const out = symptomPatterns(periods, [
      log("2026-01-03", ["acne"]),
      log("2026-01-10", ["acne"]),
      log("2026-01-20", ["acne"]),
      log("2026-01-05", ["headache"]),
    ]);
    expect(out[0]).toMatchObject({ symptom: "acne", count: 3, from: null });
    expect(out[1]).toMatchObject({ symptom: "headache", count: 1, from: null });
  });

  it("ignores logs more than 60 days after the last period", () => {
    expect(symptomPatterns([P("2026-01-01")], [log("2026-04-01", ["acne"])])).toEqual([]);
  });

  it("doesn't call it a pattern when most logs fall outside the window", () => {
    const out = symptomPatterns(periods, [
      log("2026-01-01", ["fatigue"]),
      log("2026-01-29", ["fatigue"]),
      log("2026-01-05", ["fatigue"]),
      log("2026-01-10", ["fatigue"]),
      log("2026-01-20", ["fatigue"]),
    ]);
    expect(out[0].from).toBeNull();
  });
});

describe("monthlyTrends", () => {
  const l = (date: string, extra: object = {}) => ({ date, symptoms: [] as string[], mood: null, weight_kg: null, ...extra });
  it("is empty without logs", () => {
    expect(monthlyTrends([], "2026-11-10")).toEqual([]);
  });
  it("counts PCOS-relevant days per month, from the first logged month", () => {
    const rows = monthlyTrends(
      [
        l("2026-10-03", { symptoms: ["acne", "hair_changes"], mood: "low", weight_kg: 60 }),
        l("2026-10-04", { mood: "anxious", weight_kg: 61 }),
        l("2026-11-01", { mood: "sad" }),
        l("2026-11-02", { mood: "irritable" }),
        l("2026-11-03", { mood: "happy" }),
      ],
      "2026-11-10",
    );
    expect(rows).toEqual([
      { month: "Nov 2026", key: "2026-11", loggedDays: 3, acneDays: 0, hairDays: 0, lowMoodDays: 2, avgWeight: null },
      { month: "Oct 2026", key: "2026-10", loggedDays: 2, acneDays: 1, hairDays: 1, lowMoodDays: 2, avgWeight: 60.5 },
    ]);
  });
  it("stops after `months`", () => {
    expect(monthlyTrends([l("2025-01-01")], "2026-11-10", 2)).toHaveLength(2);
  });
});

describe("weightSeries", () => {
  it("keeps weighed days, sorted", () => {
    expect(
      weightSeries([
        { date: "2026-11-02", weight_kg: 61 },
        { date: "2026-11-01", weight_kg: 60 },
        { date: "2026-11-03", weight_kg: null },
      ]),
    ).toEqual([
      { date: "2026-11-01", kg: 60 },
      { date: "2026-11-02", kg: 61 },
    ]);
  });
});

describe("pillAdherence", () => {
  const cfg = { packStart: "2026-09-06", activeDays: 21, breakDays: 7 };
  it("is empty before the first pack", () => {
    expect(pillAdherence(cfg, new Set(), "2026-09-01")).toEqual([]);
  });
  it("covers the current pack and up to 2 before", () => {
    // Packs start 6 Sep, 4 Oct, 1 Nov, 29 Nov.
    const out = pillAdherence(cfg, new Set(["2026-11-29", "2026-11-01", "2026-11-02"]), "2026-11-30");
    expect(out).toEqual([
      { packStart: "2026-11-29", taken: 1, due: 2, current: true },
      { packStart: "2026-11-01", taken: 2, due: 21, current: false },
      { packStart: "2026-10-04", taken: 0, due: 21, current: false },
    ]);
  });
  it("stops at the first pack", () => {
    expect(pillAdherence(cfg, new Set(), "2026-09-10")).toHaveLength(1);
  });
});
