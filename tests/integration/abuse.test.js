/* Someone trying to take money, break the books, or make the restaurant work
   for free.
   ---------------------------------------------------------------------------
   The other suites ask "does it work". This one asks "what can a hostile
   person do with it". Every test here is an attack that would cost the
   restaurant money, food, or its licence to take payments if it succeeded.

   Written after three real bugs shipped past a green suite: a fake more
   capable than the SDK, a message that only broke in transit, and a capture
   believed on the strength of the wrong field. The lesson taken is that tests
   which only assert the happy path assert almost nothing. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../../worker/index.js';
import {
  workerEnv, fakePayPal, orderResponse, webhookEvent, webhookHeaders
} from '../helpers/env.js';

const MENU = {
  hummus: { price: 950, name: 'Hummus' },
  koshari: { price: 1450, name: 'Koshari' }
};
const BASKET = { items: { koshari: 2 }, type: 'pickup', business: false, method: 'paypal' };
const TOTAL = 2610;

const ctx = () => {
  const p = [];
  return { waitUntil: (x) => p.push(x), settled: () => Promise.all(p) };
};

const post = (path, body, headers = {}) => new Request('https://kairo1980.de' + path, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...headers },
  body: typeof body === 'string' ? body : JSON.stringify(body)
});
const get = (path, headers = {}) => new Request('https://kairo1980.de' + path, { headers });

/* --- paying less than the food costs ------------------------------------- */

test('no field in the request can change the price', async (t) => {
  const env = workerEnv(MENU);
  let sentToPayPal = null;
  const paypal = fakePayPal({
    '/v2/checkout/orders': ({ body }) => { sentToPayPal = body; return orderResponse({}); }
  });
  t.after(() => paypal.restore());

  // Every shape a tamperer might try, in one basket.
  const tampered = {
    ...BASKET,
    amount: 1, total: 1, subtotal: 1, price: 1, value: 1,
    discount: 100000, discountPercent: 99, fee: -5000,
    currency: 'VND', lines: [{ id: 'koshari', qty: 2, unit: 1, amount: 2 }],
    quote: { total: 1 }, breakdown: { subtotal: 1 }
  };

  const res = await worker.fetch(post('/api/payments', tampered), env, ctx());
  const payment = await res.json();

  assert.equal(payment.amount, TOTAL, 'the server priced it, not the request');
  assert.equal(sentToPayPal.purchase_units[0].amount.value, '26.10');
  assert.equal(sentToPayPal.purchase_units[0].amount.currency_code, 'EUR', 'currency is ours to choose');
});

test('quantities cannot be negative, fractional, or a credit', async (t) => {
  const env = workerEnv(MENU);
  const paypal = fakePayPal({ '/v2/checkout/orders': () => orderResponse({}) });
  t.after(() => paypal.restore());

  // A negative line would subtract from the total if it were honoured.
  const res = await worker.fetch(post('/api/payments', {
    ...BASKET, items: { koshari: 2, hummus: -10 }
  }), env, ctx());
  const payment = await res.json();
  assert.equal(payment.amount, TOTAL, 'the negative line is ignored, not subtracted');

  for (const qty of [0.5, -1, 0, '2; DROP TABLE payments', Infinity, NaN, null]) {
    const r = await worker.fetch(post('/api/payments', { ...BASKET, items: { koshari: qty } }), env, ctx());
    assert.ok(r.status >= 400, `quantity ${String(qty)} must not create a payment`);
  }
});

test('a basket cannot be inflated into a denial of service', async (t) => {
  const env = workerEnv(MENU);
  const paypal = fakePayPal({ '/v2/checkout/orders': () => orderResponse({}) });
  t.after(() => paypal.restore());

  const huge = {};
  for (let i = 0; i < 5000; i++) huge['item-' + i] = 1;
  const res = await worker.fetch(post('/api/payments', { ...BASKET, items: huge }), env, ctx());
  assert.ok(res.status >= 400, 'refused before anything expensive happens');
});

/* --- interfering with somebody else's payment ---------------------------- */

test('a payment id is the only key, and it is not guessable', async (t) => {
  const env = workerEnv(MENU);
  const paypal = fakePayPal({ '/v2/checkout/orders': () => orderResponse({}) });
  t.after(() => paypal.restore());

  const a = await (await worker.fetch(post('/api/payments', BASKET), env, ctx())).json();
  const b = await (await worker.fetch(post('/api/payments', BASKET), env, ctx())).json();

  assert.notEqual(a.id, b.id);
  assert.match(a.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    'a v4 uuid, not a counter somebody can walk');
  assert.notEqual(a.reference, b.reference);
});

