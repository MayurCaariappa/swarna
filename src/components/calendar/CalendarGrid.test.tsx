import { fireEvent, render, screen } from "@testing-library/react";
import { parseISO } from "date-fns";
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { buildMonthDays, type DayInfo } from "../../lib/calendarDays";
import { toISODate } from "../../lib/pill";
import CalendarGrid from "./CalendarGrid";

const TODAY = "2026-11-10";
const NOV = parseISO("2026-11-01");
const pill = { mode: "pill" as const, pack_start_date: "2026-11-01", active_days: 21, break_days: 7, natural_since: null };

function show(over: Partial<Parameters<typeof CalendarGrid>[0]> = {}, days?: DayInfo[]) {
  const props = {
    month: NOV,
    onMonthChange: vi.fn(),
    days: days ?? buildMonthDays(NOV, TODAY, [{ start_date: "2026-11-03", end_date: "2026-11-05" }], pill, new Set(["2026-11-01"])),
    today: TODAY,
    selected: TODAY,
    onSelect: vi.fn(),
    onToday: vi.fn(),
    atToday: true,
    ...over,
  };
  type Fn = Mock<(...a: never[]) => void>;
  return {
    ...render(<CalendarGrid {...props} />),
    props: props as typeof props & { onMonthChange: Fn; onSelect: Fn; onToday: Fn },
  };
}
const day = (date: string) => document.querySelector<HTMLButtonElement>(`[data-date="${date}"]`)!;

afterEach(() => vi.restoreAllMocks());

describe("CalendarGrid header", () => {
  it("shows the month and year, and hides Today when on today", () => {
    show();
    const h = screen.getByRole("heading", { name: "November 2026" });
    expect(h).not.toHaveClass("short");
    expect(screen.getByText("Today")).toHaveStyle({ visibility: "hidden" });
  });

  it("switches to the short month name when the full one doesn't fit", () => {
    vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(300);
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(200);
    const { unmount } = show();
    expect(screen.getByRole("heading")).toHaveClass("short");
    vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(100);
    fireEvent(window, new Event("resize"));
    expect(screen.getByRole("heading")).not.toHaveClass("short");
    unmount();
  });

  it("moves between months and back to today", () => {
    const { props } = show({ atToday: false });
    fireEvent.click(screen.getByLabelText("Previous month"));
    expect(toISODate(props.onMonthChange.mock.calls[0][0])).toBe("2026-10-01");
    fireEvent.click(screen.getByLabelText("Next month"));
    expect(toISODate(props.onMonthChange.mock.calls[1][0])).toBe("2026-12-01");
    fireEvent.click(screen.getByText("Today"));
    expect(props.onToday).toHaveBeenCalled();
  });
});

describe("CalendarGrid days", () => {
  it("draws each day with its marks and a spoken label", () => {
    const days = buildMonthDays(NOV, TODAY, [{ start_date: "2026-11-03", end_date: "2026-11-05" }], pill, new Set(["2026-11-01"]));
    days.find((d) => d.date === "2026-11-02")!.logged = true;
    show({}, days);
    expect(day("2026-10-26")).toHaveClass("out");
    expect(day("2026-11-03")).toHaveClass("bleed");
    expect(day(TODAY)).toHaveClass("today", "selected");
    expect(day(TODAY)).toHaveAttribute("aria-pressed", "true");
    expect(day("2026-11-24")).toHaveClass("predicted", "off");
    expect(day("2026-11-01").querySelector(".dot.taken")).not.toBeNull();
    expect(day("2026-11-02").querySelector(".dot.missed")).not.toBeNull();
    expect(day("2026-11-02").querySelector(".log-mark")).not.toBeNull();
    expect(day("2026-11-15").querySelector(".dot")).not.toHaveClass("taken");

    expect(day("2026-11-01")).toHaveAccessibleName("Sunday 1 November, pill 1 taken");
    expect(day("2026-11-02")).toHaveAccessibleName("Monday 2 November, pill 2 not marked, logged");
    expect(day("2026-11-03")).toHaveAccessibleName("Tuesday 3 November, period, pill 3 not marked");
    expect(day(TODAY)).toHaveAccessibleName("Tuesday 10 November, today, pill 10 not taken yet");
    expect(day("2026-11-24")).toHaveAccessibleName("Tuesday 24 November, bleed predicted, break day 3");
  });

  it("speaks fertile and ovulation days in natural mode", () => {
    const natural = { ...pill, mode: "natural" as const };
    const days = buildMonthDays(NOV, "2026-10-28", [{ start_date: "2026-10-04", end_date: "2026-10-08" }], natural, null);
    show({ today: "2026-10-28", selected: null }, days);
    expect(day("2026-11-12")).toHaveAccessibleName("Thursday 12 November, fertile window");
    expect(day("2026-11-15")).toHaveAccessibleName("Sunday 15 November, ovulation estimated");
    expect(day("2026-11-12")).toHaveClass("fertile");
    expect(day("2026-11-15")).toHaveClass("ovulation");
    // No selection in view: the 1st of the month is the Tab stop.
    expect(day("2026-11-01")).toHaveAttribute("tabindex", "0");
    expect(screen.getByLabelText("Key")).toHaveTextContent("predicted fertile window ovulation");
  });

  it("selects a tapped day", () => {
    const { props } = show();
    fireEvent.click(day("2026-11-12"));
    expect(props.onSelect).toHaveBeenCalledWith("2026-11-12");
  });
});

