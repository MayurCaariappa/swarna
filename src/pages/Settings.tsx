import { format, parseISO } from "date-fns";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import RemindersSection from "../components/RemindersSection";
import TrackingSection from "../components/TrackingSection";
import { useConfirm } from "../components/ui/Confirm";
import { useTracking } from "../data/hooks";
import { useSyncStatus } from "../data/sync";
import { getPushState, type PushState } from "../lib/push";
import { isStandalone } from "../lib/platform";
import { errorMessage, supabase } from "../lib/supabase";
import type { InviteCode, SharingSettings } from "../lib/types";

export default function Settings() {
  const { profile, session, signOut } = useAuth();
  const navigate = useNavigate();
  const isOwner = profile?.role === "owner";

  // Read what the sections need from the phone first, then show them all at
  // once — otherwise each pops in separately and the page jumps.
  const tracking = useTracking(isOwner ? session?.user.id : undefined);
  const [push, setPush] = useState<PushState | null>(null);
  useEffect(() => {
    void getPushState().then(setPush);
  }, []);
  const ready = push !== null && tracking !== undefined;

  return (
    <div className="stack">
      <button
        className="btn link back"
        onClick={() => (history.length > 1 ? navigate(-1) : navigate("/"))}
      >
        ‹ Back
      </button>
      <h1>Settings</h1>

      <section className="card stack">
        <h2>Account</h2>
        <p>
          {profile?.display_name}
          <br />
          <span className="muted">{session?.user.email}</span>
        </p>
      </section>

      {ready && (
        <>
          {isOwner && <TrackingSection tracking={tracking} />}
          <RemindersSection
            initial={push}
            pillMode={tracking?.mode !== "natural"}
          />
          <PartnerSection />
          {isOwner && (
            <SharingSection
              reminderTime={
                tracking?.mode === "pill"
                  ? (tracking.reminder_time ?? "").slice(0, 5) || null
                  : null
              }
            />
          )}

          <section className="card stack">
            <h2>App</h2>
            {isOwner && (
              <Link to="/export" className="row-link">
                Export for your doctor (PDF / CSV)
                <span aria-hidden>›</span>
              </Link>
            )}
            <Link to="/install" className="row-link">
              {isStandalone()
                ? "Installed ✓ — how to install on another phone"
                : "Install on your Home Screen"}
              <span aria-hidden>›</span>
            </Link>
            {isOwner && <SyncLine />}
          </section>

          <FeedbackSection />

          <button className="btn" onClick={signOut}>
            Sign out
          </button>

          <p className="muted center small">
            Swarna · version {__APP_VERSION__}
            <br />
            Predictions are estimates — not for contraception.
          </p>
        </>
      )}
    </div>
  );
}

function PartnerSection() {
  const { profile, link, counterpart, refresh } = useAuth();
  const confirm = useConfirm();
  const isOwner = profile?.role === "owner";
  const [invite, setInvite] = useState<InviteCode | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Show an existing unused code if there is one.
  useEffect(() => {
    if (!isOwner || link) return;
    supabase
      .from("invite_codes")
      .select("code, owner_id, expires_at, used_at")
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setInvite(data));
  }, [isOwner, link]);

  async function createInvite() {
    setBusy(true);
    setError("");
    const { data, error } = await supabase.rpc("create_invite");
    if (error) setError(errorMessage(error));
    else setInvite(data as InviteCode);
    setBusy(false);
  }

  async function unlink() {
    const who = counterpart?.display_name || "your partner";
    const ok = await confirm({
      title: `Unlink from ${who}?`,
      message: isOwner
        ? `${who} will immediately lose access to everything you share.`
        : `You'll immediately lose access to what ${who} shares. You'd need a new invite code to link again.`,
      action: "Unlink",
      danger: true,
    });
    if (!ok) return;
    if (!link) return;
    const { error } = await supabase
      .from("partner_links")
      .delete()
      .eq("owner_id", link.owner_id);
    if (error) setError(errorMessage(error));
    await refresh();
  }

  async function share(code: string) {
    const text = `Join me on Swarna: ${location.origin} — my invite code is ${code}`;
    if (navigator.share) {
      try {
        await navigator.share({ text });
      } catch {
        /* cancelled */
      }
    } else {
      await navigator.clipboard?.writeText(text);
      alert("Copied to clipboard");
    }
  }

  return (
    <section className="card stack">
      <h2>{isOwner ? "Partner" : "Linked with"}</h2>

      {link ? (
        <>
          <p>
            {isOwner ? "Sharing with " : ""}
            <strong>{counterpart?.display_name || "your partner"}</strong>
            <span className="muted">
              {" "}
              · since {format(parseISO(link.created_at), "d MMM yyyy")}
            </span>
          </p>
          <button className="btn danger" onClick={unlink}>
            Unlink
          </button>
        </>
      ) : isOwner ? (
        invite ? (
          <>
            <p className="muted">
              Your partner enters this code in their Swarna app:
            </p>
            <div className="invite-code">{invite.code}</div>
            <p className="muted small">
              Expires {format(parseISO(invite.expires_at), "d MMM, HH:mm")}. Works
              once.
            </p>
            <div className="row">
              <button
                className="btn primary"
                onClick={() => share(invite.code)}
              >
                Share
              </button>
              <button className="btn" onClick={createInvite} disabled={busy}>
                New code
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="muted">
              Invite your partner to see what you choose to share.
            </p>
            <button
              className="btn primary"
              onClick={createInvite}
              disabled={busy}
            >
              {busy ? "Creating…" : "Invite partner"}
            </button>
          </>
        )
      ) : null}

      {error && <p className="error">{error}</p>}
    </section>
  );
}

