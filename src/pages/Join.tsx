import { useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthProvider";
import { errorMessage, supabase } from "../lib/supabase";

/** Partner without a link yet: enter her invite code. */
export default function Join() {
  const { profile, refresh, signOut } = useAuth();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await supabase.rpc("redeem_invite", { p_code: code });
    if (error) {
      setError(errorMessage(error));
      setBusy(false);
      return;
    }
    await refresh();
  }

  return (
    <div className="page narrow stack">
      <h1>Hi {profile?.display_name || "there"}</h1>
      <p className="muted">
        Ask her to open Swarna → <strong>Settings → Invite partner</strong> and
        read you the 6-letter code.
      </p>

      <form className="card stack" onSubmit={submit}>
        <label>
          Invite code
          <input
            className="code-input"
            value={code}
            onChange={(e) =>
              setCode(
                e.target.value
                  .toUpperCase()
                  .replace(/[^A-Z0-9]/g, "")
                  .slice(0, 6),
              )
            }
            autoCapitalize="characters"
            autoComplete="off"
            inputMode="text"
            placeholder="ABC234"
            autoFocus
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn primary" disabled={code.length !== 6 || busy}>
          {busy ? "Linking…" : "Link accounts"}
        </button>
      </form>

      <button className="btn link" onClick={signOut}>
        Sign out
      </button>
    </div>
  );
}
