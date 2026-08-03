/* The whole Worker, end to end: real routes, real SQL, real state machine,
   with PayPal replaced so the awkward cases can actually be produced —
   a decline, a replayed webhook, a callback that never arrives.

   Each test is a thing that can happen to a guest on a Friday night. */

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

// Two Koshari, collected: 29.00 less the 10 % direct discount = 26.10.
const BASKET = { items: { koshari: 2 }, type: 'pickup', business: false, method: 'paypal' };
const BASKET_TOTAL = 2610;

function ctx() {
  const promises = [];
  return {
    waitUntil: (p) => promises.push(p),
    settled: () => Promise.all(promises)
  };
}

function post(path, body, headers = {}) {
  return new Request('https://kairo1980.de' + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  });
}

const get = (path, headers = {}) =>
  new Request('https://kairo1980.de' + path, { headers });

/** Create a payment through the real route and return the JSON. */
async function createPayment(env, c, body = BASKET, orderId = 'PP-ORDER-1') {
  const res = await worker.fetch(post('/api/payments', body), env, c);
  assert.equal(res.status, 201, await res.clone().text());
  return res.json();
}

const captureOk = (paymentId, reference, amount = BASKET_TOTAL, orderId = 'PP-ORDER-1') =>
  orderResponse({
    id: orderId, status: 'COMPLETED', captureId: 'CAP-1', captureStatus: 'COMPLETED',
    amount, paymentId, reference
  });

test('a guest pays and the order is recorded as paid for the exact amount', async (t) => {
  const env = workerEnv(MENU);
  const c = ctx();
  let created = null;

  const paypal = fakePayPal({
    '/v2/checkout/orders': ({ body }) => {
      created = body;
      return orderResponse({ id: 'PP-ORDER-1' });
    },
    '/v2/checkout/orders/PP-ORDER-1/capture': () =>
      captureOk(payment.id, payment.reference)
  });
  t.after(() => paypal.restore());

  var payment = await createPayment(env, c);

  // The server priced it, and that is what PayPal was told.
  assert.equal(payment.amount, BASKET_TOTAL);
  assert.equal(created.purchase_units[0].amount.value, '26.10');
  assert.equal(created.purchase_units[0].amount.breakdown.item_total.value, '29.00');
  assert.equal(created.purchase_units[0].amount.breakdown.discount.value, '2.90');
  assert.equal(created.intent, 'CAPTURE');
  // Our identifiers travel with it, so any later event finds its way home.
  assert.equal(created.purchase_units[0].custom_id, payment.id);
  assert.equal(created.purchase_units[0].invoice_id, payment.reference);

  const res = await worker.fetch(post(`/api/payments/${payment.id}/capture`), env, c);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.payment.status, 'captured');
  assert.equal(body.payment.amount, BASKET_TOTAL);
});

test('the amount is never taken from the browser', async (t) => {
  const env = workerEnv(MENU);
  const c = ctx();
  let created = null;
  const paypal = fakePayPal({
    '/v2/checkout/orders': ({ body }) => { created = body; return orderResponse({}); }
  });
  t.after(() => paypal.restore());

  // A tampered client claims the order costs one cent.
  const payment = await createPayment(env, c, {
    ...BASKET, amount: 1, total: 1, subtotal: 1, discount: 9999
  });

  assert.equal(payment.amount, BASKET_TOTAL);
  assert.equal(created.purchase_units[0].amount.value, '26.10');
});

test('a price that is not on the menu cannot be invented', async (t) => {
  const env = workerEnv(MENU);
  const paypal = fakePayPal({});
  t.after(() => paypal.restore());

  const res = await worker.fetch(post('/api/payments', { items: { caviar: 1 }, type: 'pickup', method: 'paypal' }), env, ctx());
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.code, 'unknown_item');
  // PayPal was never contacted for an order that could not be priced.
  assert.equal(paypal.calls.filter((call) => call.path.includes('/checkout/orders')).length, 0);
});

