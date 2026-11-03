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
