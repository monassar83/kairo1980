/* The WhatsApp webhook, before it is ever pointed at anything real.
   ---------------------------------------------------------------------------
   This endpoint is the one public URL on the site that will act on what is
   posted to it. Everything else public either serves a file or prices a basket
   the server itself computes. So the questions here are the hostile ones: can
   somebody who is not Meta make it do something, and can Meta make it do the
   same thing twice.

   Written before the integration is switched on, deliberately. A webhook whose
   verification is tested only after it goes live has been unverified in
   production for however long that took. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../../worker/index.js';
import { workerEnv } from '../helpers/env.js';
import { readEvent, eventKey, signatureValid } from '../../worker/whatsapp/webhook.js';
import { toWaNumber } from '../../worker/whatsapp/client.js';

const SECRET = 'app-secret-from-meta';
const VERIFY = 'a-long-random-token-we-chose';

const WA = (over = {}) => ({
  WHATSAPP_ENABLED: 'true',
  WHATSAPP_TOKEN: 'permanent-system-user-token',
  WHATSAPP_PHONE_NUMBER_ID: '1234567890',
  WHATSAPP_APP_SECRET: SECRET,
  WHATSAPP_VERIFY_TOKEN: VERIFY,
  ...over
});

const MENU = { hummus: { price: 950, name: 'Hummus' } };
const ctx = () => {
  const p = [];
  return { waitUntil: (x) => p.push(x), settled: () => Promise.all(p) };
};

/** Sign exactly as Meta does: HMAC-SHA256 over the raw bytes, hex, prefixed. */
async function sign(body, secret = SECRET) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return 'sha256=' + [...new Uint8Array(mac)]
    .map((b) => b.toString(16).padStart(2, '0')).join('');
}

const EVENT = {
  object: 'whatsapp_business_account',
  entry: [{
    id: 'WABA-1',
    changes: [{
      field: 'messages',
      value: {
        messaging_product: 'whatsapp',
        messages: [{
          id: 'wamid.ABC123',
          from: '4917612345678',
          timestamp: '1780000000',
          type: 'text',
          text: { body: '2x Hummus bitte' }
        }]
      }
    }]
  }]
};

const post = async (env, body, headers = {}) => worker.fetch(
  new Request('https://kairo1980.de/api/webhooks/whatsapp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body
  }), env, ctx());

const get = (env, query) => worker.fetch(
  new Request('https://kairo1980.de/api/webhooks/whatsapp?' + query), env, ctx());

/* --- the subscription handshake ------------------------------------------ */

test('Meta\'s handshake is answered only for the token we chose', async () => {
  const env = workerEnv(MENU, WA());

  const ok = await get(env, new URLSearchParams({
    'hub.mode': 'subscribe', 'hub.verify_token': VERIFY, 'hub.challenge': '1158201444'
  }));
  assert.equal(ok.status, 200);
  assert.equal(await ok.text(), '1158201444', 'the challenge, bare — no JSON, no quotes');

  for (const params of [
    { 'hub.mode': 'subscribe', 'hub.verify_token': 'wrong', 'hub.challenge': 'x' },
    { 'hub.mode': 'subscribe', 'hub.verify_token': VERIFY.slice(0, -1), 'hub.challenge': 'x' },
    { 'hub.mode': 'subscribe', 'hub.challenge': 'x' },
    { 'hub.mode': 'unsubscribe', 'hub.verify_token': VERIFY, 'hub.challenge': 'x' }
  ]) {
    const res = await get(env, new URLSearchParams(params));
    assert.equal(res.status, 403, JSON.stringify(params));
    assert.notEqual(await res.text(), 'x', 'and never echoes the challenge');
  }
});

/* --- the signature -------------------------------------------------------- */

test('an event nobody signed changes nothing', async () => {
  const env = workerEnv(MENU, WA());
  const raw = JSON.stringify(EVENT);

  for (const headers of [
    {},
    { 'x-hub-signature-256': 'sha256=deadbeef' },
    { 'x-hub-signature-256': 'nonsense' },
    { 'x-hub-signature-256': await sign(raw, 'the-wrong-secret') },
    { 'x-hub-signature-256': (await sign(raw)).replace('sha256=', '') },
    // The real signature for a DIFFERENT body: replaying a valid signature
    // against altered content is the whole point of signing.
    { 'x-hub-signature-256': await sign(JSON.stringify({ ...EVENT, object: 'other' })) }
  ]) {
    const res = await post(env, raw, headers);
    assert.equal(res.status, 403, JSON.stringify(headers));
  }

  const good = await post(env, raw, { 'x-hub-signature-256': await sign(raw) });
  assert.equal(good.status, 200);
});

