import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import Disclaimer from "../components/Disclaimer";
import PackSetup from "../components/pill/PackSetup";
import PillToday from "../components/pill/PillToday";
import { useTracking } from "../data/hooks";
import { useToday } from "../lib/useToday";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default function Today() {
  const { profile, session, link, counterpart } = useAuth();
  const ownerId = session!.user.id;
  const today = useToday();
  const tracking = useTracking(ownerId);

  return (
    <div className="stack">
      <p className="muted">
        {new Date(today + "T12:00").toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
      </p>
      <h1>
        {greeting()}, {profile?.display_name}
      </h1>

      {tracking === undefined ? null : tracking?.mode === "natural" ? (
        <section className="card hero">
          <p className="muted">Natural cycle</p>
          <p className="hero-text">Cycle tracking</p>
          <p className="muted small">
            Period logging and cycle predictions are coming in the next step. The first cycles after stopping the pill
            can be irregular, so predictions will take a few cycles to settle.
          </p>
        </section>
      ) : tracking?.pack_start_date ? (
        <PillToday ownerId={ownerId} tracking={tracking} today={today} />
      ) : (
        <PackSetup ownerId={ownerId} today={today} />
      )}

      {!link && (
        <Link to="/settings" className="card hint">
          <strong>Invite your partner</strong>
          <span className="muted">Share only what you choose.</span>
        </Link>
      )}
      {link && <p className="muted small">Sharing with {counterpart?.display_name || "your partner"}.</p>}

      <Disclaimer />
    </div>
  );
}
