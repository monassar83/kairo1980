/* The service worker. Scoped to /admin only.
   ---------------------------------------------------------------------------
   It does one job: wake when a push arrives, ask the server what is new, and
   show it. The push itself carries no payload (see worker/push.js), so no
   customer's name or address ever passes through a third-party push service —
   only the fact that SOMETHING happened.

   Deliberately no caching of any kind. A service worker that caches is a
   service worker that can serve a stale price or a stale opening time, and
   this one exists for notifications, not for offline. */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let title = 'KAIRO 1980';
    let body = 'Something needs your attention.';
    let url = '/admin';

    try {
      // Cookies travel with a same-origin fetch from a service worker, so the
      // admin session is what authorises this — the push carried nothing.
      const response = await fetch('/admin/api/latest', { credentials: 'same-origin' });
      if (response.ok) {
        const news = await response.json();
        if (news.title) title = news.title;
        if (news.body) body = news.body;
        if (news.url) url = news.url;
      }
    } catch (e) {
      // Show the generic notification rather than none: a silent push is
      // worse than a vague one.
    }

    await self.registration.showNotification(title, {
      body,
      icon: '/images/logo-mark.png',
      badge: '/images/logo-mark.png',
      // Vibrates and makes a sound on Android rather than arriving silently.
      requireInteraction: true,
      tag: 'kairo-order',
      renotify: true,
      data: { url }
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/admin';

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // Reuse a tab that is already open rather than piling up new ones.
    for (const client of windows) {
      if (client.url.includes('/admin') && 'focus' in client) {
        await client.navigate(url);
        return client.focus();
      }
    }
    return self.clients.openWindow(url);
  })());
});
