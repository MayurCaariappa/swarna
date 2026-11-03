import { useEffect, useState } from "react";
import { toISODate } from "./pill";

/** Today's local date as yyyy-MM-dd, in a given IANA timezone (default: this phone's). */
export function dateIn(timeZone?: string, at = new Date()): string {
  if (!timeZone) return toISODate(at);
  try {
    // en-CA formats as yyyy-mm-dd
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(at);
  } catch {
    return toISODate(at);
  }
}

/** Re-renders when the date changes (app left open past midnight, or reopened). */
export function useToday(timeZone?: string): string {
  const [today, setToday] = useState(() => dateIn(timeZone));
  useEffect(() => {
    const check = () => setToday(dateIn(timeZone));
    check();
    const id = setInterval(check, 30_000);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", check);
    };
  }, [timeZone]);
  return today;
}
