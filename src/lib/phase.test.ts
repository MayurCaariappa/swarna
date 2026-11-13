import { parseISO } from "date-fns";
import { describe, expect, it } from "vitest";
import { predict } from "./cycle";
import { BLEEDING, naturalPhase, pillPhase } from "./phase";

const cfg = { packStart: "2026-11-01", activeDays: 21, breakDays: 7 };
const at = (s: string) => parseISO(s);

describe("pillPhase", () => {
  it("covers every part of the pack", () => {
    expect(pillPhase(cfg, at("2026-11-05"), true)).toBe(BLEEDING);
    expect(pillPhase(cfg, at("2026-10-30"), false).label).toBe("Before the pack");
    expect(pillPhase(cfg, at("2026-11-23"), false).label).toBe("Break week");
    expect(pillPhase(cfg, at("2026-11-20"), false).label).toBe("End of the pack");
    expect(pillPhase(cfg, at("2026-11-05"), false).label).toBe("Active pills");
  });
});

describe("naturalPhase", () => {
  // Last period 1 Nov → next 29 Nov, ovulation 15 Nov, fertile 10–16 Nov.
  const p = predict([{ start_date: "2026-11-01", end_date: "2026-11-05" }], "2026-11-06")!;
  it("covers every part of the cycle", () => {
    expect(naturalPhase(p, "2026-11-03", true)).toMatchObject({ label: "Period", tip: BLEEDING.tip });
    expect(naturalPhase({ ...p, daysLate: 2 }, "2026-12-01", false).label).toBe("Period late");
    expect(naturalPhase(p, "2026-11-25", false).label).toBe("PMS window");
    expect(naturalPhase(p, "2026-11-12", false).label).toBe("Around ovulation");
    expect(naturalPhase(p, "2026-11-07", false).label).toBe("After the period");
    expect(naturalPhase(p, "2026-11-20", false).label).toBe("Second half of the cycle");
  });
});
