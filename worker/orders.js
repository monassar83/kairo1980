/* Recording the order, not only the money.
   ---------------------------------------------------------------------------
   The rule that shapes every route on this server holds here too: the browser
   says WHAT it wants, the server says what it COSTS. The basket, the order type
   and the postcode are read from the request; every figure is recomputed by
   worker/pricing.js from the published menu. Nothing about money is believed.

   What IS taken from the body is the part no server can compute: who the guest
   is and where the food goes. Those four fields are the only personal data this
   site has ever stored, they are read at /admin behind the login, they are
   never put in a notification, and the nightly sweep nulls them after 90 days.

   NEVER BLOCKS THE ORDER. This is the rule the whole basket is built on and it
   applies with particular force here, because by the time this is called the
   guest has already pressed send. A throttled caller, an unpriceable basket, a
   database that will not answer — all of them return a plain failure that the
   browser ignores, and the WhatsApp handover proceeds exactly as it did before
   this file existed. Losing an order to our own bookkeeping would be worse than
   the problem this solves. */

import { quote } from './pricing.js';
import { newReference } from './payments/store.js';

/* Ten announcements from one address in ten minutes is far beyond a person
   ordering dinner and far below anything a real guest could trip. Counting
   rows in a window rather than holding a counter keeps this stateless across
   isolates, which is the only way it can work on Workers at all. */
const MAX_PER_WINDOW = 10;
const WINDOW_MINUTES = 10;

export async function throttled(env, ip) {
  if (!ip) return false;
  try {
    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM order_rate
        WHERE ip = ?1 AND at > datetime('now', ?2)`
    ).bind(ip, `-${WINDOW_MINUTES} minutes`).first();
    return !!row && row.n >= MAX_PER_WINDOW;
  } catch {
    // A counter that cannot be read must never refuse a real order. The cost
    // of failing open is a noisy phone; the cost of failing closed is a lost
    // dinner, and this whole file exists to stop losing those.
    return false;
  }
}

async function recordAttempt(env, ip) {
  if (!ip) return;
  try {
    // The write pays for the cleanup, so the table never grows and an IP —
    // which is personal data — is held for minutes rather than kept.
    await env.DB.prepare(
      `DELETE FROM order_rate WHERE at <= datetime('now', ?1)`
    ).bind(`-${WINDOW_MINUTES} minutes`).run();
    await env.DB.prepare('INSERT INTO order_rate (ip) VALUES (?1)').bind(ip).run();
  } catch { /* counting is best-effort; it must not fail an order */ }
}

/** Trim to something a database column and a printed ticket can both hold.
 *  Long enough for a real Egyptian name, a real street and a real note. */
const clip = (value, max) => {
  const text = String(value == null ? '' : value).trim();
  return text ? text.slice(0, max) : null;
};

/**
 * Store one order and answer with the reference to print in the chat.
 *
 * @returns {Promise<{id: string, reference: string, total: number,
 *                    alerted: boolean} | null>} null when nothing was stored
 */
export async function recordOrder(env, body, ip) {
  if (await throttled(env, ip)) return null;
  await recordAttempt(env, ip);

  // Prices come from the menu, never from the browser. Throws PricingError for
  // an unknown dish or an empty basket, which the route turns into a plain 400.
  const priced = await quote(env, body);

  /* An order paid online already has a reference — it is printed on the payment
     and in the chat, and a second one would mean the guest quotes a code the
     restaurant cannot find. So it is reused, and only a cash order mints one. */
  const paymentId = clip(body.paymentId, 64);
  let reference = null;
  if (paymentId) {
    const row = await env.DB.prepare(
      'SELECT reference FROM payments WHERE id = ?1'
    ).bind(paymentId).first();
    reference = row ? row.reference : null;
  }
  if (!reference) reference = newReference();

  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO orders (id, reference, payment_id, order_type, business,
       pay_method, postcode, lines, subtotal, discount, fee, total, currency,
       requested_time, customer_name, customer_phone, customer_address,
       customer_company, notes, created_at)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,'EUR',?13,?14,?15,?16,?17,?18,
             datetime('now'))`
  ).bind(
    id, reference, paymentId,
    body.type === 'pickup' ? 'pickup' : 'delivery',
    body.business ? 1 : 0,
    paymentId ? 'online' : 'onsite',
    clip(body.postcode, 16),
    JSON.stringify(priced.lines),
    priced.subtotal, priced.discount, priced.fee, priced.total,
    clip(body.time, 120),
    clip(body.name, 120),
    clip(body.phone, 40),
    clip(body.address, 240),
    clip(body.company, 120),
    clip(body.notes, 500)
  ).run();

  return {
    id,
    reference,
    total: priced.total,
    /* Only an order nobody has been told about is announced here. A paid one
       was announced the moment the money was captured, and announcing it again
       on handover would buzz the phone twice for one dinner. */
    alerted: !paymentId
  };
}

/** One order for the admin page, details and all. */
export async function getOrder(env, id) {
  return env.DB.prepare('SELECT * FROM orders WHERE id = ?1').bind(id).first();
}
