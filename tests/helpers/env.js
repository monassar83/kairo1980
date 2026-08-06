/* Test doubles for the two things the Worker gets from Cloudflare: the static
   assets it reads the menu out of, and the database.

   The menu stub emits the same markup index.html does, because that markup IS
   the price list — if the shape of a .mitem ever changes, these tests should
   fail alongside the site. */

import { freshDatabase } from './d1.js';

export function menuHtml(items) {
  return Object.entries(items).map(([id, item]) => `
    <div class="mitem" data-item="${id}" data-price="${(item.price / 100).toFixed(2)}">
      <div>
        <div class="mname t" data-de="${item.name}" data-en="${item.name}" data-ar="x">${item.name}</div>
      </div>
      <div class="mprice">x</div>
    </div>`).join('\n');
}

/** An env whose ASSETS binding serves a menu of exactly these dishes.
 *
 *  The page around the menu is not decoration. worker/page-render.js rewrites
 *  the opening hours into three places before a page is sent — the JSON-LD,
 *  the no-JavaScript table and a data island — and it finds them by markers.
 *  A stub without those markers would let every one of those rewrites quietly
 *  do nothing while the tests passed. The markers here are the same strings
 *  index.html carries, and `the published pages still carry the markers…` in
 *  abuse.test.js is what keeps the two from drifting apart. */
export function menuStub(items) {
  const html = `<!doctype html><html lang="de"><head>
<title>Test</title>
<script id="restaurantSchema" type="application/ld+json">
${JSON.stringify({
    '@context': 'https://schema.org', '@type': 'Restaurant', name: 'KAIRO 1980',
    openingHoursSpecification: [{
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Wednesday'], opens: '18:00', closes: '23:00'
    }]
  })}
</script>
</head><body>
<div id="hoursTable"><!--hours:start--><div class="hrow">placeholder</div><!--hours:end--></div>
${menuHtml(items)}
</body></html>`;

  return {
    ASSETS: {
      fetch: async () => new Response(html, {
        status: 200,
        headers: { 'Content-Type': 'text/html', ETag: '"stub-1"' }
      })
    }
  };
}

/** A full Worker env: assets, a migrated database and PayPal credentials. */
export function workerEnv(items, overrides = {}) {
  return {
    ...menuStub(items),
    DB: freshDatabase(),
    PAYPAL_CLIENT_ID: 'test-client-id',
    PAYPAL_CLIENT_SECRET: 'test-secret',
    PAYPAL_WEBHOOK_ID: 'test-webhook-id',
    // 'live' by default so tests exercise the real code path against the
    // production hostname they use. The one test that cares about sandbox
    // sets it explicitly — see the sandbox guard in worker/index.js.
    PAYPAL_ENV: 'live',
    ...overrides
  };
}

/* --- standing in for PayPal ---------------------------------------------
   Every outbound call the provider makes goes through globalThis.fetch, so
   replacing it is enough to drive PayPal through any sequence a test wants —
   including the ones that are hard to produce on purpose against the real
   sandbox: a decline, a timeout, a replayed capture. */

export function fakePayPal(handlers = {}) {
  const calls = [];
  const original = globalThis.fetch;

  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    const path = new URL(url).pathname;
    // The token request is form-encoded; everything else is JSON.
    let body = null;
    try { body = init.body ? JSON.parse(init.body) : null; } catch { body = init.body; }
    calls.push({ path, method: init.method || 'GET', body, headers: init.headers || {} });

    if (path.endsWith('/v1/oauth2/token')) {
      return json({ access_token: 'test-token', expires_in: 3600 });
    }

    const handler = handlers[path] || matchPattern(handlers, path);
    if (!handler) return json({ name: 'RESOURCE_NOT_FOUND' }, 404);

    const result = await handler({ path, body, calls, headers: init.headers || {} });
    if (result instanceof Response) return result;
    // PayPal payloads carry their own `status` ("CREATED", "COMPLETED"), so an
    // HTTP status is only recognised as the explicit envelope { status, body }.
    const envelope = result && typeof result.status === 'number' && 'body' in result;
    return envelope ? json(result.body, result.status) : json(result, 200);
  };

  return {
    calls,
    restore() { globalThis.fetch = original; }
  };
}

function matchPattern(handlers, path) {
  for (const [pattern, handler] of Object.entries(handlers)) {
    if (!pattern.includes('*')) continue;
    const re = new RegExp('^' + pattern.split('*').map(escape).join('[^/]+') + '$');
    if (re.test(path)) return handler;
  }
  return null;
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

/* --- PayPal's own shapes, so tests read like the API docs ----------------- */

export function orderResponse({ id = 'PP-ORDER-1', status = 'CREATED', captureId = null,
  captureStatus = null, amount = null, currency = 'EUR', paymentId = null,
  reference = null, source = 'paypal' } = {}) {
  const unit = {
    custom_id: paymentId,
    invoice_id: reference,
    payments: {}
  };
  if (captureId) {
    unit.payments.captures = [{
      id: captureId,
      status: captureStatus || 'COMPLETED',
      amount: { value: (amount / 100).toFixed(2), currency_code: currency }
    }];
  }
  return {
    id,
    status,
    purchase_units: [unit],
    payment_source: { [source]: {} },
    payer: { email_address: 'guest@example.com', payer_id: 'PAYER1' },
    links: [{ rel: 'approve', href: 'https://www.sandbox.paypal.com/checkoutnow?token=' + id }]
  };
}

export function webhookEvent({ id = 'WH-1', type = 'PAYMENT.CAPTURE.COMPLETED',
  paymentId = null, reference = null, amount = null, orderId = null, captureId = 'CAP-1' } = {}) {
  return {
    id,
    event_type: type,
    resource: type.startsWith('CHECKOUT.ORDER')
      ? { id: orderId, purchase_units: [{ custom_id: paymentId, invoice_id: reference }] }
      : {
          id: captureId,
          custom_id: paymentId,
          invoice_id: reference,
          amount: amount != null ? { value: (amount / 100).toFixed(2), currency_code: 'EUR' } : undefined,
          supplementary_data: { related_ids: { order_id: orderId } }
        }
  };
}

export function webhookHeaders() {
  return {
    'paypal-auth-algo': 'SHA256withRSA',
    'paypal-cert-url': 'https://api-m.sandbox.paypal.com/cert.pem',
    'paypal-transmission-id': 'TX-1',
    'paypal-transmission-sig': 'sig',
    'paypal-transmission-time': new Date().toISOString(),
    'content-type': 'application/json'
  };
}