test('double-clicking pay captures once and charges once', async (t) => {
  const env = workerEnv(MENU);
  const c = ctx();
  let captures = 0;
  let payment;

  const paypal = fakePayPal({
    '/v2/checkout/orders': () => orderResponse({ id: 'PP-ORDER-1' }),
    '/v2/checkout/orders/PP-ORDER-1/capture': () => {
      captures++;
      return captureOk(payment.id, payment.reference);
    }
  });
  t.after(() => paypal.restore());

  payment = await createPayment(env, c);

  const [a, b] = await Promise.all([
    worker.fetch(post(`/api/payments/${payment.id}/capture`), env, c),
    worker.fetch(post(`/api/payments/${payment.id}/capture`), env, c)
  ]);

  const bodies = [await a.json(), await b.json()];
  assert.ok(bodies.every((x) => x.payment.status === 'captured'));

  // Whatever the race did, the payment is captured exactly once in our books.
  const row = await env.DB.prepare('SELECT * FROM payments WHERE id = ?1').bind(payment.id).first();
  assert.equal(row.status, 'captured');
  const events = await env.DB.prepare(
    "SELECT * FROM payment_events WHERE payment_id = ?1 AND status_to = 'captured'"
  ).bind(payment.id).all();
  assert.equal(events.results.length, 1, 'exactly one capture may be recorded');
});

test('a capture replayed after PayPal already took the money is not a failure', async (t) => {
  const env = workerEnv(MENU);
  const c = ctx();
  let payment;

  const paypal = fakePayPal({
    '/v2/checkout/orders': () => orderResponse({ id: 'PP-ORDER-1' }),
    '/v2/checkout/orders/PP-ORDER-1/capture': () => ({
      status: 422,
      body: { name: 'UNPROCESSABLE_ENTITY', details: [{ issue: 'ORDER_ALREADY_CAPTURED' }] }
    }),
    '/v2/checkout/orders/PP-ORDER-1': () => captureOk(payment.id, payment.reference)
  });
  t.after(() => paypal.restore());

  payment = await createPayment(env, c);
  const res = await worker.fetch(post(`/api/payments/${payment.id}/capture`), env, c);
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.payment.status, 'captured', 'the guest paid; say so');
});

test('a declined card fails cleanly and says nothing was charged', async (t) => {
  const env = workerEnv(MENU);
  const c = ctx();

  const paypal = fakePayPal({
    '/v2/checkout/orders': () => orderResponse({ id: 'PP-ORDER-1' }),
    '/v2/checkout/orders/PP-ORDER-1/capture': () => ({
      status: 422,
      body: { name: 'UNPROCESSABLE_ENTITY', details: [{ issue: 'INSTRUMENT_DECLINED' }] }
    })
  });
  t.after(() => paypal.restore());

  const payment = await createPayment(env, c);
  const res = await worker.fetch(post(`/api/payments/${payment.id}/capture`), env, c);
  const body = await res.json();

  assert.equal(res.status, 402);
  assert.equal(body.payment.status, 'failed');
  assert.equal(body.error, 'declined');

  const row = await env.DB.prepare('SELECT * FROM payments WHERE id = ?1').bind(payment.id).first();
  assert.equal(row.failure_code, 'INSTRUMENT_DECLINED');
});

test('a capture PayPal is holding for review is not reported as paid', async (t) => {
  // This happened with real money. A PayPal ORDER reads COMPLETED as soon as
  // the capture call succeeds, even when the capture inside it is PENDING with
  // reason PENDING_REVIEW and PayPal is still holding the funds. Believing the
  // order told the kitchen "PAID ONLINE" for money that had not arrived.
  const env = workerEnv(MENU);
  const c = ctx();
  let payment;

  const paypal = fakePayPal({
    '/v2/checkout/orders': () => orderResponse({ id: 'PP-ORDER-1' }),
    '/v2/checkout/orders/PP-ORDER-1/capture': () => {
      const order = orderResponse({
        id: 'PP-ORDER-1', status: 'COMPLETED', captureId: 'CAP-1',
        captureStatus: 'PENDING', amount: BASKET_TOTAL,
        paymentId: payment.id, reference: payment.reference
      });
      order.purchase_units[0].payments.captures[0].status_details = { reason: 'PENDING_REVIEW' };
      return order;
    }
  });
  t.after(() => paypal.restore());

  payment = await createPayment(env, c);
  const res = await worker.fetch(post(`/api/payments/${payment.id}/capture`), env, c);
  const body = await res.json();

  assert.equal(body.payment.status, 'pending', 'the order says COMPLETED; the capture does not');
  assert.notEqual(body.payment.status, 'captured');

  const row = await env.DB.prepare('SELECT * FROM payments WHERE id = ?1').bind(payment.id).first();
  assert.equal(row.status, 'pending');
  assert.equal(row.captured_at, null, 'nothing was captured, so nothing is stamped');
  assert.equal(row.failure_code, 'PENDING_REVIEW', 'why it is held is worth keeping');

  // And it must not appear in the money actually taken.
  const settled = await env.DB.prepare('SELECT * FROM payments_settled').all();
  assert.equal(settled.results.length, 0, 'a held payment is not revenue');
});

