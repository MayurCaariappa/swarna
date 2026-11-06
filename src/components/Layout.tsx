import { useEffect, useState } from "react";
import { CloudOff } from "lucide-react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { startSync } from "../data/sync";
import { PartnerDataProvider } from "../partner/PartnerData";
import { refreshPushSubscription } from "../lib/push";
import { useOnline } from "../lib/useOnline";

export default function Layout() {
  const { profile, session } = useAuth();
  const online = useOnline();
  const isOwner = profile?.role === "owner";
  const uid = session?.user.id;

  const tabs = isOwner ? OWNER_TABS : PARTNER_TABS;
  const { pathname } = useLocation();
  const current = tabs.find((t) => t.to === pathname)?.to;
  // On Settings (no tab of its own) keep the tab you came from highlighted.
  const [lastTab, setLastTab] = useState(tabs[0].to);
  if (current && current !== lastTab) setLastTab(current);
  const activeTab = current ?? lastTab;

  // Keep this phone's reminder subscription fresh on the server.
  useEffect(() => {
    if (uid) void refreshPushSubscription();
  }, [uid]);

  // Keep the phone's data and Supabase in sync while the app is open.
  useEffect(() => {
    if (isOwner && uid) return startSync(uid);
  }, [isOwner, uid]);

  return (
    <div className="app">
      <main className="page">
        {/* Part of the page (pushes content down) rather than floating over it. */}
        {!online && (
          <div className="offline-bar" role="status">
            <CloudOff size={15} strokeWidth={2.4} aria-hidden />
            {isOwner
              ? "Offline · your changes will sync later"
              : "Offline · showing the last update"}
          </div>
        )}
        {isOwner ? (
          <Outlet />
        ) : (
          <PartnerDataProvider>
            <Outlet />
          </PartnerDataProvider>
        )}
      </main>
      <nav className="tabbar" aria-label="Main">
        {tabs.map((t) => (
          <Link
            key={t.to}
            to={t.to}
            className={t.to === activeTab ? "active" : undefined}
            aria-current={t.to === current ? "page" : undefined}
          >
            {t.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

const OWNER_TABS = [
  { to: "/today", label: "Today" },
  { to: "/calendar", label: "Calendar" },
  { to: "/stats", label: "Stats" },
];
const PARTNER_TABS = [
  { to: "/partner", label: "Home" },
  { to: "/partner/calendar", label: "Calendar" },
  { to: "/partner/periods", label: "Periods" },
];
