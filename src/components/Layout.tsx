import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { useOnline } from "../lib/useOnline";

export default function Layout() {
  const { profile } = useAuth();
  const online = useOnline();
  const isOwner = profile?.role === "owner";

  return (
    <div className="app">
      {!online && (
        <div className="offline-pill">Offline — changes will sync later</div>
      )}
      <main className="page">
        <Outlet />
      </main>
      <nav className="tabbar">
        {isOwner ? (
          <NavLink to="/today">
            <TabIcon d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v5l3 2" />
            Today
          </NavLink>
        ) : (
          <NavLink to="/partner">
            <TabIcon d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.5-7 10-7 10Z" />
            Home
          </NavLink>
        )}
        <NavLink to="/settings">
          <TabIcon d="M4 6h16M4 12h16M4 18h16" />
          Settings
        </NavLink>
      </nav>
    </div>
  );
}

function TabIcon({ d }: { d: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
}
