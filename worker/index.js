/* The Worker.
   -------------------------------------------------------------------------
   kairo1980.de is a static site and stays one: everything that is not /api/
   falls straight through to the assets, byte for byte as before. The only
   reason a server exists at all is that three things cannot be done in a
   browser without lying to the guest — deciding what an order costs, telling
   a payment provider to take the money, and being told afterwards whether it
   worked.

   The rule that shapes every route below: the browser says what it WANTS, the
   server says what it COSTS. No amount, price, discount or fee is ever read
   from the request body. */

import { quote, PricingError, toAmount } from './pricing.js';
import { CONFIG } from './site-data.js';
import * as store from './payments/store.js';
import { providerFor, providerForMethod, availableMethods, publicKeys } from './payments/providers.js';
import { ProviderError } from './payments/errors.js';
import * as ordersPageView from './orders-page.js';

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff'
};

// A basket of 200 items with long ids is still comfortably under this.
const MAX_BODY = 16 * 1024;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (!url.pathname.startsWith('/api/')) {
      return withPolicy(url, await env.ASSETS.fetch(request));
    }

    try {
      return await route(request, env, ctx, url);
    } catch (err) {
      // Never let a provider's words reach the browser: they are for the log.
      console.error('api error', url.pathname, err && err.stack || err);
      if (err instanceof PricingError) return fail(400, err.code, err.message);
      if (err instanceof ProviderError) return fail(502, 'provider_unavailable', 'The payment provider could not be reached.');
      return fail(500, 'internal_error', 'Something went wrong.');
    }
  }
};

async function route(request, env, ctx, url) {
  const path = url.pathname;
  const method = request.method.toUpperCase();

  if (path === '/api/payments/config' && method === 'GET') return paymentConfig(env, url);
  if (path === '/api/payments/quote' && method === 'POST') return quoteOnly(request, env);
  if (path === '/api/payments' && method === 'POST') return createPayment(request, env, url);
  const hook = path.match(/^\/api\/webhooks\/(\w+)$/);
  if (hook && method === 'POST') return webhook(request, env, ctx, hook[1]);
  if (path === '/api/reports/settlement' && method === 'GET') return settlement(request, env, url);
  if (path === '/api/reports/orders' && method === 'GET') return ordersPage(request, env, url);

  const capture = path.match(/^\/api\/payments\/([\w-]{8,64})\/capture$/);
  if (capture && method === 'POST') return capturePayment(request, env, capture[1]);

  const handover = path.match(/^\/api\/payments\/([\w-]{8,64})\/handover$/);
  if (handover && method === 'POST') return markHandover(env, handover[1]);

  const cancel = path.match(/^\/api\/payments\/([\w-]{8,64})\/cancel$/);
  if (cancel && method === 'POST') return cancelPayment(env, cancel[1]);

  const show = path.match(/^\/api\/payments\/([\w-]{8,64})$/);
  if (show && method === 'GET') return showPayment(env, show[1]);

  return fail(404, 'not_found', 'No such endpoint.');
}

/* --- what the browser is allowed to know ---------------------------------
   The client id is public by design, but it is served from here rather than
   written into config.js so that it and the secret can never disagree about
   which PayPal environment they belong to. One place is configured; the page
   asks what it got. */

/* Sandbox credentials must never reach a real guest. They cannot take money,
   so a payment button backed by them is a button that fails after the guest
   has decided to buy — the worst possible place to lose an order.

   So online payment is withheld on the live domain until PAYPAL_ENV says
   'live'. Localhost and preview deployments still get the full checkout, which
   is where sandbox belongs. This is a safeguard, not a setting: it means the
   wrong thing cannot be shipped by forgetting a flag. */
function sandboxOnProduction(env, url) {
  const live = env.PAYPAL_ENV === 'live';
  const production = url.hostname === 'kairo1980.de' || url.hostname === 'www.kairo1980.de';
  return production && !live;
}

function paymentConfig(env, url) {
  const switchedOn = !!(CONFIG.payment && CONFIG.payment.prepayOnline) &&
    !sandboxOnProduction(env, url);
  const methods = switchedOn ? availableMethods(env) : [];

  return json({
    online: methods.length > 0,
    // Which provider carries which method, so the page knows which SDK to
    // fetch — and fetches only the ones it actually needs.
    methods,
    keys: methods.length ? publicKeys(env) : {},
    environment: env.PAYPAL_ENV === 'live' ? 'live' : 'sandbox',
    currency: 'EUR',
    onSite: (CONFIG.payment && CONFIG.payment.onSite) || {}
  });
}

