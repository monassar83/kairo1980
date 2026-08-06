/* Telling a phone that something happened.
   ---------------------------------------------------------------------------
   Web Push, straight from the Worker. No library and no service in between:
   a push is an HTTP POST to an endpoint the browser gave us, authorised by a
   short-lived JWT signed with our VAPID private key.

   The messages carry NO PAYLOAD, deliberately. An encrypted payload needs
   ECDH, HKDF and AES-GCM per subscription (RFC 8291) — a hundred lines of
   cryptography to save one fetch. Instead the push is a doorbell: the service
   worker wakes, asks this server what is new, and shows that. It is less code,
   there is nothing to get wrong, and — the part that actually matters — no
   customer's name or address ever passes through Google's push service.

   See docs/notifications.md. Nothing here runs without VAPID keys. */

const enc = new TextEncoder();

export function configured(env) {
  return !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT);
}

const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const fromB64url = (text) => {
  const padded = String(text).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded + '='.repeat((4 - padded.length % 4) % 4)),
    (c) => c.charCodeAt(0));
};

/* The VAPID JWT. ES256 over {aud, exp, sub}, where `aud` is the ORIGIN of the
   push endpoint — not the endpoint itself. Getting that wrong is a 401 from
   the push service with no explanation worth reading. */
async function authFor(env, endpoint) {
  const audience = new URL(endpoint).origin;
  const header = b64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64url(enc.encode(JSON.stringify({
    aud: audience,
    // Twelve hours. The spec allows 24; shorter costs nothing and a leaked
    // token is worth less for it.
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: env.VAPID_SUBJECT
  })));

  const key = await crypto.subtle.importKey(
    'pkcs8', fromB64url(env.VAPID_PRIVATE_KEY),
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']
  );
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${header}.${claims}`)
  );

  return `vapid t=${header}.${claims}.${b64url(signature)}, k=${env.VAPID_PUBLIC_KEY}`;
}

/**
 * Ring every registered device.
 * @returns {Promise<{sent:number, gone:number}>}
 */
export async function notifyAll(env, { urgency = 'high', ttl = 3600 } = {}) {
  if (!configured(env)) return { sent: 0, gone: 0 };

  const { results } = await env.DB.prepare(
    'SELECT endpoint FROM push_subscriptions'
  ).all();

  let sent = 0;
  let gone = 0;

  for (const row of (results || [])) {
    try {
      const response = await fetch(row.endpoint, {
        method: 'POST',
        headers: {
          Authorization: await authFor(env, row.endpoint),
          TTL: String(ttl),
          Urgency: urgency,
          // No body, so no Content-Encoding and nothing to encrypt.
          'Content-Length': '0'
        }
      });

      /* 404 and 410 are the push service saying this subscription no longer
         exists — the app was uninstalled, the browser data cleared. Deleting
         it here is the only cleanup there is; retrying it for ever is how a
         notification system becomes a wall of errors nobody reads. */
      if (response.status === 404 || response.status === 410) {
        await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?1')
          .bind(row.endpoint).run();
        gone += 1;
        continue;
      }

      if (response.ok) {
        sent += 1;
        await env.DB.prepare(
          "UPDATE push_subscriptions SET last_ok_at = datetime('now') WHERE endpoint = ?1"
        ).bind(row.endpoint).run();
      } else {
        console.error('push refused', response.status, new URL(row.endpoint).host);
      }
    } catch (err) {
      // One unreachable push service must not stop the others being told.
      console.error('push failed', err && err.message);
    }
  }

  return { sent, gone };
}

export async function subscribe(env, { endpoint, keys, label }) {
  if (!endpoint || !keys || !keys.p256dh || !keys.auth) return false;
  await env.DB.prepare(
    `INSERT INTO push_subscriptions (endpoint, p256dh, auth, label)
     VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh,
       auth = excluded.auth, label = excluded.label`
  ).bind(endpoint, keys.p256dh, keys.auth, label || null).run();
  return true;
}

export async function unsubscribe(env, endpoint) {
  await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?1')
    .bind(endpoint).run();
}
