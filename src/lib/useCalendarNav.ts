import { isSameMonth, isValid, parseISO, startOfMonth } from "date-fns";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toISODate } from "./pill";

/**
 * Month + selected day for a calendar screen.
 * - Opens on `?date=yyyy-MM-dd` when given (links from Home / Periods), else today.
 * - Changing month keeps a day selected inside it (today if it's there, else the 1st),
 *   so the day panel never disappears.
 */
export function useCalendarNav(today: string) {
  const [params] = useSearchParams();
  const asked = params.get("date");
  const initial =
    asked && /^\d{4}-\d{2}-\d{2}$/.test(asked) && isValid(parseISO(asked))
      ? asked
      : today;

  const [month, setMonthState] = useState(() =>
    startOfMonth(parseISO(initial)),
  );
  const [selected, setSelected] = useState(initial);

  const setMonth = (m: Date) => {
    const first = startOfMonth(m);
    setMonthState(first);
    if (!isSameMonth(parseISO(selected), first))
      setSelected(
        isSameMonth(parseISO(today), first) ? today : toISODate(first),
      );
  };

  const goToday = () => {
    setMonthState(startOfMonth(parseISO(today)));
    setSelected(today);
  };

  const atToday =
    selected === today && isSameMonth(month, parseISO(today));

  return { month, setMonth, selected, setSelected, goToday, atToday };
}