/* --- pricing -------------------------------------------------------------
   The basket shows a total before anyone decides to pay. This lets the page
   confirm that total against the server, so a guest can never be shown one
   figure and charged another. */

async function quoteOnly(request, env) {
  const body = await readJson(request);
  const q = await quote(env, body);
  return json({
    subtotal: q.subtotal,
    discount: q.discount,
    discountPercent: q.discountPercent,
    fee: q.fee,
    total: q.total,
    currency: 'EUR',
    zone: q.zone ? { place: q.zone.place, fee: Math.round(q.zone.fee * 100), minimum: Math.round(q.zone.minimum * 100) } : null,
    belowMinimum: q.belowMinimum
  });
}

/* --- creating a payment -------------------------------------------------- */

async function createPayment(request, env, url) {
  if (!(CONFIG.payment && CONFIG.payment.prepayOnline)) {
    return fail(503, 'payments_off', 'Online payment is switched off.');
  }
  // Hiding the buttons is not enough: the route itself must refuse, or a
  // hand-made request could still start a payment nobody can complete.
  if (sandboxOnProduction(env, url)) {
    return fail(503, 'payments_off', 'Online payment is not available right now.');
  }

  const body = await readJson(request);
  // The method decides the provider. The browser names a method it was
  // offered; it never names a provider, and it never names a price.
  const provider = providerForMethod(env, body.method);
  if (!provider) return fail(503, 'payments_off', 'That payment method is not available.');

  const q = await quote(env, body);

  const id = crypto.randomUUID();
  const reference = store.newReference();

  const created = await provider.createOrder(env, {
    quote: q,
    paymentId: id,
    reference,
    currency: 'EUR',
    locale: localeFor(body.lang),
    orderType: body.type === 'pickup' ? 'pickup' : 'delivery',
    brandName: 'KAIRO 1980'
  });

  await store.create(env.DB, {
    id,
    reference,
    provider: provider.name,
    providerOrderId: created.providerOrderId,
    amount: q.total,
    currency: 'EUR',
    subtotal: q.subtotal,
    discount: q.discount,
    fee: q.fee,
    orderType: body.type === 'pickup' ? 'pickup' : 'delivery',
    business: !!body.business,
    postcode: body.postcode || null,
    lines: q.lines
  });

  return json({
    id,
    reference,
    provider: provider.name,
    providerOrderId: created.providerOrderId,
    // Stripe needs this in the browser to confirm the intent. It is scoped to
    // this one payment; the secret key never leaves the Worker.
    clientSecret: created.clientSecret || null,
    amount: q.total,
    amountText: toAmount(q.total),
    currency: 'EUR',
    // So the page can prove the figure it displayed is the figure being taken.
    breakdown: { subtotal: q.subtotal, discount: q.discount, fee: q.fee },
    belowMinimum: q.belowMinimum
  }, 201);
}

const LOCALES = { de: 'de-DE', en: 'en-GB', ar: 'ar-EG' };
function localeFor(lang) {
  return LOCALES[String(lang || '').slice(0, 2)] || 'de-DE';
}

/* --- capturing -----------------------------------------------------------
   Called by the browser the moment the guest approves. It is safe to call
   twice, safe to call after the webhook already did the work, and safe to
   call after a refresh: the status transition in the store decides who
   actually moves the payment, and everyone else is simply told where it got
   to. */

async function capturePayment(request, env, id) {
  const payment = await store.get(env.DB, id);
  if (!payment) return fail(404, 'unknown_payment', 'No such payment.');

  const provider = providerFor(payment.provider);
  if (!provider) return fail(500, 'unknown_provider', 'This payment cannot be processed.');

  // Already finished — by an earlier click, or by the webhook getting there
  // first. That is a success, not a conflict.
  if (store.isTerminal(payment.status)) {
    return json({ payment: store.publicView(payment), alreadyFinal: true });
  }

  let result;
  try {
    result = await provider.captureOrder(env, payment.provider_order_id, payment.id);
  } catch (err) {
    if (err instanceof ProviderError) {
      await store.settle(env.DB, id, 'failed', {
        failureCode: err.code,
        failureMessage: err.message,
        source: 'api',
        payload: err.raw
      });
      const after = await store.get(env.DB, id);
      return json({ payment: store.publicView(after), error: friendlyFailure(err.code) }, 402);
    }
    throw err;
  }

  const after = await applyCaptureResult(env, payment, result, 'api');
  return json({ payment: store.publicView(after) });
}

