import { useEffect } from "react";
import { CloudOff } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
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
        {isOwner ? (
          <>
            <NavLink to="/today">Today</NavLink>
            <NavLink to="/calendar">Calendar</NavLink>
            <NavLink to="/stats">Stats</NavLink>
          </>
        ) : (
          <>
            <NavLink to="/partner" end>
              Home
            </NavLink>
            <NavLink to="/partner/calendar">Calendar</NavLink>
            <NavLink to="/partner/periods">Periods</NavLink>
          </>
        )}
      </nav>
    </div>
  );
}
