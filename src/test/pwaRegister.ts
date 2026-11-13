import { vi } from "vitest";

// Stand-in for vite-plugin-pwa's "virtual:pwa-register/react" in tests.
export const pwa = {
  needRefresh: false,
  updateServiceWorker: vi.fn(),
  registration: undefined as undefined | { update: () => void },
};

export function useRegisterSW(opts: { onRegisteredSW?: (url: string, r: unknown) => void }) {
  opts.onRegisteredSW?.("/sw.js", pwa.registration);
  return {
    needRefresh: [pwa.needRefresh, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: pwa.updateServiceWorker,
  };
}
