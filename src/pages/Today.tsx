import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import Disclaimer from "../components/Disclaimer";
import WelcomeCard from "../components/WelcomeCard";
import PageHeader from "../components/ui/PageHeader";
import LogTodayCard from "../components/log/LogTodayCard";
import NaturalToday from "../components/period/NaturalToday";
import PeriodCard from "../components/period/PeriodCard";
import PackSetup from "../components/pill/PackSetup";
import PillToday from "../components/pill/PillToday";
import { usePeriods, useTracking } from "../data/hooks";
import { greeting } from "../lib/greeting";
import { useToday } from "../lib/useToday";

export default function Today() {
  const { profile, session, link } = useAuth();
  const ownerId = session!.user.id;
  const today = useToday();
  const tracking = useTracking(ownerId);
  const periods = usePeriods(ownerId);

  const tiles = periods && (
    <div className="quick">
      <PeriodCard ownerId={ownerId} periods={periods} today={today} />
      <LogTodayCard ownerId={ownerId} today={today} />
    </div>
  );

  return (
    <div className="stack">
      <PageHeader
        eyebrow={new Date(today + "T12:00").toLocaleDateString(undefined, {
          weekday: "long",
          day: "numeric",
          month: "short",
        })}
        title={`${greeting()
          .replace("Good ", "")
          .replace(/^./, (c) =>
            c.toUpperCase(),
          )}, ${profile?.display_name ?? ""}`}
      />

      <WelcomeCard />

      {tracking === undefined ||
      periods === undefined ? null : tracking?.mode === "natural" ? (
        <NaturalToday tracking={tracking} periods={periods} today={today}>
          {tiles}
        </NaturalToday>
      ) : tracking?.pack_start_date ? (
        <PillToday ownerId={ownerId} tracking={tracking} today={today}>
          {tiles}
        </PillToday>
      ) : (
        <PackSetup ownerId={ownerId} today={today} />
      )}

      {!link && (
        <Link to="/settings" className="card hint row-between">
          <span>
            <strong>Invite your partner</strong>
            <span className="muted small block">
              Share only what you choose
            </span>
          </span>
          <ChevronRight size={18} />
        </Link>
      )}

      <Disclaimer />
    </div>
  );
}