describe("CalendarGrid key", () => {
  it("lists only what this month shows", () => {
    show();
    expect(screen.getByLabelText("Key")).toHaveTextContent("period predicted pill taken not marked break");
  });
  it("is hidden for an empty month", () => {
    show({}, buildMonthDays(NOV, TODAY, [], null, null));
    expect(screen.queryByLabelText("Key")).toBeNull();
  });
});

describe("CalendarGrid keyboard and swipe", () => {
  it("moves the selection with arrow, Home/End and Page keys", () => {
    const { props, rerender } = show();
    const press = (key: string) => fireEvent.keyDown(day(TODAY), { key });
    const cases: [string, string][] = [
      ["ArrowLeft", "2026-11-09"],
      ["ArrowRight", "2026-11-11"],
      ["ArrowUp", "2026-11-03"],
      ["ArrowDown", "2026-11-17"],
      ["Home", "2026-11-09"],
      ["End", "2026-11-15"],
    ];
    for (const [key, want] of cases) {
      press(key);
      expect(props.onSelect).toHaveBeenLastCalledWith(want);
    }
    expect(props.onMonthChange).not.toHaveBeenCalled();
    press("PageUp");
    expect(props.onSelect).toHaveBeenLastCalledWith("2026-10-10");
    expect(toISODate(props.onMonthChange.mock.calls[0][0])).toBe("2026-10-01");
    press("PageDown");
    expect(props.onSelect).toHaveBeenLastCalledWith("2026-12-10");
    press("x");
    expect(props.onSelect).toHaveBeenCalledTimes(8);

    // Focus follows the moved selection.
    rerender(<CalendarGrid {...props} selected="2026-11-11" />);
    expect(day("2026-11-11")).toHaveFocus();
    rerender(<CalendarGrid {...props} selected="2026-11-12" />); // a tap: no focus move
    expect(day("2026-11-12")).not.toHaveFocus();
  });

  it("ignores keys from outside a day", () => {
    const { props } = show();
    fireEvent.keyDown(screen.getByRole("group"), { key: "ArrowLeft" });
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it("changes month on a horizontal swipe only", () => {
    const { props } = show();
    const card = document.querySelector(".cal-card")!;
    const swipe = (dx: number, dy: number) => {
      fireEvent.touchStart(card, { touches: [{ clientX: 200, clientY: 200 }] });
      fireEvent.touchEnd(card, { changedTouches: [{ clientX: 200 + dx, clientY: 200 + dy }] });
    };
    swipe(-80, 5);
    expect(toISODate(props.onMonthChange.mock.calls[0][0])).toBe("2026-12-01");
    swipe(80, 5);
    expect(toISODate(props.onMonthChange.mock.calls[1][0])).toBe("2026-10-01");
    swipe(30, 0); // too short
    swipe(80, 80); // mostly vertical (scrolling)
    fireEvent.touchEnd(card, { changedTouches: [{ clientX: 0, clientY: 0 }] }); // no start
    expect(props.onMonthChange).toHaveBeenCalledTimes(2);
  });
});
