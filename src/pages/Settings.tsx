import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { isStandalone } from "../lib/platform";
import { errorMessage, supabase } from "../lib/supabase";
import type { InviteCode, SharingSettings } from "../lib/types";

export default function Settings() {
  const { profile, session, signOut } = useAuth();
  const isOwner = profile?.role === "owner";

  return (
    <div className="stack">
      <h1>Settings</h1>

      <section className="card stack">
        <h2>Account</h2>
        <p>
          {profile?.display_name}
          <br />
          <span className="muted">{session?.user.email}</span>
        </p>
      </section>

      <PartnerSection />
      {isOwner && <SharingSection />}

      <section className="card stack">
        <h2>App</h2>
        <Link to="/install" className="row-link">
          {isStandalone()
            ? "Installed ✓ — how to install on another phone"
            : "Install on your Home Screen"}
          <span aria-hidden>›</span>
        </Link>
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
    </div>
  );
}

function PartnerSection() {
  const { profile, link, counterpart, refresh } = useAuth();
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
    if (!confirm(`Unlink from ${who}? They will immediately lose access.`))
      return;
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
              · since {new Date(link.created_at).toLocaleDateString()}
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
              Expires {new Date(invite.expires_at).toLocaleDateString()}. Works
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
    hint: "Bleeds, cycle/pack day, phase, next bleed",
  },
  { key: "share_pill_status", label: "Pill taken today" },
  { key: "share_mood", label: "Mood" },
  { key: "share_energy", label: "Energy" },
  { key: "share_symptoms", label: "Symptoms" },
  { key: "share_sex", label: "Sex" },
  { key: "share_notes", label: "Notes" },
];

function SharingSection() {
  const { session } = useAuth();
  const [settings, setSettings] = useState<SharingSettings | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!session) return;
    supabase
      .from("sharing_settings")
      .select("*")
      .eq("owner_id", session.user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) setError(errorMessage(error));
        else setSettings(data);
      });
  }, [session]);

  async function toggle(key: keyof SharingSettings) {
    if (!settings) return;
    const next = { ...settings, [key]: !settings[key] };
    setSettings(next); // optimistic
    const { error } = await supabase
      .from("sharing_settings")
      .update({ [key]: next[key] })
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
