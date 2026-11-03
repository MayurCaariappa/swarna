import { useRegisterSW } from "virtual:pwa-register/react";

const HOUR = 60 * 60 * 1000;

/** Shows "New version available — tap to refresh" after each deploy. */
export default function UpdateToast() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      // Check for a new version hourly and whenever the app is reopened.
      setInterval(() => registration.update(), HOUR);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") registration.update();
      });
    },
  });

  if (!needRefresh) return null;

  return (
    <button className="toast" onClick={() => updateServiceWorker(true)}>
      New version available — tap to refresh
    </button>
  );
}