test('a review that clears later settles the payment', async (t) => {
  const env = workerEnv(MENU);
  const c = ctx();
  let payment;

  const paypal = fakePayPal({
    '/v2/checkout/orders': () => orderResponse({ id: 'PP-ORDER-1' }),
    '/v1/notifications/verify-webhook-signature': () => ({ verification_status: 'SUCCESS' })
  });
  t.after(() => paypal.restore());

  payment = await createPayment(env, c);
  await store_settle_pending(env, payment.id);

  const event = webhookEvent({
    id: 'WH-CLEARED', paymentId: payment.id, reference: payment.reference,
    amount: BASKET_TOTAL, orderId: 'PP-ORDER-1'
  });
  await worker.fetch(post('/api/webhooks/paypal', event, webhookHeaders()), env, c);
  await c.settled();

  const row = await env.DB.prepare('SELECT * FROM payments WHERE id = ?1').bind(payment.id).first();
  assert.equal(row.status, 'captured', 'PayPal released it; the books follow');
});

async function store_settle_pending(env, id) {
  const store = await import('../../worker/payments/store.js');
  await store.settle(env.DB, id, 'pending', { failureCode: 'PENDING_REVIEW' });
}

test('a payment for the wrong amount is refused even if PayPal accepted it', async (t) => {
  const env = workerEnv(MENU);
  const c = ctx();
  let payment;

  const paypal = fakePayPal({
    '/v2/checkout/orders': () => orderResponse({ id: 'PP-ORDER-1' }),
    // PayPal reports a capture of 1.00 against a 26.10 order.
    '/v2/checkout/orders/PP-ORDER-1/capture': () =>
      captureOk(payment.id, payment.reference, 100)
  });
  t.after(() => paypal.restore());

  payment = await createPayment(env, c);
  const res = await worker.fetch(post(`/api/payments/${payment.id}/capture`), env, c);
  const body = await res.json();

  assert.equal(body.payment.status, 'failed');
  const row = await env.DB.prepare('SELECT * FROM payments WHERE id = ?1').bind(payment.id).first();
  assert.equal(row.failure_code, 'amount_mismatch');
});

test('a guest who closes the PayPal window leaves a cancelled payment, not a stuck one', async (t) => {
  const env = workerEnv(MENU);
  const c = ctx();
  const paypal = fakePayPal({ '/v2/checkout/orders': () => orderResponse({}) });
  t.after(() => paypal.restore());

  const payment = await createPayment(env, c);
  const res = await worker.fetch(post(`/api/payments/${payment.id}/cancel`), env, c);
  assert.equal((await res.json()).payment.status, 'cancelled');
});

/* --- webhooks ------------------------------------------------------------ */

const verified = () => ({ verification_status: 'SUCCESS' });

test('a verified capture webhook settles the payment', async (t) => {
  const env = workerEnv(MENU);
  const c = ctx();
  let payment;

  const paypal = fakePayPal({
    '/v2/checkout/orders': () => orderResponse({ id: 'PP-ORDER-1' }),
    '/v1/notifications/verify-webhook-signature': verified
  });
  t.after(() => paypal.restore());

  payment = await createPayment(env, c);

  const event = webhookEvent({
    id: 'WH-1', paymentId: payment.id, reference: payment.reference,
    amount: BASKET_TOTAL, orderId: 'PP-ORDER-1'
  });
  const res = await worker.fetch(post('/api/webhooks/paypal', event, webhookHeaders()), env, c);
  await c.settled();

  assert.equal(res.status, 200);
  const row = await env.DB.prepare('SELECT * FROM payments WHERE id = ?1').bind(payment.id).first();
  assert.equal(row.status, 'captured');
});