test('sequential and malformed ids find nothing', async (t) => {
  const env = workerEnv(MENU);
  const paypal = fakePayPal({});
  t.after(() => paypal.restore());

  for (const id of ['1', '00000000-0000-0000-0000-000000000001', '../../etc/passwd',
                    "' OR 1=1 --", '%2e%2e%2f', 'null', 'undefined']) {
    const res = await worker.fetch(get('/api/payments/' + encodeURIComponent(id)), env, ctx());
    assert.ok(res.status === 404 || res.status === 400, `${id} must not resolve`);
  }
});

test('what a payment discloses is only what its own payer needs', async (t) => {
  const env = workerEnv(MENU);
  const c = ctx();
  let payment;
  const paypal = fakePayPal({
    '/v2/checkout/orders': () => orderResponse({ id: 'PP-1' }),
    '/v2/checkout/orders/PP-1/capture': () => orderResponse({
      id: 'PP-1', status: 'COMPLETED', captureId: 'CAP-1', captureStatus: 'COMPLETED',
      amount: TOTAL, paymentId: payment.id, reference: payment.reference
    })
  });
  t.after(() => paypal.restore());

  payment = await (await worker.fetch(post('/api/payments', BASKET), env, c)).json();
  await worker.fetch(post(`/api/payments/${payment.id}/capture`), env, c);

  const body = await (await worker.fetch(get(`/api/payments/${payment.id}`), env, c)).json();
  const text = JSON.stringify(body);

  // The provider's account holder is nobody else's business.
  assert.ok(!text.includes('guest@example.com'), 'no payer email');
  assert.ok(!text.includes('PAYER1'), 'no payer id');
  assert.ok(!text.includes('CAP-1'), 'no capture id');
  assert.ok(!/hummus|koshari/i.test(text), 'no basket contents');
});

/* --- forged and replayed provider events --------------------------------- */

test('an unsigned webhook cannot settle a payment', async (t) => {
  const env = workerEnv(MENU);
  const c = ctx();
  const paypal = fakePayPal({
    '/v2/checkout/orders': () => orderResponse({ id: 'PP-1' }),
    '/v1/notifications/verify-webhook-signature': () => ({ verification_status: 'FAILURE' })
  });
  t.after(() => paypal.restore());

  const payment = await (await worker.fetch(post('/api/payments', BASKET), env, c)).json();

  // Exactly the event PayPal would send on success — but not signed by PayPal.
  const forged = webhookEvent({
    id: 'FORGED-1', paymentId: payment.id, reference: payment.reference,
    amount: TOTAL, orderId: 'PP-1'
  });
  const res = await worker.fetch(post('/api/webhooks/paypal', forged, webhookHeaders()), env, c);
  await c.settled();

  assert.equal(res.status, 400);
  const row = await env.DB.prepare('SELECT status FROM payments WHERE id = ?1').bind(payment.id).first();
  assert.equal(row.status, 'created', 'a forged event moves nothing');
});

test('the webhook cannot be verified against a certificate of the attacker\'s choosing', async (t) => {
  const env = workerEnv(MENU);
  const paypal = fakePayPal({ '/v1/notifications/verify-webhook-signature': () => ({ verification_status: 'SUCCESS' }) });
  t.after(() => paypal.restore());

  const headers = { ...webhookHeaders(), 'paypal-cert-url': 'https://evil.example.com/cert.pem' };
  const res = await worker.fetch(post('/api/webhooks/paypal', webhookEvent({}), headers), env, ctx());
  assert.equal(res.status, 400, 'only PayPal\'s own certificate host is acceptable');
});

test('a webhook cannot be used to overpay or underpay the books', async (t) => {
  const env = workerEnv(MENU);
  const c = ctx();
  const paypal = fakePayPal({
    '/v2/checkout/orders': () => orderResponse({ id: 'PP-1' }),
    '/v1/notifications/verify-webhook-signature': () => ({ verification_status: 'SUCCESS' })
  });
  t.after(() => paypal.restore());

  const payment = await (await worker.fetch(post('/api/payments', BASKET), env, c)).json();

  // A genuine, signed event — reporting an amount that is not what was owed.
  const wrong = webhookEvent({
    id: 'WH-WRONG', paymentId: payment.id, reference: payment.reference,
    amount: 1, orderId: 'PP-1'
  });
  await worker.fetch(post('/api/webhooks/paypal', wrong, webhookHeaders()), env, c);
  await c.settled();

  const row = await env.DB.prepare('SELECT status, failure_code FROM payments WHERE id = ?1')
    .bind(payment.id).first();
  assert.equal(row.status, 'failed');
  assert.equal(row.failure_code, 'amount_mismatch', 'never silently accepted');
});

