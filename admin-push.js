/* Turning notifications on, from the admin area.
   ---------------------------------------------------------------------------
   The only JavaScript anywhere in /admin, and it is here rather than inline
   because the admin pages carry a strict policy and a file can be named in it
   while an inline block cannot.

   Nothing here is a secret. The VAPID public key is public by definition, and
   the subscription it produces is useless without the private key. */

(function () {
  'use strict';

  var button = document.getElementById('pushToggle');
  var status = document.getElementById('pushStatus');
  if (!button || !status) return;

  var key = button.getAttribute('data-vapid') || '';

  function say(text, bad) {
    status.textContent = text;
    status.className = 'pushmsg' + (bad ? ' bad' : '');
  }

  // Base64url to the Uint8Array the subscribe call wants.
  function keyBytes(value) {
    var padded = (value + '='.repeat((4 - value.length % 4) % 4))
      .replace(/-/g, '+').replace(/_/g, '/');
    var raw = atob(padded);
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    say('This browser cannot show notifications. On iPhone, add this page to the home screen first.', true);
    button.disabled = true;
    return;
  }

  navigator.serviceWorker.register('/sw.js', { scope: '/admin' }).then(function (registration) {
    return registration.pushManager.getSubscription().then(function (existing) {
      if (existing) say('Notifications are on for this device.');
      button.disabled = false;

      button.addEventListener('click', function () {
        button.disabled = true;
        say('…');

        registration.pushManager.getSubscription().then(function (current) {
          if (current) {
            // Off: tell the server first, so a device that fails to
            // unsubscribe locally still stops being rung.
            return post('/admin/push/off', { endpoint: current.endpoint })
              .then(function () { return current.unsubscribe(); })
              .then(function () { say('Notifications are off for this device.'); });
          }

          return Notification.requestPermission().then(function (permission) {
            if (permission !== 'granted') {
              say('Your browser refused. Allow notifications for this site in its settings, then try again.', true);
              return null;
            }
            return registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: keyBytes(key)
            }).then(function (subscription) {
              var json = subscription.toJSON();
              return post('/admin/push/on', {
                endpoint: json.endpoint,
                keys: json.keys,
                label: navigator.userAgent.slice(0, 60)
              });
            }).then(function () { say('Notifications are on for this device.'); });
          });
        }).catch(function (err) {
          say('Could not change it: ' + (err && err.message ? err.message : 'unknown'), true);
        }).then(function () { button.disabled = false; });
      });
    });
  }).catch(function (err) {
    say('Could not start: ' + (err && err.message ? err.message : 'unknown'), true);
  });

  function post(url, body) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body)
    }).then(function (r) {
      if (!r.ok) throw new Error('server said ' + r.status);
      return r;
    });
  }
})();
