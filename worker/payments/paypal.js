/* PayPal, as a payment provider.

   This is the only file in the codebase that knows PayPal's vocabulary. Every
   other file talks about creating a payment, capturing it and being told about
   it later. Adding Stripe or SumUp means writing a second file with these five
   functions and naming it in providers.js — it does not mean touching the
   checkout.

   The provider contract:
     name                       string
     createOrder(env, ctx)      -> { providerOrderId, approveUrl? }
     captureOrder(env, id, key) -> { status, captureId, authorizationId, ... }
     getOrder(env, id)          -> { status, ... }
     refund(env, captureId, …)  -> { refundId, amount }
     verifyEvent(env, request)  -> { verified, event }

   Two rules hold everywhere here. Money is only ever the amount we computed
   ourselves — `ctx.quote`, never anything from the browser. And every mutating
   call carries PayPal-Request-Id, so a retried request after a timeout returns
   the original result instead of charging a second time. */

import { toAmount } from '../pricing.js';
import { ProviderError } from './errors.js';

const LIVE = 'https://api-m.paypal.com';
const SANDBOX = 'https://api-m.sandbox.paypal.com';

export const name = 'paypal';

function base(env) {
  return env.PAYPAL_ENV === 'live' ? LIVE : SANDBOX;
}

export function isConfigured(env) {
  return !!(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET);
}

/* --- access token --------------------------------------------------------
   Cached per isolate until shortly before it expires. PayPal tokens last
   ~9 hours; re-fetching one per request would add a round trip to every
   checkout for nothing. */
let token = { value: null, expires: 0 };

async function accessToken(env) {
  if (token.value && Date.now() < token.expires) return token.value;

  const credentials = btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`);
  const res = await fetch(`${base(env)}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });

  if (!res.ok) {
    token = { value: null, expires: 0 };
    throw new ProviderError('auth_failed', `PayPal rejected the credentials (${res.status})`, await safeText(res));
  }

  const data = await res.json();
  token = {
    value: data.access_token,
    // A minute of headroom so a token cannot expire mid-flight.
    expires: Date.now() + Math.max(0, (data.expires_in || 300) - 60) * 1000
  };
  return token.value;
}

async function call(env, method, path, { body, requestId, headers } = {}) {
  const res = await fetch(base(env) + path, {
    method,
    headers: {
      Authorization: `Bearer ${await accessToken(env)}`,
      'Content-Type': 'application/json',
      ...(requestId ? { 'PayPal-Request-Id': requestId } : {}),
      ...headers
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* keep the raw text */ }

  if (!res.ok) {
    const detail = data?.details?.[0] || {};
    throw new ProviderError(
      detail.issue || data?.name || 'provider_error',
      detail.description || data?.message || `PayPal returned ${res.status}`,
      data || text,
      res.status
    );
  }
  return data;
}

/* --- creating ------------------------------------------------------------ */

/**
 * @param {{quote: object, reference: string, paymentId: string, locale: string,
 *          brandName: string, currency: string}} ctx
 */
export async function createOrder(env, ctx) {
  const q = ctx.quote;
  const currency = ctx.currency || 'EUR';
  const value = (cents) => ({ currency_code: currency, value: toAmount(cents) });

  // PayPal checks this arithmetic itself and rejects the order if it does not
  // balance, which makes it a second opinion on our own totals:
  //   item_total - discount + shipping = amount
  const breakdown = { item_total: value(q.subtotal) };
  if (q.discount) breakdown.discount = value(q.discount);
  if (q.fee) breakdown.shipping = value(q.fee);

  const order = await call(env, 'POST', '/v2/checkout/orders', {
    // Our own payment id. A retry of this exact request returns the order
    // created the first time rather than a second one.
    requestId: ctx.paymentId,
    body: {
      intent: 'CAPTURE',
      purchase_units: [{
        // Both travel back on every webhook, which is how a provider event
        // finds its way to the right row and the right order.
        custom_id: ctx.paymentId,
        invoice_id: ctx.reference,
        description: `KAIRO 1980 · ${ctx.reference}`,
        amount: { ...value(q.total), breakdown },
        items: q.lines.map((line) => ({
          name: line.name.slice(0, 127),
          quantity: String(line.qty),
          unit_amount: value(line.unit),
          category: 'PHYSICAL_GOODS'
        }))
      }],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: ctx.brandName || 'KAIRO 1980',
            locale: ctx.locale || 'de-DE',
            // The food is collected or delivered; PayPal must not ask for a
            // shipping address it would only get wrong.
            shipping_preference: 'NO_SHIPPING',
            user_action: 'PAY_NOW',
            // Guest checkout for anyone without a PayPal account.
            landing_page: 'NO_PREFERENCE'
          }
        }
      }
    }
  });

  return {
    providerOrderId: order.id,
    status: order.status,
    approveUrl: (order.links || []).find((l) => l.rel === 'approve')?.href || null
  };
}