/** Turn a provider capture/read into a stored state. Shared by the browser
 *  path, the webhook path and the reconciliation path so all three can never
 *  interpret the same facts differently. */
async function applyCaptureResult(env, payment, result, source) {
  const common = {
    source,
    providerOrderId: result.providerOrderId,
    authorizationId: result.authorizationId,
    captureId: result.captureId,
    paymentSource: result.paymentSource,
    payerEmail: result.payerEmail,
    payerId: result.payerId,
    payload: { status: result.status, captureStatus: result.captureStatus }
  };

  /* The CAPTURE decides whether money moved. The order does not.

     A PayPal order reads COMPLETED as soon as the capture call succeeds, even
     when the capture inside it is PENDING with reason PENDING_REVIEW — PayPal
     is holding the funds for a risk review that can still end in a decline.
     Accepting either as proof told the kitchen "PAID ONLINE" for money that
     had not arrived, which is how a restaurant cooks for free.

     So PENDING is examined first and can never be overridden by the order. */
  if (result.captureStatus === 'PENDING') {
    await store.settle(env.DB, payment.id, 'pending', {
      ...common,
      failureCode: result.captureReason || 'PENDING_REVIEW'
    });
    return store.get(env.DB, payment.id);
  }

  // Order-level COMPLETED counts only when there is no capture to ask.
  if (result.captureStatus === 'COMPLETED' ||
      (!result.captureStatus && result.status === 'COMPLETED')) {
    // The one check that makes the money real: PayPal must have taken the
    // amount this server computed, not the amount anybody asked for.
    if (result.amount != null && result.amount !== payment.amount) {
      await store.settle(env.DB, payment.id, 'failed', {
        ...common,
        failureCode: 'amount_mismatch',
        failureMessage: `Captured ${result.amount} but owed ${payment.amount}`
      });
      console.error('amount mismatch', payment.id, result.amount, payment.amount);
      return store.get(env.DB, payment.id);
    }
    await store.settle(env.DB, payment.id, 'captured', common);
    return store.get(env.DB, payment.id);
  }

  if (result.captureStatus === 'DECLINED' || result.status === 'VOIDED') {
    await store.settle(env.DB, payment.id, result.status === 'VOIDED' ? 'cancelled' : 'failed', {
      ...common,
      failureCode: result.captureStatus || result.status
    });
    return store.get(env.DB, payment.id);
  }

  if (result.status === 'APPROVED') {
    await store.settle(env.DB, payment.id, 'approved', common);
    return store.get(env.DB, payment.id);
  }

  return store.get(env.DB, payment.id);
}

/* --- reading -------------------------------------------------------------
   This is what makes a refresh, a back button or a dead tab survivable: the
   page asks the server what happened, and if the server is not sure either —
   a payment left hanging with no webhook — it asks the provider before
   answering. An unknown state is never reported as failure. */

async function showPayment(env, id) {
  let payment = await store.get(env.DB, id);
  if (!payment) return fail(404, 'unknown_payment', 'No such payment.');

  if (!store.isTerminal(payment.status) && payment.provider_order_id) {
    const provider = providerFor(payment.provider);
    if (provider) {
      try {
        const remote = await provider.getOrder(env, payment.provider_order_id);
        payment = await applyCaptureResult(env, payment, remote, 'reconcile');
      } catch (err) {
        console.error('reconcile failed', id, err && err.message);
      }
    }
  }

  return json({ payment: store.publicView(payment) });
}

/** The guest closed the PayPal window. Nothing was taken; record it so an
 *  abandoned checkout is a fact in the log rather than a payment that hangs
 *  in 'created' for ever. */
async function cancelPayment(env, id) {
  const { payment } = await store.settle(env.DB, id, 'cancelled', {
    source: 'client',
    failureCode: 'cancelled_by_customer'
  });
  if (!payment) return fail(404, 'unknown_payment', 'No such payment.');
  return json({ payment: store.publicView(payment) });
}

