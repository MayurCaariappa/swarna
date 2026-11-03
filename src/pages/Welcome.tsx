import { useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { errorMessage, supabase } from "../lib/supabase";
import type { Role } from "../lib/types";

/** First run after sign-up: who is this account for? */
export default function Welcome() {
  const { refresh, signOut } = useAuth();
  const [role, setRole] = useState<Role | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (!role) return;
    setBusy(true);
    setError("");
    const { error } = await supabase.rpc("set_role", {
      p_role: role,
      p_name: name,
    });
    if (error) {
      setError(errorMessage(error));
      setBusy(false);
      return;
    }
    // Also store the phone's timezone so reminders fire at her local time.
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const { data } = await supabase.auth.getUser();
    if (data.user)
      await supabase
        .from("profiles")
        .update({ timezone: tz })
        .eq("id", data.user.id);
    await refresh();
  }

  return (
    <div className="page narrow stack">
      <h1>Welcome to Swarna</h1>
      <p className="muted">Who's using this account?</p>

      <button
        className={`choice ${role === "owner" ? "on" : ""}`}
        onClick={() => setRole("owner")}
      >
        <strong>I'm tracking my cycle</strong>
        <span className="muted">
          Log periods, pills and how you feel. You decide what your partner
          sees.
        </span>
      </button>

      <button
        className={`choice ${role === "partner" ? "on" : ""}`}
        onClick={() => setRole("partner")}
      >
        <strong>I'm the partner</strong>
        <span className="muted">
          See what she chooses to share. You'll need her invite code.
        </span>
      </button>

      {role && (
        <label className="card">
          Your first name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </label>
      )}

      {error && <p className="error">{error}</p>}

      <button
        className="btn primary"
        disabled={!role || !name.trim() || busy}
        onClick={save}
      >
        {busy ? "Saving…" : "Continue"}
      </button>
      <button className="btn link" onClick={signOut}>
        Sign out
      </button>
    </div>
  );
}
