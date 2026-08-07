/* Forgetting who paid, while remembering what was paid.
   ---------------------------------------------------------------------------
   Two obligations pull in opposite directions and both are real.

   The tax law says KEEP. § 147 AO and § 257 HGB require accounting records for
   ten years, and a captured payment is one: the reference, the amount, the
   currency, what was ordered, when. Deleting those to be tidy about privacy
   would be a different offence.

   The GDPR says FORGET. Art. 5(1)(e) allows personal data to be held only as
   long as it is needed for the purpose it was collected for. The payer's name
   and e-mail were never needed for the books — they are needed to answer a
   dispute, and PayPal's buyer-protection window closes after 180 days. After
   that the purpose is spent and the lawful basis with it.

   So the two are separated rather than traded off. At 180 days the identity is
   nulled and the money stays. What remains is a complete financial record that
   no longer says who anybody was.

   WHAT ACTUALLY HOLDS A NAME is worth being exact about, because it is not
   obvious and it is the thing that made the old privacy policy untrue:

     payments.payer_email   what PayPal reports about its own account holder
     payments.payer_id      PayPal's identifier for that account
     payment_events.payload the provider's words stored VERBATIM — and a
                            CHECKOUT.ORDER.APPROVED body carries `payer` with
                            `given_name` and `surname` inside it

   The third one is the trap. Nothing in this codebase ever asked for a name;
   it arrives inside an event body that is stored whole, on purpose, because a
   figure questioned months later is answered by the provider's own words. That
   is a good reason to keep the body and no reason at all to keep it forever.

   The event ROW is never deleted, only its payload emptied. The row is what
   makes the ledger auditable — which status moved when, and on whose say-so —
   and `event_key` being UNIQUE is what makes a replayed webhook harmless. Delete
   the row and a webhook PayPal retries a year later would be treated as new. */

/** How long an identity outlives the order it belongs to. */
export const IDENTITY_DAYS = 180;

/* Both tables are timestamped with the same `datetime('now')` text format, so
   the cutoff is a string comparison in SQLite and needs no date parsing. */
const CUTOFF = `datetime('now', '-${IDENTITY_DAYS} day')`;

/**
 * Null every field that can identify a payer, once it is older than the window.
 *
 * Written so that running it twice changes nothing the second time: each
 * statement only matches rows that still hold something. That matters more than
 * it looks — a cron that overlaps itself, a manual run during an incident and a
 * retry after a partial failure must all be safe, and "safe" here means the
 * WHERE clause, not a lock.
 *
 * @returns {Promise<{payments: number, events: number}>} rows actually changed
 */
export async function scrubExpiredIdentities(env) {
  const payments = await env.DB.prepare(
    `UPDATE payments
        SET payer_email = NULL, payer_id = NULL
      WHERE created_at < ${CUTOFF}
        AND (payer_email IS NOT NULL OR payer_id IS NOT NULL)`
  ).run();

  /* The payload is emptied, not the row. See the note above: the row is the
     audit trail and the replay guard. */
  const events = await env.DB.prepare(
    `UPDATE payment_events
        SET payload = NULL
      WHERE created_at < ${CUTOFF}
        AND payload IS NOT NULL`
  ).run();

  return {
    payments: payments.meta?.changes || 0,
    events: events.meta?.changes || 0
  };
}

/** The scheduled entry point. Never throws: a failed scrub must be visible in
 *  the log and retried by the next tick, not turned into an alarm that stops
 *  the Worker doing anything else it is asked. */
export async function runRetention(env) {
  try {
    const changed = await scrubExpiredIdentities(env);
    if (changed.payments || changed.events) {
      console.log('retention: scrubbed', changed.payments, 'payments,', changed.events, 'event payloads');
    }
    return changed;
  } catch (err) {
    console.error('retention failed', err && err.message);
    return { payments: 0, events: 0, failed: true };
  }
}
