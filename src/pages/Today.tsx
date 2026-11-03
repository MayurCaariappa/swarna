import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import Disclaimer from "../components/Disclaimer";
import WelcomeCard from "../components/WelcomeCard";
import LogTodayCard from "../components/log/LogTodayCard";
import NaturalToday from "../components/period/NaturalToday";
import PeriodCard from "../components/period/PeriodCard";
import PackSetup from "../components/pill/PackSetup";
import PillToday from "../components/pill/PillToday";
import { usePeriods, useTracking } from "../data/hooks";
import { greeting } from "../lib/greeting";
import { useToday } from "../lib/useToday";

export default function Today() {
  const { profile, session, link, counterpart } = useAuth();
  const ownerId = session!.user.id;
  const today = useToday();
  const tracking = useTracking(ownerId);
  const periods = usePeriods(ownerId);

  return (
    <div className="stack">
      <p className="muted">
        {new Date(today + "T12:00").toLocaleDateString(undefined, {
          weekday: "long",
          day: "numeric",
          month: "long",
        })}
      </p>
      <h1>
        {greeting()}, {profile?.display_name}
      </h1>

      <WelcomeCard />

      {tracking === undefined ||
      periods === undefined ? null : tracking?.mode === "natural" ? (
        <>
          <NaturalToday tracking={tracking} periods={periods} today={today} />
          <PeriodCard ownerId={ownerId} periods={periods} today={today} />
          <LogTodayCard ownerId={ownerId} today={today} />
        </>
      ) : tracking?.pack_start_date ? (
        <>
          <PillToday ownerId={ownerId} tracking={tracking} today={today} />
          <PeriodCard ownerId={ownerId} periods={periods} today={today} />
          <LogTodayCard ownerId={ownerId} today={today} />
        </>
      ) : (
        <PackSetup ownerId={ownerId} today={today} />
      )}

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
