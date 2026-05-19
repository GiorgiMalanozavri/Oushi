/* Oushi service worker — handles web push notifications. */

self.addEventListener("install", (event) => {
  // Activate immediately on first install
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  // Take control of all open clients without requiring reload
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Oushi", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Oushi";
  const options = {
    body: data.body || "",
    icon: "/icon.svg",
    badge: "/icon.svg",
    tag: data.tag || "oushi",
    renotify: !!data.tag,
    data: {
      url: data.url || "/dashboard",
      nudgeType: data.nudgeType || null,
      resourceId: data.resourceId || null,
    },
    requireInteraction: false,
    silent: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/dashboard";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // If we already have a window open, focus it and navigate
        for (const client of clientList) {
          if ("focus" in client) {
            try {
              client.navigate(targetUrl);
              return client.focus();
            } catch {
              return client.focus();
            }
          }
        }
        // Otherwise open a new one
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});
