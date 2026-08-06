# A sound on your phone

`/admin` is installable and can ring. No Play Store, no second codebase, no
review: it is the page you already use, with a manifest and a service worker.

**Status: built, on the branch `next/orders-and-push`. Not live.** It needs one
command run and one button pressed.

## Turning it on

```
node tools/setup-push.mjs
```

Once, ever. It generates a VAPID keypair — this application's identity to a
push service — and pipes it straight into Cloudflare. The private half is never
printed and never written to disk. The public half is printed, because the
browser needs it and it is public by definition.

Then, on the phone that should ring:

1. Open `https://kairo1980.de/admin` in Chrome.
2. **Menu → Add to Home Screen.** This matters: on Android it makes the page an
   app, and on iPhone it is the *only* way notifications work at all.
3. Open it from the home screen icon, and press **Turn notifications on**.

Changing the VAPID keys later invalidates every subscription — a push service
refuses a notification signed by a key it has not seen for that endpoint — and
every device has to enable them again. So: once.

## What it will tell you, and what it cannot

Today the server only ever learns about **payments**. So a notification can say
*"Paid: 34,50 € · Delivery · K7F3QA"*, and that is genuinely useful — it is the
money arriving. It cannot tell you a WhatsApp order came in, because nothing
tells the server one did.

That changes with `docs/whatsapp-cloud-api.md`. Once orders are placed on this
server rather than composed into a message, the same mechanism carries every
order and this becomes the live order screen. **Push first is deliberate:** it
is needed either way, it is a day's work, and it means the WhatsApp migration
arrives with notifications already working rather than as one enormous change.

## How it works, and why it is this shape

**The push carries no payload.** An encrypted Web Push body needs ECDH, HKDF
and AES-GCM per subscription (RFC 8291) — a hundred lines of cryptography to
save one fetch. Instead the push is a doorbell with nothing written on it: the
service worker wakes, asks `/admin/api/latest` what is new, and shows that.

Less code is the smaller reason. The real one: **no customer's name, address or
order ever passes through Google's push service.** All it ever carries is the
fact that something happened. The words come over our own origin, to a
signed-in session.

**The service worker caches nothing.** Not the page, not the styles, not
anything. A service worker that caches is one that can serve a stale price or a
stale opening time from a phone the restaurant trusts, and this one exists for
notifications, not for offline. `sw.js` is also served `no-cache`, because a
stale service worker is the one file capable of keeping itself alive.

**A dead subscription is deleted, not retried.** When a push service answers
404 or 410 the app was uninstalled or the browser data cleared. The row goes.
Retrying it for ever is how a notification system becomes a wall of errors
nobody reads.

**The admin CSP gained exactly two things**: `script-src 'self'` and
`worker-src 'self'`. One named file, `/admin-push.js`, and one service worker.
No inline script anywhere — `connect-src 'self'` means the subscription can
only ever be posted back here, and a test asserts all of it.

## iPhone

Web Push works on iOS 16.4 and later, but **only** for a page added to the home
screen, and only when opened from that icon. In Safari it will not work and the
page says so rather than failing silently.

## What is not built

- **Nothing sends a push yet.** `notifyAll()` is written and tested as far as
  it can be without a live push service; the call site belongs with the order
  pipeline, next to where a payment is captured.
- No per-device naming beyond the user agent string, and no list of enrolled
  devices in the admin. Worth adding once there is more than one phone.