test('the same webhook delivered five times is acted on once', async (t) => {
  const env = workerEnv(MENU);
  const c = ctx();
  let payment;

  const paypal = fakePayPal({
    '/v2/checkout/orders': () => orderResponse({ id: 'PP-ORDER-1' }),
    '/v1/notifications/verify-webhook-signature': verified
  });
  t.after(() => paypal.restore());

  payment = await createPayment(env, c);
  const event = webhookEvent({
    id: 'WH-REPLAY', paymentId: payment.id, reference: payment.reference,
    amount: BASKET_TOTAL, orderId: 'PP-ORDER-1'
  });

  const responses = [];
  for (let i = 0; i < 5; i++) {
    responses.push(await worker.fetch(post('/api/webhooks/paypal', event, webhookHeaders()), env, c));
  }
  await c.settled();

  const bodies = await Promise.all(responses.map((r) => r.json()));
  assert.equal(bodies.filter((b) => b.duplicate).length, 4, 'four of five are duplicates');

  const events = await env.DB.prepare(
    "SELECT * FROM payment_events WHERE event_key = 'paypal:WH-REPLAY'"
  ).all();
  assert.equal(events.results.length, 1);
});

test('an unverified webhook is refused and changes nothing', async (t) => {
  const env = workerEnv(MENU);
  const c = ctx();
  let payment;

  const paypal = fakePayPal({
    '/v2/checkout/orders': () => orderResponse({ id: 'PP-ORDER-1' }),
    '/v1/notifications/verify-webhook-signature': () => ({ verification_status: 'FAILURE' })
  });
  t.after(() => paypal.restore());

  payment = await createPayment(env, c);
  const event = webhookEvent({
    id: 'WH-FORGED', paymentId: payment.id, amount: BASKET_TOTAL, orderId: 'PP-ORDER-1'
  });

  const res = await worker.fetch(post('/api/webhooks/paypal', event, webhookHeaders()), env, c);
  await c.settled();

  assert.equal(res.status, 400);
  const row = await env.DB.prepare('SELECT * FROM payments WHERE id = ?1').bind(payment.id).first();
  assert.equal(row.status, 'created', 'a forged event must not move a payment');
});

test('a webhook with no signature headers is refused', async (t) => {
  const env = workerEnv(MENU);
  const paypal = fakePayPal({ '/v1/notifications/verify-webhook-signature': verified });
  t.after(() => paypal.restore());

  const res = await worker.fetch(
    post('/api/webhooks/paypal', webhookEvent({}), { 'content-type': 'application/json' }),
    env, ctx()
  );
  assert.equal(res.status, 400);
});

test('the guest approved but never came back: the money is still taken', async (t) => {
  const env = workerEnv(MENU);
  const c = ctx();
  let payment;
  let captured = false;

  const paypal = fakePayPal({
    '/v2/checkout/orders': () => orderResponse({ id: 'PP-ORDER-1' }),
    '/v1/notifications/verify-webhook-signature': verified,
    '/v2/checkout/orders/PP-ORDER-1/capture': () => {
      captured = true;
      return captureOk(payment.id, payment.reference);
    }
  });
  t.after(() => paypal.restore());

  payment = await createPayment(env, c);

  // The browser never calls capture. Only this arrives.
  const event = webhookEvent({
    id: 'WH-APPROVED', type: 'CHECKOUT.ORDER.APPROVED',
    paymentId: payment.id, reference: payment.reference, orderId: 'PP-ORDER-1'
  });
  await worker.fetch(post('/api/webhooks/paypal', event, webhookHeaders()), env, c);
  await c.settled();

  assert.equal(captured, true, 'an approved order must be captured server-side');
  const row = await env.DB.prepare('SELECT * FROM payments WHERE id = ?1').bind(payment.id).first();
  assert.equal(row.status, 'captured');
});

test('a refund webhook is carried into the books', async (t) => {
  const env = workerEnv(MENU);
  const c = ctx();
  let payment;

  const paypal = fakePayPal({
    '/v2/checkout/orders': () => orderResponse({ id: 'PP-ORDER-1' }),
    '/v2/checkout/orders/PP-ORDER-1/capture': () => captureOk(payment.id, payment.reference),
    '/v1/notifications/verify-webhook-signature': verified
  });
  t.after(() => paypal.restore());

  payment = await createPayment(env, c);
  await worker.fetch(post(`/api/payments/${payment.id}/capture`), env, c);

  const event = webhookEvent({
    id: 'WH-REFUND', type: 'PAYMENT.CAPTURE.REFUNDED',
    paymentId: payment.id, reference: payment.reference,
    amount: 1000, orderId: 'PP-ORDER-1'
  });
  await worker.fetch(post('/api/webhooks/paypal', event, webhookHeaders()), env, c);
  await c.settled();

  const row = await env.DB.prepare('SELECT * FROM payments WHERE id = ?1').bind(payment.id).first();
  assert.equal(row.refunded_amount, 1000);
  assert.equal(row.status, 'partially_refunded');
});

