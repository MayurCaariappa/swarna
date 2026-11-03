import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthProvider";
import Layout from "./components/Layout";
import UpdateToast from "./components/UpdateToast";
import { supabaseConfigured } from "./lib/supabase";
import Calendar from "./pages/Calendar";
import InstallGuide from "./pages/InstallGuide";
import Join from "./pages/Join";
import Login from "./pages/Login";
import PartnerCalendar from "./pages/partner/PartnerCalendar";
import PartnerHistory from "./pages/partner/PartnerHistory";
import PartnerHome from "./pages/partner/PartnerHome";
import Settings from "./pages/Settings";
import Stats from "./pages/Stats";
import Today from "./pages/Today";
import Welcome from "./pages/Welcome";

export default function App() {
  return (
    <>
      <AppRoutes />
      <UpdateToast />
    </>
  );
}

function AppRoutes() {
  const { session, profile, link, loading } = useAuth();

  if (!supabaseConfigured) return <NotConfigured />;
  if (loading) return <Splash />;

  // Install guide is always reachable, signed in or not.
  if (!session) {
    return (
      <Routes>
        <Route path="/install" element={<InstallGuide />} />
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  if (!profile?.role) {
    return (
      <Routes>
        <Route path="/install" element={<InstallGuide />} />
        <Route path="*" element={<Welcome />} />
      </Routes>
    );
  }

  if (profile.role === "partner" && !link) {
    return (
      <Routes>
        <Route path="/install" element={<InstallGuide />} />
        <Route path="*" element={<Join />} />
      </Routes>
    );
  }

  const home = profile.role === "owner" ? "/today" : "/partner";

  return (
    <Routes>
      <Route element={<Layout />}>
        {profile.role === "owner" && (
          <>
            <Route path="/today" element={<Today />} />
            <Route path="/calendar" element={<Calendar />} />
            <Route path="/stats" element={<Stats />} />
          </>
        )}
        {profile.role === "partner" && (
          <>
            <Route path="/partner" element={<PartnerHome />} />
            <Route path="/partner/calendar" element={<PartnerCalendar />} />
            <Route path="/partner/periods" element={<PartnerHistory />} />
          </>
        )}
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="/install" element={<InstallGuide />} />
      <Route path="*" element={<Navigate to={home} replace />} />
    </Routes>
  );
}

function Splash() {
  return (
    <div className="center-screen">
      <img src="/logo.svg" alt="" className="splash-logo" />
    </div>
  );
}

function NotConfigured() {
  return (
    <div className="page narrow">
      <h1>Swarna</h1>
      <div className="card">
        <p>
          Supabase isn't connected yet. Copy <code>.env.example</code> to{" "}
          <code>.env.local</code>, fill in your project URL and anon key, then
          restart <code>npm run dev</code>.
        </p>
      </div>
    </div>
  );
}
