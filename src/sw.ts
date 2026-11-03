/// <reference lib="webworker" />
// Swarna service worker: caches the app so it opens with no network.
// Web Push handlers will be added here in the reminders step.
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";

declare let self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Any in-app URL (e.g. /settings) loads the cached index.html when offline.
registerRoute(new NavigationRoute(createHandlerBoundToURL("index.html")));

// The "tap to refresh" toast sends this to activate the new version.
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

// ── Web Push ──
// Payload sent by supabase/functions/send-reminders: { title, body, url, tag }
self.addEventListener("push", (event) => {
  let data: { title?: string; body?: string; url?: string; tag?: string } = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    data = { body: event.data?.text() };
  }
  const options: NotificationOptions & { renotify?: boolean } = {
    body: data.body,
    icon: "/pwa-192x192.png",
    badge: "/pwa-64x64.png",
    tag: data.tag,
    renotify: Boolean(data.tag), // a re-reminder replaces the earlier one but still buzzes
    data: { url: data.url ?? "/" },
  };
  event.waitUntil(self.registration.showNotification(data.title ?? "Swarna", options));
});

// Tapping a notification opens (or focuses) the app on the right screen.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url ?? "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        await client.focus();
        if ("navigate" in client) await client.navigate(url);
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
