/* Forgetting who paid, on time, and nothing else.
   ---------------------------------------------------------------------------
   The privacy policy now names a period in public. That turns these from tests
   about a cron job into tests about a statement we make to guests: if the sweep
   silently stops working, the Datenschutzerklärung becomes untrue. So what is
   asserted here is the promise, not the implementation — the identity is gone
   after 180 days, the money is not, and the audit trail survives both. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scrubExpiredIdentities, IDENTITY_DAYS } from '../../worker/retention.js';
import { freshDatabase } from '../helpers/d1.js';

/** A captured payment, `age` days old, carrying an identity and an event whose
 *  payload holds the payer's name exactly as PayPal sends it. */
async function paymentAged(db, id, age) {
  const at = `datetime('now', '-${age} day')`;
  await db.prepare(
    `INSERT INTO payments (id, reference, provider, status, amount, currency,
       subtotal, discount, fee, order_type, postcode, lines,
       payer_email, payer_id, created_at, updated_at, captured_at)
     VALUES (?1, ?2, 'paypal', 'captured', 2610, 'EUR', 2900, 290, 0,
             'pickup', '68766', '[{"qty":2,"name":"Koshari"}]',
             ?3, ?4, ${at}, ${at}, ${at})`
  ).bind(id, 'REF-' + id, `gast-${id}@example.com`, 'PAYER-' + id).run();

  await db.prepare(
    `INSERT INTO payment_events (payment_id, provider, event_key, event_type,
       source, payload, created_at)
     VALUES (?1, 'paypal', ?2, 'CHECKOUT.ORDER.APPROVED', 'webhook', ?3, ${at})`
  ).bind(id, 'evt-' + id,
    JSON.stringify({ payer: { name: { given_name: 'Sherif', surname: 'Esmat' } } })).run();
}

const row = (db, id) =>
  db.prepare('SELECT * FROM payments WHERE id = ?1').bind(id).first();
const evt = (db, id) =>
  db.prepare('SELECT * FROM payment_events WHERE payment_id = ?1').bind(id).first();

test('an identity older than the window is gone, and the money is not', async () => {
  const db = freshDatabase();
  await paymentAged(db, 'old', IDENTITY_DAYS + 5);

  const changed = await scrubExpiredIdentities({ DB: db });
  assert.equal(changed.payments, 1);
  assert.equal(changed.events, 1);

  const after = await row(db, 'old');
  assert.equal(after.payer_email, null, 'the payer cannot be identified');
  assert.equal(after.payer_id, null);
  assert.equal((await evt(db, 'old')).payload, null, 'nor named in the event log');

  // § 147 AO: the books are not privacy housekeeping's to delete.
  assert.equal(after.amount, 2610, 'the amount stands');
  assert.equal(after.reference, 'REF-old');
  assert.equal(after.currency, 'EUR');
  assert.equal(after.order_type, 'pickup');
  assert.ok(after.captured_at, 'and when it was taken');
  assert.match(after.lines, /Koshari/, 'and what was sold');
});

test('a payment still inside the window is untouched', async () => {
  /* The window is not decoration: a dispute opened on day 179 has to be
     answerable, and it cannot be answered about a payer we have forgotten. */
  const db = freshDatabase();
  await paymentAged(db, 'recent', IDENTITY_DAYS - 5);

  const changed = await scrubExpiredIdentities({ DB: db });
  assert.equal(changed.payments, 0);
  assert.equal(changed.events, 0);

  assert.equal((await row(db, 'recent')).payer_email, 'gast-recent@example.com');
  assert.match((await evt(db, 'recent')).payload, /Esmat/);
});

test('the event row survives, because it is the replay guard', async () => {
  /* Only the payload is emptied. Deleting the row would take `event_key` with
     it, and a webhook PayPal retries a year later would then be treated as new
     — the one thing payment_events exists to prevent. */
  const db = freshDatabase();
  await paymentAged(db, 'old', IDENTITY_DAYS + 30);
  await scrubExpiredIdentities({ DB: db });

  const event = await evt(db, 'old');
  assert.ok(event, 'the row is still there');
  assert.equal(event.event_key, 'evt-old', 'and still guards its key');
  assert.equal(event.event_type, 'CHECKOUT.ORDER.APPROVED', 'and still says what happened');
  assert.equal(event.payload, null, 'it just no longer says who');
});

test('running it twice changes nothing the second time', async () => {
  // A cron that overlaps itself, a manual run during an incident and a retry
  // after a partial failure must all be safe.
  const db = freshDatabase();
  await paymentAged(db, 'old', IDENTITY_DAYS + 1);

  const first = await scrubExpiredIdentities({ DB: db });
  const second = await scrubExpiredIdentities({ DB: db });

  assert.equal(first.payments, 1);
  assert.equal(second.payments, 0, 'nothing left to do');
  assert.equal(second.events, 0);
});

test('the sweep only touches what is expired, with both ages present', async () => {
  const db = freshDatabase();
  await paymentAged(db, 'old', IDENTITY_DAYS + 10);
  await paymentAged(db, 'recent', 1);

  const changed = await scrubExpiredIdentities({ DB: db });
  assert.equal(changed.payments, 1, 'exactly one of the two');

  assert.equal((await row(db, 'old')).payer_email, null);
  assert.equal((await row(db, 'recent')).payer_email, 'gast-recent@example.com');
});
