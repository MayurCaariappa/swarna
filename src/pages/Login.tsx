import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { isStandalone } from "../lib/platform";
import { errorMessage, supabase } from "../lib/supabase";

type Mode = "signin" | "signup" | "reset";

// Email + password (not magic links): on iPhone a magic link opens in Safari,
// whose storage is separate from the installed app, so she'd never be logged
// in where it matters.
export default function Login() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    // Our own checks with a visible message (the browser's pop-up bubbles are
    // easy to miss, and often don't show in the installed app).
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError("Enter your email address.");
      return;
    }
    if (mode !== "reset" && !password) {
      setError("Enter your password.");
      return;
    }
    if (mode === "signup" && password.length < 8) {
      setError("Choose a password with at least 8 characters.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        if (!data.session) {
          setInfo(
            "Check your email and tap the confirmation link, then come back here and sign in.",
          );
          setMode("signin");
        }
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(
          email.trim(),
          {
            redirectTo: `${location.origin}/`,
          },
        );
        if (error) throw error;
        setInfo("If that email has an account, a reset link is on its way.");
        setMode("signin");
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page narrow login">
      <img src="/logo.svg" alt="" className="login-logo" />
      <h1 className="login-title">Swarna</h1>
      <p className="muted center">Private. Calm. Just for the two of you.</p>

      {!isStandalone() && (
        <Link to="/install" className="card hint">
          <strong>Install the app first</strong>
          <span className="muted">
            Log in from the Home Screen icon. Logging in here in the browser
            won't carry over.
          </span>
        </Link>
      )}

      <form className="card stack" onSubmit={submit} noValidate>
        {mode !== "reset" && (
          <div className="segmented">
            <button
              type="button"
              className={mode === "signin" ? "on" : ""}
              onClick={() => setMode("signin")}
            >
              Sign in
            </button>
            <button
              type="button"
              className={mode === "signup" ? "on" : ""}
              onClick={() => setMode("signup")}
            >
              Create account
            </button>
          </div>
        )}

        <label>
          Email
          <input
            type="email"
            autoComplete="email"
            autoCapitalize="none"
            inputMode="email"
            enterKeyHint={mode === "reset" ? "send" : "next"}
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        {mode !== "reset" && (
          <label>
            Password
            <input
              type="password"
              autoComplete={
                mode === "signup" ? "new-password" : "current-password"
              }
              minLength={mode === "signup" ? 8 : undefined}
              enterKeyHint="go"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
        )}

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {info && <p className="info">{info}</p>}

        <button type="submit" className="btn primary" disabled={busy}>
          {busy
            ? "Please wait…"
            : mode === "signin"
              ? "Sign in"
              : mode === "signup"
                ? "Create account"
                : "Send reset link"}
        </button>

        {mode === "signin" && (
          <button
            type="button"
            className="btn link"
            onClick={() => setMode("reset")}
          >
            Forgot password?
          </button>
        )}
        {mode === "reset" && (
          <button
            type="button"
            className="btn link"
            onClick={() => setMode("signin")}
          >
            Back to sign in
          </button>
        )}
      </form>
    </div>
  );
}