/* --- the books ------------------------------------------------------------ */

test('the settlement report cannot be read without the token, or with a near miss', async (t) => {
  const env = workerEnv(MENU, { REPORT_TOKEN: 'correct-horse-battery-staple' });
  const paypal = fakePayPal({});
  t.after(() => paypal.restore());

  const attempts = [
    undefined,
    'Bearer ',
    'Bearer correct-horse-battery-stapl',    // one short
    'Bearer correct-horse-battery-staplex',  // one long
    'Bearer CORRECT-HORSE-BATTERY-STAPLE',   // case
    'correct-horse-battery-staple'           // no scheme
  ];
  for (const authorization of attempts) {
    const res = await worker.fetch(
      get('/api/reports/settlement', authorization ? { authorization } : {}), env, ctx());
    assert.equal(res.status, 401, `must reject: ${authorization}`);
  }

  const ok = await worker.fetch(get('/api/reports/settlement', {
    authorization: 'Bearer correct-horse-battery-staple'
  }), env, ctx());
  assert.equal(ok.status, 200);
});

test('money held for review is never counted as revenue', async (t) => {
  const env = workerEnv(MENU);
  const c = ctx();
  let payment;
  const paypal = fakePayPal({
    '/v2/checkout/orders': () => orderResponse({ id: 'PP-1' }),
    '/v2/checkout/orders/PP-1/capture': () => {
      const o = orderResponse({
        id: 'PP-1', status: 'COMPLETED', captureId: 'CAP-1', captureStatus: 'PENDING',
        amount: TOTAL, paymentId: payment.id, reference: payment.reference
      });
      o.purchase_units[0].payments.captures[0].status_details = { reason: 'PENDING_REVIEW' };
      return o;
    }
  });
  t.after(() => paypal.restore());

  payment = await (await worker.fetch(post('/api/payments', BASKET), env, c)).json();
  await worker.fetch(post(`/api/payments/${payment.id}/capture`), env, c);

  const settled = await env.DB.prepare('SELECT * FROM payments_settled').all();
  assert.equal(settled.results.length, 0);
});

/* --- the shape of the API itself ----------------------------------------- */

test('endpoints refuse the wrong method rather than doing something surprising', async (t) => {
  const env = workerEnv(MENU);
  const paypal = fakePayPal({});
  t.after(() => paypal.restore());

  const wrong = [
    ['GET', '/api/payments'],
    ['GET', '/api/webhooks/paypal'],
    ['POST', '/api/payments/config'],
    ['DELETE', '/api/payments'],
    ['PUT', '/api/reports/settlement']
  ];
  for (const [method, path] of wrong) {
    const res = await worker.fetch(new Request('https://kairo1980.de' + path, { method }), env, ctx());
    assert.equal(res.status, 404, `${method} ${path}`);
  }
});

test('an unknown provider name cannot be routed to', async (t) => {
  const env = workerEnv(MENU);
  const paypal = fakePayPal({});
  t.after(() => paypal.restore());

  for (const name of ['evil', 'paypal2', '../paypal', 'stripe']) {
    const res = await worker.fetch(post('/api/webhooks/' + name, {}, webhookHeaders()), env, ctx());
    assert.equal(res.status, 404, name);
  }
});

test('api responses are never cached, anywhere', async (t) => {
  const env = workerEnv(MENU);
  const paypal = fakePayPal({});
  t.after(() => paypal.restore());

  // A cached payment status is a guest being shown somebody else's order.
  for (const path of ['/api/payments/config', '/api/payments/nope-nope-nope']) {
    const res = await worker.fetch(get(path), env, ctx());
    assert.match(res.headers.get('cache-control') || '', /no-store/, path);
  }
});

test('an error never hands the provider\'s words to the browser', async (t) => {
  const env = workerEnv(MENU);
  const c = ctx();
  const paypal = fakePayPal({
    '/v2/checkout/orders': () => ({
      status: 500,
      body: { name: 'INTERNAL', message: 'merchant 4XYZ credential invalid', debug_id: 'abc123' }
    })
  });
  t.after(() => paypal.restore());

  const res = await worker.fetch(post('/api/payments', BASKET), env, c);
  const text = await res.text();

  assert.ok(!text.includes('debug_id'), 'no provider diagnostics');
  assert.ok(!text.includes('abc123'));
  assert.ok(!text.includes('credential'));
  assert.ok(!text.includes('merchant 4XYZ'));
});