test('the signature is checked over the bytes sent, not over a re-reading', async () => {
  /* JSON.parse followed by JSON.stringify is not the identity: key order,
     spacing and unicode escaping all move. Verifying a re-serialised body
     would reject genuine events and, worse, would make the check depend on
     something Meta never promised. */
  const env = workerEnv(MENU, WA());
  const spaced = JSON.stringify(EVENT, null, 2);

  const res = await post(env, spaced, { 'x-hub-signature-256': await sign(spaced) });
  assert.equal(res.status, 200, 'signed as sent, so accepted as sent');

  const wrong = await post(env, spaced, {
    'x-hub-signature-256': await sign(JSON.stringify(EVENT))
  });
  assert.equal(wrong.status, 403, 'signed as something else, so refused');
});

test('a byte-for-byte replay is recorded once and no more', async () => {
  const env = workerEnv(MENU, WA());
  const raw = JSON.stringify(EVENT);
  const signature = await sign(raw);

  const first = await post(env, raw, { 'x-hub-signature-256': signature });
  assert.equal((await first.json()).duplicate, undefined, 'the first one is new');

  // Meta retries for days. Every retry after the first must do nothing.
  for (let i = 0; i < 3; i++) {
    const again = await post(env, raw, { 'x-hub-signature-256': signature });
    assert.equal((await again.json()).duplicate, true);
  }

  const rows = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM payment_events WHERE event_key = 'whatsapp:wamid.ABC123'`
  ).first();
  assert.equal(rows.n, 1, 'one row, however many times it arrived');
});

test('with WhatsApp switched off the endpoint does nothing at all', async () => {
  const env = workerEnv(MENU);              // no WHATSAPP_* at all
  const raw = JSON.stringify(EVENT);
  const res = await post(env, raw, { 'x-hub-signature-256': await sign(raw) });
  assert.equal(res.status, 503, 'off means off, even for a correctly signed event');

  const handshake = await get(env, new URLSearchParams({
    'hub.mode': 'subscribe', 'hub.verify_token': VERIFY, 'hub.challenge': 'x'
  }));
  assert.equal(handshake.status, 503);
});

test('without an app secret the endpoint is not configured, not permissive', async () => {
  /* The dangerous reading of "no secret" is "nothing to check, so accept".
     The safe one is "cannot check, so refuse" — and saying WHICH matters:
     an endpoint that silently 403s everything while reporting itself enabled
     is an afternoon lost debugging from Meta's end. */
  const env = workerEnv(MENU, WA({ WHATSAPP_APP_SECRET: '' }));
  const raw = JSON.stringify(EVENT);
  const res = await post(env, raw, { 'x-hub-signature-256': await sign(raw) });
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error.code, 'whatsapp_off');
});

/* --- reading what arrived ------------------------------------------------- */

test('a guest\'s message is pulled out of Meta\'s envelope intact', () => {
  const { messages, statuses } = readEvent(EVENT);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].from, '4917612345678');
  assert.equal(messages[0].text, '2x Hummus bitte');
  assert.equal(messages[0].at, 1780000000 * 1000);
  assert.equal(statuses.length, 0);
});

test('a delivery receipt is a status, not a message', () => {
  const { messages, statuses } = readEvent({
    entry: [{ changes: [{ value: { statuses: [{
      id: 'wamid.OUT1', status: 'failed', recipient_id: '4917612345678', timestamp: '1780000001'
    }] } }] }]
  });
  assert.equal(messages.length, 0);
  assert.equal(statuses[0].status, 'failed');
});

test('an envelope missing every optional level is read as empty, not as a crash', () => {
  /* Every level of Meta's shape is optional and half of them are absent in
     practice. A webhook that throws on an unexpected payload is a webhook Meta
     retries for days and then disables. */
  for (const body of [{}, null, { entry: null }, { entry: [{}] },
                      { entry: [{ changes: [{}] }] },
                      { entry: [{ changes: [{ value: {} }] }] }]) {
    const out = readEvent(body);
    assert.deepEqual(out, { messages: [], statuses: [] }, JSON.stringify(body));
    assert.equal(eventKey(body), null);
  }
});

/* --- the number ----------------------------------------------------------- */

test('a German number reaches the right phone however it was typed', () => {
  /* Getting this wrong sends the message nowhere and reports success, which is
     the worst failure available: the restaurant believes the guest was told. */
  for (const written of ['+49 176 79906621', '0049 176 79906621', '0176 79906621',
                         '0176-799 066 21', '+4917679906621']) {
    assert.equal(toWaNumber(written), '4917679906621', written);
  }
  // Already in the API's own shape, and left alone.
  assert.equal(toWaNumber('4917679906621'), '4917679906621');
});

test('signatureValid refuses everything when there is no secret to check against', async () => {
  assert.equal(await signatureValid({}, 'sha256=whatever', 'body'), false);
  assert.equal(await signatureValid({ WHATSAPP_APP_SECRET: SECRET }, null, 'body'), false);
  assert.equal(await signatureValid({ WHATSAPP_APP_SECRET: SECRET }, '', 'body'), false);
});
