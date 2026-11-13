import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { toISODate } from "./pill";
import { useCalendarNav } from "./useCalendarNav";

const TODAY = "2026-11-10";
const at = (url: string) => ({
  wrapper: ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
  ),
});

describe("useCalendarNav", () => {
  it("opens on today", () => {
    const { result } = renderHook(() => useCalendarNav(TODAY), at("/calendar"));
    expect(toISODate(result.current.month)).toBe("2026-11-01");
    expect(result.current.selected).toBe(TODAY);
    expect(result.current.atToday).toBe(true);
  });

  it("opens on ?date=, ignoring bad values", () => {
    const { result } = renderHook(() => useCalendarNav(TODAY), at("/calendar?date=2026-08-15"));
    expect(toISODate(result.current.month)).toBe("2026-08-01");
    expect(result.current.selected).toBe("2026-08-15");
    expect(result.current.atToday).toBe(false);
    for (const bad of ["2026-13-45", "yesterday"]) {
      const r = renderHook(() => useCalendarNav(TODAY), at(`/calendar?date=${bad}`));
      expect(r.result.current.selected).toBe(TODAY);
    }
  });

  it("keeps a selected day in the shown month, and jumps back to today", () => {
    const { result } = renderHook(() => useCalendarNav(TODAY), at("/calendar"));
    act(() => result.current.setMonth(new Date(2026, 11, 20)));
    expect(toISODate(result.current.month)).toBe("2026-12-01");
    expect(result.current.selected).toBe("2026-12-01");

    act(() => result.current.setSelected("2026-12-05"));
    act(() => result.current.setMonth(new Date(2026, 11, 1)));
    expect(result.current.selected).toBe("2026-12-05"); // same month: unchanged

    act(() => result.current.setMonth(new Date(2026, 10, 1)));
    expect(result.current.selected).toBe(TODAY); // today's month: today

    act(() => result.current.setMonth(new Date(2027, 0, 1)));
    act(() => result.current.goToday());
    expect(result.current.selected).toBe(TODAY);
    expect(result.current.atToday).toBe(true);
  });
});
