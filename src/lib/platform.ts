// Works out which phone/browser we're on and whether we're running as the
// installed (Home Screen) app — used by the install guide and reminders.

const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;

export const isIOS =
  /iPad|iPhone|iPod/.test(ua) ||
  (typeof navigator !== "undefined" &&
    navigator.platform === "MacIntel" &&
    navigator.maxTouchPoints > 1);

export const isAndroid = /Android/i.test(ua);

/** On iPhone, other browsers (Chrome = CriOS, Firefox = FxiOS…) can't reliably install. */
export const isIOSNonSafari =
  isIOS && /CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(ua);

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export type Platform = "ios" | "android" | "other";
export const platform: Platform = isIOS
  ? "ios"
  : isAndroid
    ? "android"
    : "other";

// ── Android "Install app" prompt ──
// Chrome fires this once, early. We keep it so a button can trigger it later.
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

export function captureInstallPrompt() {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    listeners.forEach((l) => l());
  });
}

export function canPromptInstall() {
  return deferredPrompt !== null;
}

export function onInstallPromptChange(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export async function promptInstall(): Promise<boolean> {
  if (!deferredPrompt) return false;
  await deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  listeners.forEach((l) => l());
  return outcome === "accepted";
}
