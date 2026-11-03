import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import {
  disablePush,
  enablePush,
  getPushState,
  sendTestPush,
  type PushState,
} from "../lib/push";
import { errorMessage } from "../lib/supabase";

/** Settings → Reminders: turn push on/off for THIS phone. */
export default function RemindersSection() {
  const { profile } = useAuth();
  const isOwner = profile?.role === "owner";
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    getPushState().then(setState);
  }, []);

  async function run(fn: () => Promise<PushState | string>) {
    setBusy(true);
    setMsg("");
    try {
      const r = await fn();
      if (r === "on" || r === "off" || r === "denied") setState(r);
      else setMsg(r);
    } catch (err) {
      setMsg(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (state === null) return null;

  return (
    <section className="card stack">
      <h2>Reminders</h2>
      <p className="muted small">
        {isOwner
          ? "Daily pill reminder at your chosen time, re-reminders at +30 and +60 minutes until it's marked, and a heads-up before your bleed."
          : "Alerts about her cycle that she chooses to share with you."}
      </p>

      {state === "needs-install" && (
        <Link to="/install" className="card hint">
          <strong>Install Swarna first</strong>
          <span className="muted">
            On iPhone, reminders only work in the app opened from the Home
            Screen icon.
          </span>
        </Link>
      )}
      {state === "unsupported" && (
        <p className="muted">This browser can't receive reminders.</p>
      )}
      {state === "denied" && (
        <p className="error">
          Notifications are blocked. Turn them on in your phone's Settings →
          Notifications → Swarna, then come back.
        </p>
      )}
      {state === "off" && (
        <button
          className="btn primary"
          disabled={busy}
          onClick={() => run(enablePush)}
        >
          {busy ? "Turning on…" : "Turn on reminders"}
        </button>
      )}
      {state === "on" && (
        <>
          <p className="info">Reminders are on for this phone ✓</p>
          <div className="row">
            <button
              className="btn"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const n = await sendTestPush();
                  return n > 0
                    ? "Test sent — it should arrive in a few seconds."
                    : "No devices found — try turning reminders off and on.";
                })
              }
            >
              Send test
            </button>
            <button
              className="btn danger"
              disabled={busy}
              onClick={() => run(disablePush)}
            >
              Turn off
            </button>
          </div>
          {isOwner && (
            <p className="muted small">
              Keep your current alarm for the first 2–3 weeks, until these have
              proven reliable.
            </p>
          )}
        </>
      )}
      {msg && <p className="muted small">{msg}</p>}
    </section>
  );
}
