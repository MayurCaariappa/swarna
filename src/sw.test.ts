import { beforeEach, describe, expect, it, vi } from "vitest";

// The service worker, run against a fake worker scope.
const wb = vi.hoisted(() => ({
  precacheAndRoute: vi.fn(),
  cleanupOutdatedCaches: vi.fn(),
  createHandlerBoundToURL: vi.fn(() => "handler"),
  registerRoute: vi.fn(),
  NavigationRoute: vi.fn(function (this: { h: unknown }, h: unknown) {
    this.h = h;
  }),
}));
vi.mock("workbox-precaching", () => wb);
vi.mock("workbox-routing", () => wb);

type Handler = (e: unknown) => void;
const handlers: Record<string, Handler> = {};
const scope = {
  __WB_MANIFEST: [{ url: "index.html", revision: "1" }],
  addEventListener: (t: string, h: Handler) => (handlers[t] = h),
  skipWaiting: vi.fn(),
  registration: { showNotification: vi.fn() },
  location: { origin: "https://swarna.app" },
  clients: { matchAll: vi.fn(), openWindow: vi.fn() },
};

beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal("self", scope);
  await import("./sw");
});

/** Fire an event and wait for whatever it passed to waitUntil. */
async function fire(type: string, extra: object) {
  let work: Promise<unknown> | undefined;
  handlers[type]({ waitUntil: (p: Promise<unknown>) => (work = Promise.resolve(p)), ...extra });
  await work;
}

describe("service worker", () => {
  it("precaches the app and serves index.html for in-app URLs", () => {
    expect(wb.precacheAndRoute).toHaveBeenCalledWith(scope.__WB_MANIFEST);
    expect(wb.cleanupOutdatedCaches).toHaveBeenCalled();
    expect(wb.createHandlerBoundToURL).toHaveBeenCalledWith("index.html");
    expect(wb.registerRoute).toHaveBeenCalled();
  });

  it("activates a new version when asked", () => {
    handlers.message({ data: { type: "OTHER" } });
    handlers.message({ data: null });
    expect(scope.skipWaiting).not.toHaveBeenCalled();
    handlers.message({ data: { type: "SKIP_WAITING" } });
    expect(scope.skipWaiting).toHaveBeenCalled();
  });

  it("shows a reminder from the push payload", async () => {
    const payload = { title: "Time for pill 14 💊", body: "Tap to mark it", url: "/today?take=1", tag: "pill" };
    await fire("push", { data: { json: () => payload } });
    expect(scope.registration.showNotification).toHaveBeenCalledWith("Time for pill 14 💊", {
      body: "Tap to mark it",
      icon: "/pwa-192x192.png",
      badge: "/badge-96.png",
      tag: "pill",
      renotify: true,
      data: { url: "/today?take=1" },
    });
  });

  it("falls back for plain-text or empty pushes", async () => {
    await fire("push", { data: { json: () => JSON.parse("not json"), text: () => "hello" } });
    expect(scope.registration.showNotification).toHaveBeenLastCalledWith("Swarna", expect.objectContaining({ body: "hello", renotify: false, data: { url: "/" } }));
    await fire("push", { data: null });
    expect(scope.registration.showNotification).toHaveBeenLastCalledWith("Swarna", expect.objectContaining({ body: undefined }));
  });

  it("opens the app on the right screen when a notification is tapped", async () => {
    const close = vi.fn();
    const client = { focus: vi.fn(), navigate: vi.fn() };
    scope.clients.matchAll.mockResolvedValue([client]);
    await fire("notificationclick", { notification: { close, data: { url: "/today?take=1" } } });
    expect(close).toHaveBeenCalled();
    expect(client.focus).toHaveBeenCalled();
    expect(client.navigate).toHaveBeenCalledWith("https://swarna.app/today?take=1");

    const old = { focus: vi.fn() }; // a browser without navigate()
    scope.clients.matchAll.mockResolvedValue([old]);
    await fire("notificationclick", { notification: { close, data: null } });
    expect(old.focus).toHaveBeenCalled();

    scope.clients.matchAll.mockResolvedValue([]);
    await fire("notificationclick", { notification: { close } });
    expect(scope.clients.openWindow).toHaveBeenCalledWith("https://swarna.app/");
  });
});
