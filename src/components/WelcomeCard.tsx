import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";

const key = (uid: string) => `swarna.welcomed.${uid}`;

function seen(uid: string) {
  try {
    return localStorage.getItem(key(uid)) === "1";
  } catch {
    return false;
  }
}

/** First-run welcome, once per person per phone. */
export default function WelcomeCard() {
  const { session, profile, counterpart } = useAuth();
  const uid = session?.user.id ?? "";
  const [hidden, setHidden] = useState(() => !uid || seen(uid));
  if (hidden) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(key(uid), "1");
    } catch {
      /* ignore */
    }
    setHidden(true);
  };

  const isOwner = profile?.role === "owner";
  const her = counterpart?.display_name || "she";

  return (
    <section className="card welcome stack">
      <h2>Welcome to Swarna 💜</h2>
      {isOwner ? (
        <ul className="welcome-list">
          <li>
            Tap <strong>Taken ✓</strong> each day — the strip shows your pack at
            a glance.
          </li>
          <li>
            Tap <strong>Period started / ended</strong> — predictions learn from
            you.
          </li>
          <li>
            <strong>How are you today?</strong> logs symptoms, mood and more in
            a few taps.
          </li>
          <li>
            Turn on reminders in <Link to="/settings">Settings</Link>. Keep your
            current alarm for the first 2–3 weeks, just in case.
          </li>
          <li>
            Everything is private. You decide exactly what your partner sees.
          </li>
        </ul>
      ) : (
        <ul className="welcome-list">
          <li>
            You'll see what {her} chooses to share — it updates within a second.
          </li>
          <li>
            <strong>Calendar</strong> and <strong>Periods</strong> show the
            bigger picture.
          </li>
          <li>
            Turn on reminders in <Link to="/settings">Settings</Link> for a
            heads-up before her bleed.
          </li>
        </ul>
      )}
      <button className="btn ink" onClick={dismiss}>
        Got it
      </button>
    </section>
  );
}
