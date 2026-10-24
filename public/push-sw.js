/* PaceMeet: Push-Nachrichten im Service Worker anzeigen und beim Antippen die App öffnen. */
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { body: event.data && event.data.text() }; }
  const title = data.title || "PaceMeet";
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || "",
    icon: "/pwa-192.png",
    badge: "/pwa-192.png",
    tag: data.tag,
    renotify: !!data.tag,
    data: { url: data.url || "/" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil((async () => {
    const all = await clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if (new URL(c.url).origin === self.location.origin) {
        await c.focus();
        if ("navigate" in c) { try { await c.navigate(target); } catch (e) { /* ignorieren */ } }
        return;
      }
    }
    await clients.openWindow(target);
  })());
});