/* --- capturing ----------------------------------------------------------- */

export async function captureOrder(env, providerOrderId, requestId) {
  let order;
  try {
    order = await call(env, 'POST', `/v2/checkout/orders/${providerOrderId}/capture`, {
      requestId,
      body: {}
    });
  } catch (err) {
    // The guest already paid and something replayed the capture. PayPal is
    // right to refuse; read the truth back instead of treating it as failure.
    if (err.code === 'ORDER_ALREADY_CAPTURED' || err.code === 'DUPLICATE_INVOICE_ID') {
      return { ...(await getOrder(env, providerOrderId)), alreadyCaptured: true };
    }
    throw err;
  }
  return readOrder(order);
}

export async function getOrder(env, providerOrderId) {
  return readOrder(await call(env, 'GET', `/v2/checkout/orders/${providerOrderId}`));
}

/** PayPal's order shape, flattened to the handful of facts worth storing. */
function readOrder(order) {
  const unit = order.purchase_units?.[0] || {};
  const capture = unit.payments?.captures?.[0] || null;
  const authorization = unit.payments?.authorizations?.[0] || null;
  const source = order.payment_source || {};

  return {
    providerOrderId: order.id,
    status: order.status,                       // CREATED|APPROVED|COMPLETED|VOIDED|PAYER_ACTION_REQUIRED
    captureId: capture?.id || null,
    captureStatus: capture?.status || null,     // COMPLETED|PENDING|DECLINED
    authorizationId: authorization?.id || null,
    amount: capture ? Math.round(parseFloat(capture.amount.value) * 100) : null,
    currency: capture?.amount?.currency_code || null,
    paymentSource: Object.keys(source)[0] || null,  // paypal|card|apple_pay|google_pay
    payerEmail: order.payer?.email_address || null,
    payerId: order.payer?.payer_id || null,
    reference: unit.invoice_id || null,
    paymentId: unit.custom_id || null,
    raw: order
  };
}

/* --- refunds ------------------------------------------------------------- */

export async function refund(env, captureId, { amount, currency, requestId, note } = {}) {
  const body = {};
  if (amount != null) body.amount = { currency_code: currency || 'EUR', value: toAmount(amount) };
  if (note) body.note_to_payer = note.slice(0, 255);

  const result = await call(env, 'POST', `/v2/payments/captures/${captureId}/refund`, {
    requestId,
    body
  });

  return {
    refundId: result.id,
    status: result.status,
    amount: result.amount ? Math.round(parseFloat(result.amount.value) * 100) : amount,
    raw: result
  };
}

/* --- webhooks ------------------------------------------------------------
   A browser redirect says "the guest came back". Only this says "PayPal has
   the money". The signature is verified by PayPal itself against the webhook
   id we registered — an unverified event is discarded, never acted on. */

