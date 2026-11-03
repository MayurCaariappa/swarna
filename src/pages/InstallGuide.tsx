import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  canPromptInstall,
  isIOSNonSafari,
  isStandalone,
  onInstallPromptChange,
  platform,
  promptInstall,
  type Platform,
} from "../lib/platform";

export default function InstallGuide() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Exclude<Platform, "other">>(
    platform === "android" ? "android" : "ios",
  );
  const [canPrompt, setCanPrompt] = useState(canPromptInstall());

  useEffect(() => {
    const off = onInstallPromptChange(() => setCanPrompt(canPromptInstall()));
    return () => {
      off();
    };
  }, []);

  return (
    <div className="page narrow stack">
      <button
        className="btn link back"
        onClick={() => (history.length > 1 ? navigate(-1) : navigate("/"))}
      >
        ‹ Back
      </button>
      <h1>Install Swarna</h1>

      {isStandalone() ? (
        <div className="card">
          <strong>You're using the installed app ✓</strong>
          <p className="muted">Nothing else to do on this phone.</p>
        </div>
      ) : (
        <p className="muted">
          Swarna works best installed on your Home Screen — it opens instantly,
          works offline, and can send reminders.
        </p>
      )}

      <div className="segmented">
        <button
          className={tab === "ios" ? "on" : ""}
          onClick={() => setTab("ios")}
        >
          iPhone
        </button>
        <button
          className={tab === "android" ? "on" : ""}
          onClick={() => setTab("android")}
        >
          Android
        </button>
      </div>

      {tab === "ios" ? (
        <ol className="steps">
          {isIOSNonSafari && (
            <li className="card warn">
              You're in a different browser. Copy this link and open it in{" "}
              <strong>Safari</strong> first.
            </li>
          )}
          <Step n={1} title="Open this page in Safari" picture={<SafariBar />}>
            Needs iOS 16.4 or newer.
          </Step>
          <Step n={2} title="Tap the Share button" picture={<ShareIcon />}>
            The square with an arrow pointing up — at the bottom of the screen
            (or top on iPad).
          </Step>
          <Step
            n={3}
            title='Scroll and tap "Add to Home Screen"'
            picture={
              <MenuRow icon={<PlusSquare />} label="Add to Home Screen" />
            }
          >
            Then tap <strong>Add</strong> in the top corner.
          </Step>
          <Step
            n={4}
            title="Open Swarna from the new icon"
            picture={<HomeIcon />}
          >
            Always open it from the icon — reminders only work there.
          </Step>
          <Step n={5} title="Log in inside the app">
            The installed app has its own storage, separate from Safari, so log
            in again here.
          </Step>
        </ol>
      ) : (
        <ol className="steps">
          {canPrompt && (
            <li className="card">
              <button
                className="btn primary wide"
                onClick={() => promptInstall()}
              >
                Install Swarna now
              </button>
            </li>
          )}
          <Step n={1} title="Open this page in Chrome" />
          <Step n={2} title="Tap ⋮ (top right)" picture={<DotsIcon />} />
          <Step
            n={3}
            title='Tap "Install app"'
            picture={<MenuRow icon={<PhoneDown />} label="Install app" />}
          >
            Some phones say <strong>Add to Home screen</strong> instead.
          </Step>
          <Step
            n={4}
            title="Open Swarna from the new icon"
            picture={<HomeIcon />}
          />
          <Step n={5} title="Log in inside the app" />
        </ol>
      )}
    </div>
  );
}

function Step({
  n,
  title,
  picture,
  children,
}: {
  n: number;
  title: string;
  picture?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <li className="card step">
      <div className="step-num">{n}</div>
      <div className="step-body">
        <strong>{title}</strong>
        {children && <p className="muted small">{children}</p>}
        {picture && <div className="step-pic">{picture}</div>}
      </div>
    </li>
  );
}

// ── Little drawings of what to tap ──
const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function ShareIcon() {
  return (
    <svg viewBox="0 0 48 48" width="48" height="48" className="accent">
      <path {...stroke} d="M16 20h-4v20h24V20h-4M24 6v22M17 13l7-7 7 7" />
    </svg>
  );
}

function PlusSquare() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22">
      <rect {...stroke} x="3" y="3" width="18" height="18" rx="4" />
      <path {...stroke} d="M12 8v8M8 12h8" />
    </svg>
  );
}

function PhoneDown() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22">
      <rect {...stroke} x="6" y="2" width="12" height="20" rx="2" />
      <path {...stroke} d="M12 7v7M9 11l3 3 3-3" />
    </svg>
  );
}

function DotsIcon() {
  return (
    <svg viewBox="0 0 48 48" width="48" height="48" className="accent">
      <circle cx="24" cy="12" r="3" fill="currentColor" />
      <circle cx="24" cy="24" r="3" fill="currentColor" />
      <circle cx="24" cy="36" r="3" fill="currentColor" />
    </svg>
  );
}

function MenuRow({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="mock-menu">
      <span>{label}</span>
      {icon}
    </div>
  );
}

function SafariBar() {
  return (
    <div className="mock-bar">
      <span aria-hidden>🔒</span> {location.host}
    </div>
  );
}

function HomeIcon() {
  return (
    <div className="mock-home">
      <img src="/apple-touch-icon-180x180.png" alt="" />
      <span>Swarna</span>
    </div>
  );
}
