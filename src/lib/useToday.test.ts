import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dateIn, useToday } from "./useToday";

afterEach(() => vi.useRealTimers());

describe("dateIn", () => {
  const at = new Date("2026-11-10T20:30:00Z");
  it("gives the date in a timezone", () => {
    expect(dateIn("Asia/Kolkata", at)).toBe("2026-11-11");
    expect(dateIn("Europe/London", at)).toBe("2026-11-10");
  });
  it("falls back to the phone's date", () => {
    expect(dateIn(undefined, at)).toBe("2026-11-10");
    expect(dateIn("Not/AZone", at)).toBe("2026-11-10");
  });
  it("defaults to now", () => {
    expect(dateIn()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("useToday", () => {
  it("updates after midnight and when the app comes back", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 10, 23, 59, 50));
    const { result, unmount } = renderHook(() => useToday());
    expect(result.current).toBe("2026-11-10");
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(result.current).toBe("2026-11-11");
    vi.setSystemTime(new Date(2026, 10, 12, 8));
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(result.current).toBe("2026-11-12");
    unmount();
  });
});
