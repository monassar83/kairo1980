/* Talking to a guest through the WhatsApp Cloud API.
   ---------------------------------------------------------------------------
   One rule decides everything about what may be sent:

     Inside 24 hours of the guest's last message we may write freely.
     Outside it, every message must be a template Meta has approved.

   So the two functions below are genuinely different operations, not one with
   a flag. `sendText` is a reply; `sendTemplate` is us starting a conversation,
   and it can only say a thing that was approved days earlier. Confusing the
   two produces a message Meta silently drops, which is the worst failure
   available here — the restaurant believes the guest was told.

   Nothing here runs unless WHATSAPP_ENABLED is set. See
   docs/whatsapp-cloud-api.md. */

const GRAPH = 'https://graph.facebook.com/v21.0';

export class WhatsAppError extends Error {
  constructor(code, message, raw) {
    super(message);
    this.code = code;
    this.raw = raw;
  }
}

function requireConfig(env) {
  if (env.WHATSAPP_ENABLED !== 'true') {
    throw new WhatsAppError('disabled', 'WhatsApp is switched off.');
  }
  if (!env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) {
    throw new WhatsAppError('unconfigured', 'WhatsApp credentials are not set.');
  }
}

async function post(env, payload) {
  requireConfig(env);

  const response = await fetch(`${GRAPH}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...payload })
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    // Meta's own wording is written for a developer and often names the
    // account rather than the problem. It goes to the log, never to a guest.
    const error = body.error || {};
    throw new WhatsAppError(
      error.code ? String(error.code) : String(response.status),
      error.message || 'WhatsApp refused the message.',
      body
    );
  }

  return { id: ((body.messages || [])[0] || {}).id || null };
}

/** E.164 without the '+', which is what the Graph API wants. A German mobile
 *  written as 0176… means +49 176…; written with a leading + it means what it
 *  says. Getting this wrong sends the message nowhere and reports success. */
export function toWaNumber(input, countryCode = '49') {
  const raw = String(input || '').trim();
  const digits = raw.replace(/[^\d+]/g, '');

  if (digits.startsWith('+')) return digits.slice(1);
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.startsWith('0')) return countryCode + digits.slice(1);
  return digits;
}

/** A free-form reply. Only legal inside the 24-hour window opened by the
 *  guest's own last message. */
export function sendText(env, to, body) {
  return post(env, {
    to: toWaNumber(to),
    type: 'text',
    text: { preview_url: false, body: String(body).slice(0, 4000) }
  });
}

/** A message we start. `name` must be an approved template on the account and
 *  `params` fill its {{1}}, {{2}}, … in order. */
export function sendTemplate(env, to, name, params = [], language = 'de') {
  return post(env, {
    to: toWaNumber(to),
    type: 'template',
    template: {
      name,
      language: { code: language },
      components: params.length
        ? [{ type: 'body', parameters: params.map((p) => ({ type: 'text', text: String(p) })) }]
        : []
    }
  });
}
