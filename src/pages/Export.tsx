import { addMonths, format, parseISO } from "date-fns";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import {
  useAllDailyLogs,
  usePeriods,
  usePillLogs,
  useTracking,
} from "../data/hooks";
import {
  buildPdf,
  dailyCsv,
  periodsCsv,
  type ExportData,
  type ExportOptions,
} from "../lib/export";
import { toISODate } from "../lib/pill";
import { shareOrDownload } from "../lib/shareFile";
import { useToday } from "../lib/useToday";

const RANGES = [
  { months: 3, label: "3 months" },
  { months: 6, label: "6 months" },
  { months: 12, label: "12 months" },
  { months: 0, label: "Everything" },
] as const;

/** Export history as PDF / CSV for her doctor. Built on the phone; works offline. */
export default function Export() {
  const navigate = useNavigate();
  const { session, profile } = useAuth();
  const ownerId = session!.user.id;
  const today = useToday();
  const tracking = useTracking(ownerId);
  const periods = usePeriods(ownerId);
  const logs = useAllDailyLogs(ownerId);
  const pills = usePillLogs(ownerId, "0000-01-01", "9999-12-31");

  const [months, setMonths] = useState<number>(6);
  const [includeNotes, setIncludeNotes] = useState(true);
  const [includeSex, setIncludeSex] = useState(false);
  const [includeDischarge, setIncludeDischarge] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  const ready = periods && logs && pills && tracking !== undefined;
  const earliest = [
    periods?.[0]?.start_date,
    logs?.[0]?.date,
    tracking?.pack_start_date,
    [...(pills?.keys() ?? [])].sort()[0],
  ]
    .filter((x): x is string => Boolean(x))
    .sort()[0];
  const from =
    months === 0
      ? (earliest ?? today)
      : toISODate(addMonths(parseISO(today), -months));

  const options: ExportOptions = {
    from,
    to: today,
    includeNotes,
    includeSex,
    includeDischarge,
  };
  const data = (): ExportData => ({
    name: profile?.display_name || "Me",
    tracking: tracking ?? null,
    periods: periods ?? [],
    logs: logs ?? [],
    taken: new Set(pills?.keys() ?? []),
    today,
  });
  const stamp = format(parseISO(today), "yyyy-MM-dd");

  async function run(kind: "pdf" | "daily" | "periods") {
    setBusy(kind);
    setMsg("");
    try {
      const blob =
        kind === "pdf"
          ? await buildPdf(data(), options)
          : new Blob(
              [
                kind === "daily"
                  ? dailyCsv(data(), options)
                  : periodsCsv(data(), options),
              ],
              {
                type: "text/csv;charset=utf-8",
              },
            );
      const name =
        kind === "pdf"
          ? `swarna-summary-${stamp}.pdf`
          : `swarna-${kind}-${stamp}.csv`;
      const result = await shareOrDownload(blob, name);
      if (result === "downloaded") setMsg(`Saved ${name}`);
    } catch (err) {
      console.error(err);
      setMsg("Couldn't create the file — please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="page narrow stack">
      <button
        className="btn link back"
        onClick={() =>
          history.length > 1 ? navigate(-1) : navigate("/settings")
        }
      >
        ‹ Back
      </button>
      <h1>Export for your doctor</h1>
      <p className="muted">
        Creates a file on this phone. Nothing is uploaded; you choose where to
        send it.
      </p>

      <section className="card stack">
        <h2>Time range</h2>
        <div className="chip-row">
          {RANGES.map((r) => (
            <button
              key={r.months}
              type="button"
              className={`tap-chip ${months === r.months ? "on" : ""}`}
              onClick={() => setMonths(r.months)}
            >
              {r.label}
            </button>
          ))}
        </div>
        <p className="muted small">
          {format(parseISO(from), "d MMM yyyy")} –{" "}
          {format(parseISO(today), "d MMM yyyy")}
        </p>
      </section>

      <section className="card stack">
        <h2>Include</h2>
        <p className="muted small">
          Periods, pills, symptoms, mood, energy and weight are always included.
        </p>
        <Toggle
          label="Notes"
          checked={includeNotes}
          onChange={setIncludeNotes}
        />
        <Toggle label="Sex" checked={includeSex} onChange={setIncludeSex} />
        <Toggle
          label="Discharge"
          checked={includeDischarge}
          onChange={setIncludeDischarge}
        />
      </section>

      <section className="card stack">
        <button
          className="btn primary"
          disabled={!ready || busy !== null}
          onClick={() => run("pdf")}
        >
          {busy === "pdf" ? "Creating PDF…" : "PDF summary"}
        </button>
        <p className="muted small">
          Easy to read: overview, periods, symptom patterns, monthly trends and
          a daily log.
        </p>
        <div className="row">
          <button
            className="btn"
            disabled={!ready || busy !== null}
            onClick={() => run("daily")}
          >
            {busy === "daily" ? "Creating…" : "Daily CSV"}
          </button>
          <button
            className="btn"
            disabled={!ready || busy !== null}
            onClick={() => run("periods")}
          >
            {busy === "periods" ? "Creating…" : "Periods CSV"}
          </button>
        </div>
        <p className="muted small">
          CSV files open in Excel, Numbers or Google Sheets.
        </p>
        {msg && <p className="info">{msg}</p>}
      </section>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="toggle-row">
      <span>{label}</span>
      <input
        type="checkbox"
        className="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}
