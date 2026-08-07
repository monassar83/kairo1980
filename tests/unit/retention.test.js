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

/* --- the customer's own details ------------------------------------------
   A different clock from the payer identity, and a longer one. §§ 195 and 199
   BGB: the regular limitation period is three years and starts running at the
   END of the year the claim arose, so an order placed in 2026 can still be
   litigated until 31 December 2029. These are scrubbed the day after. */

async function orderAged(db, id, yearsAgo) {
  await db.prepare(
    `INSERT INTO orders (id, reference, order_type, pay_method, postcode, lines,
       subtotal, discount, fee, total, requested_time,
       customer_name, customer_phone, customer_address, customer_company, notes,
       created_at)
     VALUES (?1, ?2, 'delivery', 'onsite', '68766', '[{"qty":2,"name":"Koshari"}]',
             2900, 290, 0, 2610, 'Heute 19:30',
             'Sherif Esmat', '+49 176 79906621', 'Hauptstrasse 12', 'KAIRO GmbH',
             'Bitte 2x klingeln',
             datetime('now', ?3))`
  ).bind(id, 'REF-' + id, `-${yearsAgo} years`).run();
}

const order = (db, id) =>
  db.prepare('SELECT * FROM orders WHERE id = ?1').bind(id).first();

test('details survive the limitation period and are gone after it', async () => {
  const db = freshDatabase();
  await orderAged(db, 'stale', 4);     // comfortably past the year-end + 3
  await orderAged(db, 'fresh', 1);     // still well inside it

  const changed = await scrubExpiredIdentities({ DB: db });
  assert.equal(changed.orders, 1, 'exactly the one that expired');

  const gone = await order(db, 'stale');
  assert.equal(gone.customer_name, null);
  assert.equal(gone.customer_phone, null);
  assert.equal(gone.customer_address, null);
  assert.equal(gone.customer_company, null);
  assert.equal(gone.notes, null, 'including a note that may mention an allergy');
  assert.ok(gone.details_purged_at, 'and it says so, rather than looking like a bug');

  // The order itself is not personal data and is not the sweep's to delete.
  assert.equal(gone.total, 2610);
  assert.equal(gone.reference, 'REF-stale');
  assert.match(gone.lines, /Koshari/);

  const kept = await order(db, 'fresh');
  assert.equal(kept.customer_phone, '+49 176 79906621', 'a claim can still be answered');
  assert.equal(kept.details_purged_at, null);
});

test('scrubbing order details twice changes nothing the second time', async () => {
  const db = freshDatabase();
  await orderAged(db, 'stale', 5);

  const first = await scrubExpiredIdentities({ DB: db });
  const second = await scrubExpiredIdentities({ DB: db });
  assert.equal(first.orders, 1);
  assert.equal(second.orders, 0, 'details_purged_at is the guard');
});