/* --- coming back to an interrupted checkout ------------------------------ */

test('a refresh mid-checkout is answered by asking the provider, not by guessing', async (t) => {
  const env = workerEnv(MENU);
  const c = ctx();
  let payment;
  let reads = 0;

  const paypal = fakePayPal({
    '/v2/checkout/orders': () => orderResponse({ id: 'PP-ORDER-1' }),
    '/v2/checkout/orders/PP-ORDER-1': () => {
      reads++;
      return captureOk(payment.id, payment.reference);
    }
  });
  t.after(() => paypal.restore());

  payment = await createPayment(env, c);

  // The webhook never arrived and the browser never captured. The page asks.
  const res = await worker.fetch(get(`/api/payments/${payment.id}`), env, c);
  const body = await res.json();

  assert.equal(reads, 1, 'an unresolved payment is reconciled with the provider');
  assert.equal(body.payment.status, 'captured');
  assert.equal(body.payment.final, true);
});

test('a settled payment is reported without troubling the provider again', async (t) => {
  const env = workerEnv(MENU);
  const c = ctx();
  let payment;
  let reads = 0;

  const paypal = fakePayPal({
    '/v2/checkout/orders': () => orderResponse({ id: 'PP-ORDER-1' }),
    '/v2/checkout/orders/PP-ORDER-1/capture': () => captureOk(payment.id, payment.reference),
    '/v2/checkout/orders/PP-ORDER-1': () => { reads++; return captureOk(payment.id, payment.reference); }
  });
  t.after(() => paypal.restore());

  payment = await createPayment(env, c);
  await worker.fetch(post(`/api/payments/${payment.id}/capture`), env, c);

  const res = await worker.fetch(get(`/api/payments/${payment.id}`), env, c);
  assert.equal((await res.json()).payment.status, 'captured');
  assert.equal(reads, 0);
});

test('an unknown payment id is a 404, never an invented payment', async (t) => {
  const env = workerEnv(MENU);
  const paypal = fakePayPal({});
  t.after(() => paypal.restore());

  const res = await worker.fetch(get('/api/payments/not-a-real-payment-id'), env, ctx());
  assert.equal(res.status, 404);
});

/* --- what the page and the books are allowed to see ---------------------- */

test('the public config never carries the secret', async (t) => {
  const env = workerEnv(MENU);
  const paypal = fakePayPal({});
  t.after(() => paypal.restore());

  const res = await worker.fetch(get('/api/payments/config'), env, ctx());
  const body = await res.json();
  const text = JSON.stringify(body);

  assert.equal(body.online, true);
  assert.equal(body.keys.paypal.clientId, 'test-client-id');
  assert.ok(!text.includes('test-secret'), 'the client secret must never be served');
  assert.ok(!text.includes('test-webhook-id'), 'the webhook id must never be served');
  // Wallets first: what a phone pays with in two taps comes before what needs
  // a card number typed. Three of these four need no PayPal account.
  assert.deepEqual(body.methods, ['applepay', 'googlepay', 'card', 'paypal']);
});

test('online payment disappears entirely when it is not configured', async (t) => {
  const env = workerEnv(MENU, { PAYPAL_CLIENT_ID: '', PAYPAL_CLIENT_SECRET: '' });
  const paypal = fakePayPal({});
  t.after(() => paypal.restore());

  const config = await (await worker.fetch(get('/api/payments/config'), env, ctx())).json();
  assert.equal(config.online, false);
  assert.deepEqual(config.methods, []);

  const res = await worker.fetch(post('/api/payments', BASKET), env, ctx());
  assert.equal(res.status, 503);
});

