import { addDays, format, parseISO } from "date-fns";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_BLEED,
  DEFAULT_CYCLE,
  cycleDay,
  cycleLengths,
  futureCycles,
  naturalPeriods,
  periodEnd,
  periodOn,
  predict,
} from "./cycle";

const iso = (s: string, n: number) => format(addDays(parseISO(s), n), "yyyy-MM-dd");
/** Periods starting at `first`, then after each gap in `gaps`, all lasting `bleed` days. */
function periods(first: string, gaps: number[], bleed: number | null = 5) {
  const starts = [first];
  for (const g of gaps) starts.push(iso(starts[starts.length - 1], g));
  return starts.map((s) => ({ start_date: s, end_date: bleed ? iso(s, bleed - 1) : null }));
}

describe("periodEnd", () => {
  it("uses the logged end", () => {
    expect(periodEnd({ start_date: "2026-11-01", end_date: "2026-11-05" }, "2026-11-10")).toBe("2026-11-05");
  });
  it("caps a future end date at today", () => {
    expect(periodEnd({ start_date: "2026-11-01", end_date: "2026-11-09" }, "2026-11-05")).toBe("2026-11-05");
  });
  it("keeps a wholly future period as is", () => {
    expect(periodEnd({ start_date: "2026-11-08", end_date: "2026-11-09" }, "2026-11-05")).toBe("2026-11-09");
  });
  it("runs an open period to today, at most 14 days", () => {
    expect(periodEnd({ start_date: "2026-11-01", end_date: null }, "2026-11-05")).toBe("2026-11-05");
    expect(periodEnd({ start_date: "2026-11-01", end_date: null }, "2026-11-30")).toBe("2026-11-14");
  });
});

describe("periodOn", () => {
  const ps = periods("2026-10-01", [28], 5);
  it("finds the period covering a day", () => {
    expect(periodOn(ps, "2026-10-03", "2026-11-10")).toBe(ps[0]);
    expect(periodOn(ps, "2026-10-10", "2026-11-10")).toBeUndefined();
  });
});

describe("cycleLengths", () => {
  it("drops implausible gaps", () => {
    expect(cycleLengths(periods("2026-01-01", [28, 7, 85, 60, 61]))).toEqual([28, 60]);
  });
});

describe("naturalPeriods", () => {
  const ps = periods("2026-01-01", [28, 28]);
  it("keeps everything without a switch date", () => {
    expect(naturalPeriods(ps, null)).toBe(ps);
  });
  it("keeps only periods since the switch", () => {
    expect(naturalPeriods(ps, "2026-01-29")).toHaveLength(2);
  });
});

describe("predict", () => {
  it("is null without periods", () => {
    expect(predict([], "2026-11-01")).toBeNull();
  });

  it("uses defaults for a single open period", () => {
    const p = predict([{ start_date: "2026-11-01", end_date: null }], "2026-11-05")!;
    expect(p).toMatchObject({
      avgCycle: DEFAULT_CYCLE,
      avgBleed: DEFAULT_BLEED,
      cycleCount: 0,
      lastStart: "2026-11-01",
      nextStart: "2026-11-29",
      nextEnd: "2026-12-03",
      ovulation: "2026-11-15",
      fertileStart: "2026-11-10",
      fertileEnd: "2026-11-16",
      regularity: "unknown",
      confidence: "low",
      daysLate: 0,
    });
  });

  it("weights recent cycles more", () => {
    const p = predict(periods("2026-01-01", [26, 30], 4), "2026-02-10")!;
    expect(p.avgCycle).toBe(29); // (26·1 + 30·2) / 3
    expect(p.avgBleed).toBe(4);
    expect(p.regularity).toBe("regular"); // sd 2
  });

  it("is regular and high confidence with 6 steady cycles", () => {
    const p = predict(periods("2026-01-01", [28, 28, 28, 28, 28, 28]), "2026-07-01")!;
    expect(p).toMatchObject({ regularity: "regular", confidence: "high", cycleCount: 6 });
  });

  it("is medium confidence with 3 cycles", () => {
    expect(predict(periods("2026-01-01", [28, 28, 28]), "2026-04-01")!.confidence).toBe("medium");
  });

  it("calls a few-day spread 'somewhat' regular", () => {
    expect(predict(periods("2026-01-01", [25, 31]), "2026-03-01")!.regularity).toBe("somewhat");
  });

  it("lowers confidence for irregular cycles", () => {
    const p = predict(periods("2026-01-01", [20, 40, 20, 40, 20, 40]), "2026-07-01")!;
    expect(p.regularity).toBe("irregular");
    expect(p.confidence).toBe("medium");
    const few = predict(periods("2026-01-01", [20, 40]), "2026-03-01")!;
    expect(few.confidence).toBe("low");
  });

  it("counts days late", () => {
    const p = predict([{ start_date: "2026-10-01", end_date: "2026-10-05" }], "2026-11-01")!;
    expect(p.nextStart).toBe("2026-10-29");
    expect(p.daysLate).toBe(3);
  });
});

describe("futureCycles", () => {
  const p = predict([{ start_date: "2026-11-01", end_date: "2026-11-05" }], "2026-11-05")!;
  it("returns 4 cycles by default", () => {
    const cs = futureCycles(p);
    expect(cs).toHaveLength(4);
    expect(cs[1]).toEqual({
      bleedStart: "2026-12-27",
      bleedEnd: "2026-12-31",
      ovulation: "2026-12-13",
      fertileStart: "2026-12-08",
      fertileEnd: "2026-12-14",
    });
  });
  it("takes a count", () => {
    expect(futureCycles(p, 2)).toHaveLength(2);
  });
});

describe("cycleDay", () => {
  const ps = periods("2026-10-01", [28]);
  it("counts from the latest start", () => {
    expect(cycleDay(ps, "2026-10-29")).toBe(1);
    expect(cycleDay(ps, "2026-10-10")).toBe(10);
  });
  it("is null before any period", () => {
    expect(cycleDay(ps, "2026-09-01")).toBeNull();
  });
});
