/* Meta's side of the conversation.
   ---------------------------------------------------------------------------
   Two things arrive at `/api/webhooks/whatsapp`:

     GET   Meta's subscription handshake. It carries a token we chose and a
           challenge it wants echoed back. Answered once, when the webhook is
           first pointed at us and again whenever Meta re-verifies.

     POST  Every event on the account — a guest's message, a delivery receipt,
           a read receipt. Signed with the app secret, and believed only after
           that signature has been checked.

   The rule this file exists to enforce is the same one the PayPal webhook
   lives by: **an unverified event is not an event.** A public URL that acts on
   whatever is posted to it is a public URL anybody can drive. Meta signs with
   HMAC-SHA256 over the exact bytes of the body, so the raw text is what gets
   verified — never a re-serialised object, which would differ by a space and
   fail for the wrong reason.

   Nothing here runs until WHATSAPP_ENABLED is set. See
   docs/whatsapp-cloud-api.md for what has to exist on Meta's side first. */

const enc = new TextEncoder();

/* The app secret is part of being configured, not an extra. Without it every
   event fails verification, and an endpoint that refuses everything while
   reporting itself enabled is one somebody will spend an afternoon debugging
   from the Meta end. Say "not configured" and mean it. */
export function enabled(env) {
  return env.WHATSAPP_ENABLED === 'true' &&
    !!env.WHATSAPP_TOKEN && !!env.WHATSAPP_PHONE_NUMBER_ID && !!env.WHATSAPP_APP_SECRET;
}

/* --- the subscription handshake ------------------------------------------
   Meta sends ?hub.mode=subscribe&hub.verify_token=…&hub.challenge=…
   and expects the challenge back as plain text, with no quotes and nothing
   else. Anything other than an exact match is a 403: echoing the challenge to
   a wrong token would let anybody point their own app at this endpoint. */

export function verifySubscription(env, url) {
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge') || '';

  if (!env.WHATSAPP_VERIFY_TOKEN) return text(503, 'Not configured.');
  if (mode !== 'subscribe' || !sameText(token, env.WHATSAPP_VERIFY_TOKEN)) {
    return text(403, 'Forbidden.');
  }
  return text(200, challenge);
}

/* --- the signature --------------------------------------------------------
   `X-Hub-Signature-256: sha256=<hex>` over the raw body, keyed with the app
   secret. Compared byte by byte in constant time — a comparison that returns
   early tells an attacker how much of a forged signature was right, which is
   enough to find the rest one byte at a time. */

export async function signatureValid(env, header, rawBody) {
  if (!env.WHATSAPP_APP_SECRET) return false;

  const offered = String(header || '');
  if (!offered.startsWith('sha256=')) return false;

  const key = await crypto.subtle.importKey(
    'raw', enc.encode(env.WHATSAPP_APP_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody));
  const expected = 'sha256=' + [...new Uint8Array(mac)]
    .map((b) => b.toString(16).padStart(2, '0')).join('');

  return sameText(offered, expected);
}

function sameText(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* --- reading an event -----------------------------------------------------
   Meta's envelope is deeply nested and every level is optional. Pulled apart
   into the two or three facts worth having rather than passed around whole:
   a shape this baroque, threaded through the code, is a shape every reader
   afterwards has to learn. */

export function readEvent(body) {
  const out = { messages: [], statuses: [] };
  const entries = Array.isArray(body && body.entry) ? body.entry : [];

  for (const entry of entries) {
    for (const change of (entry.changes || [])) {
      const value = change.value || {};
      // Who wrote, and what they wrote. Text only for now: an order arriving
      // as an image is a conversation for a person, not for this.
      for (const message of (value.messages || [])) {
        out.messages.push({
          id: message.id,
          from: message.from,                       // E.164, no '+'
          type: message.type,
          text: (message.text && message.text.body) || '',
          at: Number(message.timestamp) * 1000 || Date.now()
        });
      }
      // What happened to something WE sent.
      for (const status of (value.statuses || [])) {
        out.statuses.push({
          id: status.id,
          status: status.status,                    // sent|delivered|read|failed
          recipient: status.recipient_id,
          at: Number(status.timestamp) * 1000 || Date.now()
        });
      }
    }
  }
  return out;
}

/** The id Meta assigns an event, used as the replay guard. Meta retries for
 *  days; every retry after the first must do nothing at all. */
export function eventKey(body) {
  const entry = (body && body.entry && body.entry[0]) || {};
  const value = ((entry.changes || [])[0] || {}).value || {};
  const first = (value.messages || [])[0] || (value.statuses || [])[0] || {};
  return first.id ? `whatsapp:${first.id}` : null;
}

function text(status, body) {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}