/* --- did the order actually reach the kitchen? -------------------------
   Payment and order travel by different roads here: the money goes through
   the provider, the order goes through the guest's own WhatsApp. A guest who
   pays and then closes the tab has done nothing wrong and is owed food, but
   nothing would have told the restaurant it existed.

   So the page reports the handover, and the report below can name every
   captured payment that never got one. No name, no phone, no address — only
   the fact that a paid order has not been sent, its reference, and what was
   in it. That is enough to recognise the order when the guest rings up, and
   nothing more than the ledger already holds. */

async function markHandover(env, id) {
  const payment = await store.get(env.DB, id);
  if (!payment) return fail(404, 'unknown_payment', 'No such payment.');

  await store.logEvent(env.DB, {
    paymentId: payment.id,
    provider: payment.provider,
    // Unique, so a guest who taps the link three times records it once.
    eventKey: `handover:${payment.id}`,
    eventType: 'order.handed_over',
    source: 'client',
    statusFrom: payment.status,
    statusTo: payment.status,
    amount: payment.amount
  });

  return json({ ok: true });
}

/* --- webhooks ------------------------------------------------------------
   The source of truth. A browser can lie, crash or never come back; this
   arrives regardless, is signed, and is verified with PayPal before a single
   byte of it is believed. */

async function webhook(request, env, ctx, providerName) {
  const provider = providerFor(providerName);
  if (!provider) return fail(404, 'not_found', 'No such endpoint.');

  const raw = await request.text();
  if (raw.length > 128 * 1024) return fail(413, 'too_large', 'Event too large.');

  const { verified, reason, event } = await provider.verifyEvent(env, request, raw);
  if (!verified) {
    console.error('webhook rejected', providerName, reason);
    // 400, not 200: an unverified event must be retried or investigated, never
    // quietly accepted.
    return fail(400, 'unverified', 'Signature not verified.');
  }

  // The unique event key is the replay guard. PayPal retries for days; every
  // retry after the first does nothing at all.
  const fresh = await store.logEvent(env.DB, {
    paymentId: null,
    provider: providerName,
    eventKey: providerName + ':' + event.id,
    eventType: event.event_type,
    source: 'webhook',
    payload: event
  });
  if (!fresh) return json({ ok: true, duplicate: true });

  ctx.waitUntil(handleEvent(env, provider, event));
  // Acknowledge immediately. Work that fails is recoverable from the log and
  // from reconciliation; a slow 200 just makes PayPal retry a good event.
  return json({ ok: true });
}

async function handleEvent(env, provider, event) {
  try {
    const meaning = provider.meaningOf(event.event_type);
    if (!meaning) return;

    const ids = provider.identifyEvent(event);
    let payment = ids.paymentId ? await store.get(env.DB, ids.paymentId) : null;
    if (!payment && ids.providerOrderId) {
      payment = await store.getByProviderOrder(env.DB, provider.name, ids.providerOrderId);
    }
    if (!payment) {
      console.error('webhook for unknown payment', event.event_type, ids.paymentId, ids.providerOrderId);
      return;
    }

    // The guest approved but the browser never came back to capture — a lost
    // callback, a closed tab, a dead phone battery. Take the money here: the
    // guest agreed to pay and is expecting to have paid.
    if (meaning === 'approved' && payment.status === 'created') {
      await store.settle(env.DB, payment.id, 'approved', { source: 'webhook', payload: { event: event.id } });
      const result = await provider.captureOrder(env, payment.provider_order_id, payment.id);
      await applyCaptureResult(env, await store.get(env.DB, payment.id), result, 'webhook');
      return;
    }

    if (meaning === 'captured') {
      if (ids.amount != null && ids.amount !== payment.amount) {
        await store.settle(env.DB, payment.id, 'failed', {
          source: 'webhook',
          failureCode: 'amount_mismatch',
          failureMessage: `Captured ${ids.amount} but owed ${payment.amount}`,
          payload: { event: event.id }
        });
        return;
      }
      await store.settle(env.DB, payment.id, 'captured', {
        source: 'webhook',
        captureId: ids.captureId,
        eventKey: `${provider.name}:captured:${event.id}`,
        payload: { event: event.id }
      });
      return;
    }

    if (meaning === 'refunded') {
      const refunded = Math.min(payment.amount, (payment.refunded_amount || 0) + (ids.amount || payment.amount));
      await store.settle(env.DB, payment.id, refunded >= payment.amount ? 'refunded' : 'partially_refunded', {
        source: 'webhook',
        refundedAmount: refunded,
        eventKey: `${provider.name}:refund:${event.id}`,
        payload: { event: event.id }
      });
      return;
    }

    await store.settle(env.DB, payment.id, meaning, {
      source: 'webhook',
      failureCode: event.event_type,
      eventKey: `${provider.name}:${meaning}:${event.id}`,
      payload: { event: event.id }
    });
  } catch (err) {
    console.error('webhook handling failed', event && event.id, err && err.stack || err);
  }
}