export async function verifyEvent(env, request, rawBody) {
  if (!env.PAYPAL_WEBHOOK_ID) {
    return { verified: false, reason: 'no_webhook_id', event: null };
  }

  const headers = {
    auth_algo: request.headers.get('paypal-auth-algo'),
    cert_url: request.headers.get('paypal-cert-url'),
    transmission_id: request.headers.get('paypal-transmission-id'),
    transmission_sig: request.headers.get('paypal-transmission-sig'),
    transmission_time: request.headers.get('paypal-transmission-time')
  };
  if (Object.values(headers).some((v) => !v)) {
    return { verified: false, reason: 'missing_headers', event: null };
  }

  // PayPal only accepts its own certificate host. Refusing anything else here
  // stops a forged cert_url from ever being fetched.
  if (!/^https:\/\/api(-m)?(\.sandbox)?\.paypal\.com\//.test(headers.cert_url)) {
    return { verified: false, reason: 'bad_cert_url', event: null };
  }

  let event;
  try { event = JSON.parse(rawBody); } catch {
    return { verified: false, reason: 'bad_json', event: null };
  }

  const result = await call(env, 'POST', '/v1/notifications/verify-webhook-signature', {
    body: { ...headers, webhook_id: env.PAYPAL_WEBHOOK_ID, webhook_event: event }
  });

  return {
    verified: result.verification_status === 'SUCCESS',
    reason: result.verification_status,
    event
  };
}

/** The event types worth acting on, mapped to what they mean for us. */
export function meaningOf(eventType) {
  switch (eventType) {
    case 'CHECKOUT.ORDER.APPROVED': return 'approved';
    case 'PAYMENT.CAPTURE.COMPLETED': return 'captured';
    case 'PAYMENT.CAPTURE.DENIED':
    case 'PAYMENT.CAPTURE.REVERSED': return 'failed';
    case 'CHECKOUT.ORDER.VOIDED': return 'cancelled';
    case 'PAYMENT.CAPTURE.REFUNDED': return 'refunded';
    default: return null;
  }
}

/** Pull our identifiers out of whatever resource the event carries. */
export function identifyEvent(event) {
  const resource = event?.resource || {};
  const unit = resource.purchase_units?.[0] || {};
  return {
    paymentId: resource.custom_id || unit.custom_id || null,
    reference: resource.invoice_id || unit.invoice_id || null,
    providerOrderId: resource.id && event.event_type?.startsWith('CHECKOUT.ORDER')
      ? resource.id
      : (resource.supplementary_data?.related_ids?.order_id || null),
    captureId: event.event_type?.startsWith('PAYMENT.CAPTURE') ? resource.id : null,
    amount: resource.amount ? Math.round(parseFloat(resource.amount.value) * 100) : null
  };
}

/* --- one-time setup -------------------------------------------------------
   Registering the webhook through the API rather than the dashboard means the
   id is created and stored without anyone copying it by hand. Idempotent: an
   endpoint already pointing at this URL is found and reused. */

export const WEBHOOK_EVENTS = [
  'CHECKOUT.ORDER.APPROVED',
  'PAYMENT.CAPTURE.COMPLETED',
  'PAYMENT.CAPTURE.DENIED',
  'PAYMENT.CAPTURE.REFUNDED',
  'PAYMENT.CAPTURE.REVERSED',
  'CHECKOUT.ORDER.VOIDED'
];

export async function registerWebhook(env, url) {
  const existing = await call(env, 'GET', '/v1/notifications/webhooks');
  const match = (existing.webhooks || []).find((hook) => hook.url === url);
  if (match) return { id: match.id, reused: true };

  const created = await call(env, 'POST', '/v1/notifications/webhooks', {
    body: { url, event_types: WEBHOOK_EVENTS.map((name) => ({ name })) }
  });
  return { id: created.id, reused: false };
}

async function safeText(res) {
  try { return await res.text(); } catch { return null; }
}