const SHARE_OPTIONS: {
  key: keyof SharingSettings;
  label: string;
  hint?: string;
}[] = [
  {
    key: "share_periods",
    label: "Periods & predictions",
    hint: "Bleeds, flow, cycle/pack day, phase, next bleed",
  },
  {
    key: "share_pill_status",
    label: "Pill status",
    hint: "Taken today ✓ and taken / not-marked pills on the calendar",
  },
  { key: "share_mood", label: "Mood" },
  { key: "share_energy", label: "Energy" },
  { key: "share_exercise", label: "Exercise" },
  { key: "share_symptoms", label: "Symptoms" },
  { key: "share_sex", label: "Sex" },
  { key: "share_notes", label: "Notes" },
];

function SharingSection({ reminderTime }: { reminderTime: string | null }) {
  const { session, counterpart } = useAuth();
  const confirm = useConfirm();
  const who = counterpart?.display_name || "your partner";
  // Shown from the copy saved on this phone straight away (and offline),
  // then refreshed from the server.
  const key = `swarna.sharing.${session?.user.id}`;
  const [settings, setSettingsState] = useState<SharingSettings | null>(() => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? "null");
    } catch {
      return null;
    }
  });
  const setSettings = (next: SharingSettings | null) => {
    setSettingsState(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };
  const [error, setError] = useState("");

  useEffect(() => {
    if (!session) return;
    supabase
      .from("sharing_settings")
      .select("*")
      .eq("owner_id", session.user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          // Offline with a saved copy: keep showing it quietly.
          if (!localStorage.getItem(key)) setError(errorMessage(error));
        } else setSettings(data);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  async function toggle(key: keyof SharingSettings) {
    if (!settings) return;
    // Hiding pill status also stops the "pill not marked" alert (it would reveal it).
    if (key === "share_pill_status" && settings.share_pill_status)
      return set({ share_pill_status: false, partner_pill_alert: false });
    await set({ [key]: !settings[key] });
  }

  async function toggleAlert() {
    if (!settings) return;
    if (settings.partner_pill_alert) return set({ partner_pill_alert: false });
    if (
      !settings.share_pill_status &&
      !(await confirm({
        title: "Share pill status too?",
        message: `The alert tells ${who} when your pill isn't marked, so it needs Pill status turned on. ${who.charAt(0).toUpperCase() + who.slice(1)} will also see "taken today ✓".`,
        action: "Share and turn on",
      }))
    )
      return;
    await set({
      share_pill_status: true,
      partner_pill_alert: true,
      partner_pill_alert_time: settings.partner_pill_alert_time ?? "23:00",
    });
  }

  // The alert should come after her reminder and its +30 / +60 re-reminders.
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const savedAlert = (settings?.partner_pill_alert_time ?? "23:00").slice(0, 5);
  const isTooEarly = (t: string) => {
    if (reminderTime === null) return false;
    const end = toMin(reminderTime) + 60; // last re-reminder
    // A late reminder (after 23:00) can't have a later alert the same day; only
    // flag times between the reminder and midnight then.
    return end < 1440
      ? toMin(t) <= end
      : toMin(t) >= toMin(reminderTime);
  };
  // A too-early time is shown in the box but not saved.
  const [alertDraft, setAlertDraft] = useState<string | null>(null);
  const alertTime = alertDraft ?? savedAlert;
  const draftRejected = alertDraft !== null && isTooEarly(alertDraft);
  const savedTooEarly = !draftRejected && isTooEarly(savedAlert);

  async function set(patch: Partial<SharingSettings>) {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next); // optimistic
    const { error } = await supabase
      .from("sharing_settings")
      .update(patch)
      .eq("owner_id", settings.owner_id);
    if (error) {
      setSettings(settings); // roll back
      setError(errorMessage(error));
    }
  }

  return (
    <section className="card stack">
      <h2>What your partner can see</h2>
      {!settings && !error && <p className="muted">Loading…</p>}
      {settings &&
        SHARE_OPTIONS.map((o) => (
          <label key={o.key} className="toggle-row">
            <span>
              {o.label}
              {o.hint && <span className="muted small block">{o.hint}</span>}
            </span>
            <input
              type="checkbox"
              className="switch"
              checked={Boolean(settings[o.key])}
              onChange={() => toggle(o.key)}
            />
          </label>
        ))}
      {settings && (
        <>
          <label className="toggle-row">
            <span>
              Alert partner if pill not marked
              <span className="muted small block">
                Sends them a notification if today's pill isn't marked by this
                time. Needs Pill status shared.
              </span>
            </span>
            <input
              type="checkbox"
              className="switch"
              checked={settings.partner_pill_alert}
              onChange={toggleAlert}
            />
          </label>
          {settings.partner_pill_alert && (
            <label>
              Alert time
              <input
                type="time"
                value={alertTime}
                aria-invalid={draftRejected || undefined}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) return;
                  setAlertDraft(v);
                  if (!isTooEarly(v)) {
                    void set({ partner_pill_alert_time: v });
                    setAlertDraft(null);
                  }
                }}
              />
            </label>
          )}
          {settings.partner_pill_alert && draftRejected && (
            <p className="error small" role="alert">
              Not saved — {alertDraft} is before your reminders finish (
              {reminderTime}, then +30 and +60 min). Pick a time after{" "}
              {reminderTime && addHour(reminderTime)}. The alert stays at{" "}
              {savedAlert}.
            </p>
          )}
          {settings.partner_pill_alert && savedTooEarly && (
            <p className="error small" role="alert">
              Your alert ({savedAlert}) is now before your reminders finish (
              {reminderTime}, then +30 and +60 min), so {who} may be alerted
              before you've had a chance. Pick a time after{" "}
              {reminderTime && addHour(reminderTime)}.
            </p>
          )}
        </>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}

function FeedbackSection() {
  const [message, setMessage] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    setState("sending");
    const { error } = await supabase
      .from("feedback")
      .insert({ message: message.trim(), app_version: __APP_VERSION__ });
    if (error) {
      setState("error");
      return;
    }
    setMessage("");
    setState("sent");
  }

  return (
    <form className="card stack" onSubmit={submit}>
      <h2>Suggest something</h2>
      <textarea
        rows={3}
        value={message}
        onChange={(e) => {
          setMessage(e.target.value);
          if (state !== "sending") setState("idle");
        }}
        placeholder="What would make Swarna better?"
        maxLength={4000}
      />
      {state === "sent" && <p className="info">Thank you — saved.</p>}
      {state === "error" && (
        <p className="error">Couldn't send — try again when you're online.</p>
      )}
      <button className="btn" disabled={!message.trim() || state === "sending"}>
        {state === "sending" ? "Sending…" : "Send"}
      </button>
    </form>
  );
}

function SyncLine() {
  const { state, lastSyncedAt, pending } = useSyncStatus();
  const online = typeof navigator === "undefined" || navigator.onLine;
  const text =
    state === "syncing"
      ? "Syncing…"
      : state === "error"
        ? "Couldn't sync — will retry automatically"
        : pending
          ? online
            ? "Waiting to sync"
            : "Saved on this phone — will sync when online"
          : lastSyncedAt
            ? `All changes synced · ${new Date(lastSyncedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
            : "Saved on this phone";
  return <p className="muted small">{text}</p>;
}

/** "21:00" → "22:00" (wraps past midnight). */
function addHour(hhmm: string) {
  const m = (Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5)) + 60) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