/* --- the books -----------------------------------------------------------
   One authenticated endpoint, because the alternative is somebody retyping
   figures into a spreadsheet — which is how books stop matching reality. */

async function settlement(request, env, url) {
  if (!env.REPORT_TOKEN) return fail(503, 'reports_off', 'Reporting is not configured.');
  // The scheme is required, not stripped if present. Accepting a bare token
  // is not exploitable — you still need the token — but an endpoint that
  // takes credentials in more shapes than it documents is one nobody can
  // reason about later.
  const header = request.headers.get('authorization') || '';
  const match = header.match(/^Bearer (.+)$/);
  if (!match || !timingSafeEqual(match[1], env.REPORT_TOKEN)) {
    return fail(401, 'unauthorised', 'Not authorised.');
  }

  const from = (url.searchParams.get('from') || '0000-01-01').slice(0, 10);
  const to = (url.searchParams.get('to') || '9999-12-31').slice(0, 10);

  const { results } = await env.DB.prepare(
    `SELECT * FROM payments_settled WHERE day BETWEEN ?1 AND ?2 ORDER BY day DESC`
  ).bind(from, to).all();

  const totals = results.reduce((sum, row) => ({
    orders: sum.orders + row.orders,
    gross: sum.gross + row.gross,
    refunded: sum.refunded + row.refunded,
    net: sum.net + row.net
  }), { orders: 0, gross: 0, refunded: 0, net: 0 });

  // Paid, but never handed to the restaurant. A guest who paid and closed the
  // tab is owed food and would otherwise be invisible. Reference and contents
  // only — enough to recognise the order when they ring up, and no more than
  // the ledger already holds.
  const { results: orphans } = await env.DB.prepare(
    `SELECT p.reference, p.amount, p.order_type, p.captured_at, p.lines
       FROM payments p
      WHERE p.captured_at IS NOT NULL
        AND substr(p.captured_at, 1, 10) BETWEEN ?1 AND ?2
        AND NOT EXISTS (
          SELECT 1 FROM payment_events e
           WHERE e.payment_id = p.id AND e.event_type = 'order.handed_over')
      ORDER BY p.captured_at DESC`
  ).bind(from, to).all();

  return json({
    from, to, currency: 'EUR', days: results, totals,
    paidButNotSent: orphans.map((o) => ({
      reference: o.reference,
      amount: o.amount,
      orderType: o.order_type,
      capturedAt: o.captured_at,
      items: JSON.parse(o.lines || '[]').map((l) => l.qty + '× ' + l.name)
    }))
  });
}

/* The kitchen's own view. Internal only, noindex, basic auth so a phone can
   open it without a credential ending up in browser history. */
