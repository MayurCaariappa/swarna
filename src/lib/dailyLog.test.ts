import { describe, expect, it } from "vitest";
import {
  energyLabel,
  exerciseLabel,
  flowLabel,
  moodLabel,
  sexLabel,
  symptomLabel,
} from "./dailyLog";

describe("daily log labels", () => {
  it("labels known values and falls back for unknown ones", () => {
    expect(flowLabel("heavy")).toBe("Heavy");
    expect(flowLabel(null)).toBeNull();
    expect(symptomLabel("tender_breasts")).toBe("Tender breasts");
    expect(symptomLabel("custom")).toBe("custom");
    expect(moodLabel("calm")).toBe("😌 Calm");
    expect(moodLabel(null)).toBeNull();
    expect(energyLabel(3)).toBe("Good");
    expect(energyLabel(null)).toBeNull();
    expect(sexLabel("protected")).toBe("Protected");
    expect(sexLabel(null)).toBeNull();
  });

  it("joins exercise level and types", () => {
    expect(exerciseLabel("moderate", ["yoga", "walk"])).toBe("Moderate · Yoga, Walk");
    expect(exerciseLabel(null, ["swim"])).toBe("swim");
    expect(exerciseLabel("rest", null)).toBe("Rest day");
    expect(exerciseLabel(null, null)).toBeNull();
  });
});
