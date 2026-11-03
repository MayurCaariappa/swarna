import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import Disclaimer from "../components/Disclaimer";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default function Today() {
  const { profile, link, counterpart } = useAuth();

  return (
    <div className="stack">
      <p className="muted">
        {new Date().toLocaleDateString(undefined, {
          weekday: "long",
          day: "numeric",
          month: "long",
        })}
      </p>
      <h1>
        {greeting()}, {profile?.display_name}
      </h1>

      <section className="card hero">
        <p className="muted">Pack status</p>
        <p className="hero-text">Set up your pill pack</p>
        <p className="muted small">
          Coming next: pack start date, reminders and the pill strip.
        </p>
      </section>

      {!link && (
        <Link to="/settings" className="card hint">
          <strong>Invite your partner</strong>
          <span className="muted">Share only what you choose.</span>
        </Link>
      )}
      {link && (
        <p className="muted small">
          Sharing with {counterpart?.display_name || "your partner"}.
        </p>
      )}

      <Disclaimer />
    </div>
  );
}