async function ordersPage(request, env, url) {
  if (!env.REPORT_TOKEN) return fail(503, 'reports_off', 'Reporting is not configured.');
  if (!ordersPageView.checkBasic(request, env.REPORT_TOKEN)) return ordersPageView.unauthorised();

  // Berlin, because that is the day the restaurant is working.
  const day = (url.searchParams.get('day') ||
    new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' })).slice(0, 10);

  /* captured_at is UTC; the working day is Berlin's. Comparing one against the
     other files a 23:00 order under tomorrow and hides it. The window is
     widened by a day either side in SQL and narrowed in JS, where the timezone
     is actually known — a day's orders is a handful of rows, and correctness
     across a DST boundary is worth more than the index. */
  const berlinDay = (iso) =>
    new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });

  const { results: window } = await env.DB.prepare(
    `SELECT p.reference, p.amount, p.order_type, p.captured_at, p.lines, p.status,
            EXISTS (SELECT 1 FROM payment_events e
                     WHERE e.payment_id = p.id AND e.event_type = 'order.handed_over') AS sent
       FROM payments p
      WHERE p.captured_at IS NOT NULL
        AND substr(p.captured_at, 1, 10) BETWEEN date(?1, '-1 day') AND date(?1, '+1 day')
      ORDER BY p.captured_at DESC`
  ).bind(day).all();

  const onDay = window.filter((o) => berlinDay(o.captured_at) === day);
  const orders = onDay;
  const orphans = onDay.filter((o) => !o.sent);

  const totals = orders.reduce((a, o) => ({
    orders: a.orders + 1, net: a.net + o.amount
  }), { orders: 0, net: 0 });

  // Orphans are listed separately above, so they are not repeated below.
  const flagged = new Set(orphans.map((o) => o.reference));
  const rest = orders.filter((o) => !flagged.has(o.reference));

  return new Response(ordersPageView.render({ day, orders: rest, orphans, totals }), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow'
    }
  });
}

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* --- content security policy ---------------------------------------------
   The policy lives here rather than in _headers because _headers cannot
   express it: a per-path rule does NOT override the `/*` rule, it loses to
   it, so the strict policy was being served on the ordering page too and the
   checkout SDK would have been blocked in production. Setting it on the way
   out is unambiguous.

   Only the ordering page is allowed to reach PayPal. impressum and
   datenschutz keep the untouched policy from _headers, and so does every
   script, font and image.

   script-src stays strict — no 'unsafe-inline', and the PayPal hosts are
   named rather than wildcarded. style-src gains 'unsafe-inline' because the
   SDK styles the elements it injects and a static file cannot carry a
   per-response nonce. CSS injection is a far smaller risk than script
   injection, and it is confined to this one URL. */

const CHECKOUT_CSP = [
  "default-src 'self'",
  // pay.google.com is the Google Pay sheet. Apple Pay needs no host at all:
  // Safari draws it natively, which is also why it cannot be tested in
  // Chrome or in CI.
  "script-src 'self' https://www.paypal.com https://www.paypalobjects.com https://www.sandbox.paypal.com https://pay.google.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://www.paypalobjects.com https://t.paypal.com https://www.gstatic.com",
  "font-src 'self'",
  "connect-src 'self' https://www.paypal.com https://www.sandbox.paypal.com https://api-m.paypal.com https://api-m.sandbox.paypal.com https://pay.google.com",
  "frame-src https://www.google.com https://www.paypal.com https://www.sandbox.paypal.com https://pay.google.com",
  "form-action 'self' https://www.paypal.com",
  "base-uri 'self'",
  "frame-ancestors 'self'",
  "object-src 'none'",
  'upgrade-insecure-requests'
].join('; ');

// Only '/'. Cloudflare redirects /index.html here, so this is the single URL
// that ever serves the ordering page.
function withPolicy(url, response) {
  if (url.pathname !== '/') return response;
  if (!(response.headers.get('content-type') || '').includes('text/html')) return response;

  const out = new Response(response.body, response);
  out.headers.set('Content-Security-Policy', CHECKOUT_CSP);
  return out;
}

/* --- plumbing ------------------------------------------------------------ */

async function readJson(request) {
  const type = request.headers.get('content-type') || '';
  if (!type.includes('application/json')) throw new PricingError('bad_request', 'Expected JSON.');
  const text = await request.text();
  if (text.length > MAX_BODY) throw new PricingError('too_large', 'Request too large.');
  try {
    const body = JSON.parse(text);
    if (!body || typeof body !== 'object') throw new Error('not an object');
    return body;
  } catch {
    throw new PricingError('bad_request', 'Malformed JSON.');
  }
}

// What the guest is told when a card is refused. Never the provider's wording:
// it is written for a developer, in English, and often says more about the
// payer's bank than they would want on a restaurant's screen.
function friendlyFailure(code) {
  switch (code) {
    case 'INSTRUMENT_DECLINED':
    case 'PAYER_ACTION_REQUIRED': return 'declined';
    case 'PAYER_CANNOT_PAY': return 'declined';
    case 'ORDER_NOT_APPROVED': return 'not_approved';
    default: return 'failed';
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function fail(status, code, message) {
  return new Response(JSON.stringify({ error: { code, message } }), { status, headers: JSON_HEADERS });
}
