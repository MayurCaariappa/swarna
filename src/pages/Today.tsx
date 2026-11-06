import { format, parseISO } from "date-fns";
import { useAuth } from "../auth/AuthProvider";
import Disclaimer from "../components/Disclaimer";
import InviteHint from "../components/InviteHint";
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
  const ready = tracking !== undefined && periods !== undefined;

  const tiles = periods && (
    <div className="quick">
      <PeriodCard ownerId={ownerId} periods={periods} today={today} />
      <LogTodayCard ownerId={ownerId} today={today} />
    </div>
  );

  return (
    <div className="stack">
      <PageHeader
        eyebrow={format(parseISO(today), "EEEE d MMM")}
        title={`${greeting()
          .replace("Good ", "")
          .replace(/^./, (c) =>
            c.toUpperCase(),
          )}, ${profile?.display_name ?? ""}`}
      />

      <WelcomeCard />

      {!ready ? null : tracking?.mode === "natural" ? (
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

      {/* The hint and disclaimer wait for the hero, so they don't jump down when it appears. */}
      {ready && !link && <InviteHint ownerId={ownerId} />}

      {ready && <Disclaimer />}
    </div>
  );
}