test('every offered method creates a payment, and each is recorded as itself', async (t) => {
  // Apple Pay, Google Pay and card are guest checkout: no PayPal account is
  // involved for any of them. All four are still one provider underneath, and
  // the row must say which the guest actually used.
  const env = workerEnv(MENU);
  const c = ctx();
  const paypal = fakePayPal({
    '/v2/checkout/orders': () => orderResponse({ id: 'PP-ORDER-1' })
  });
  t.after(() => paypal.restore());

  for (const method of ['applepay', 'googlepay', 'card', 'paypal']) {
    const res = await worker.fetch(post('/api/payments', { ...BASKET, method }), env, c);
    assert.equal(res.status, 201, `${method} must be accepted`);
    const payment = await res.json();
    assert.equal(payment.amount, BASKET_TOTAL);
    assert.equal(payment.provider, 'paypal');
  }
});

test('a method the guest was never offered cannot be forced', async (t) => {
  const env = workerEnv(MENU);
  const paypal = fakePayPal({});
  t.after(() => paypal.restore());

  for (const method of ['bitcoin', '', null, 'PAYPAL']) {
    const res = await worker.fetch(post('/api/payments', { ...BASKET, method }), env, ctx());
    assert.equal(res.status, 503, `method ${method} must not be accepted`);
  }
});

test('sandbox credentials are never served to the live site', async (t) => {
  // The single worst failure this system could have: a real guest on
  // kairo1980.de decides to pay, and meets a checkout wired to sandbox that
  // cannot take their money. It must be impossible, not merely unlikely.
  const env = workerEnv(MENU, { PAYPAL_ENV: 'sandbox' });
  const paypal = fakePayPal({ '/v2/checkout/orders': () => orderResponse({}) });
  t.after(() => paypal.restore());

  const live = (path, init) => new Request('https://kairo1980.de' + path, init);

  const config = await (await worker.fetch(live('/api/payments/config'), env, ctx())).json();
  assert.equal(config.online, false, 'no payment methods on the live domain');
  assert.deepEqual(config.methods, []);

  // And the route refuses too — hiding the buttons is not a control.
  const forced = await worker.fetch(live('/api/payments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(BASKET)
  }), env, ctx());
  assert.equal(forced.status, 503);

  // Localhost is where sandbox belongs, and still works.
  const localConfig = await (await worker.fetch(
    new Request('http://127.0.0.1:8788/api/payments/config'), env, ctx())).json();
  assert.equal(localConfig.online, true);
});

test('live credentials serve the live site normally', async (t) => {
  const env = workerEnv(MENU, { PAYPAL_ENV: 'live' });
  const paypal = fakePayPal({});
  t.after(() => paypal.restore());

  const config = await (await worker.fetch(
    new Request('https://kairo1980.de/api/payments/config'), env, ctx())).json();
  assert.equal(config.online, true);
  assert.deepEqual(config.methods, ['applepay', 'googlepay', 'card', 'paypal']);
});

test('the settlement report is closed without the token', async (t) => {
  const env = workerEnv(MENU, { REPORT_TOKEN: 'sekret' });
  const paypal = fakePayPal({});
  t.after(() => paypal.restore());

  assert.equal((await worker.fetch(get('/api/reports/settlement'), env, ctx())).status, 401);
  assert.equal((await worker.fetch(get('/api/reports/settlement', {
    authorization: 'Bearer wrong'
  }), env, ctx())).status, 401);

  const ok = await worker.fetch(get('/api/reports/settlement', {
    authorization: 'Bearer sekret'
  }), env, ctx());
  assert.equal(ok.status, 200);
  assert.deepEqual((await ok.json()).totals, { orders: 0, gross: 0, refunded: 0, net: 0 });
});

test('the site itself is still served straight from the assets', async (t) => {
  const env = workerEnv(MENU);
  const paypal = fakePayPal({});
  t.after(() => paypal.restore());

  const res = await worker.fetch(get('/'), env, ctx());
  assert.equal(res.status, 200);
  assert.match(await res.text(), /mitem/);
});

test('malformed and oversized requests are refused politely', async (t) => {
  const env = workerEnv(MENU);
  const paypal = fakePayPal({});
  t.after(() => paypal.restore());

  const bad = await worker.fetch(post('/api/payments', '{not json'), env, ctx());
  assert.equal(bad.status, 400);

  const wrongType = await worker.fetch(new Request('https://kairo1980.de/api/payments', {
    method: 'POST', body: 'items=1', headers: { 'Content-Type': 'text/plain' }
  }), env, ctx());
  assert.equal(wrongType.status, 400);

  const huge = await worker.fetch(post('/api/payments', 'x'.repeat(20000)), env, ctx());
  assert.equal(huge.status, 400);
});
