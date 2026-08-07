# What we keep, and for how long

The Datenschutzerklärung names a period in public. That makes this document and
`worker/retention.js` part of a promise rather than housekeeping: **if the sweep
stops running, the privacy policy becomes untrue.** Treat a change here as a
change to a published statement.

## The two obligations, and why they do not conflict

They pull in opposite directions and both are real.

- **§ 147 AO and § 257 HGB say keep.** A captured payment is an accounting
  record and must be retained for ten years. Deleting it to be tidy about
  privacy would be a different offence.
- **Art. 5(1)(e) DSGVO says forget.** Personal data may be held only as long as
  the purpose needs it.

They are separated rather than traded off, because the tax obligation attaches
to **the money**, not to **who paid it**.

| Data | Kept | Basis |
| --- | --- | --- |
| `payments.payer_email`, `payments.payer_id` | **180 days**, then nulled | Art. 6(1)(f) — answering a payment dispute |
| `payment_events.payload` (verbatim PayPal bodies) | **180 days**, then nulled | as above |
| Reference, amount, currency, order type, postcode, items, transaction ids, timestamps | **10 years** | § 147 AO, § 257 HGB |

**Why 180 days:** it is PayPal's buyer-protection window. Up to that point a
guest can still dispute a payment and we have to be able to answer with the
provider's own words. After it, the purpose is spent and the lawful basis with
it. The number is not a guess and should not be changed without a reason of the
same kind.

## The thing that is easy to miss

Nothing in this codebase ever asks a guest for their name. It arrives anyway.

`payment_events.payload` stores the provider's words **verbatim**, on purpose —
a figure questioned months later is answered by what PayPal actually said. A
`CHECKOUT.ORDER.APPROVED` body contains `payer.name.given_name` and
`payer.name.surname`. Verified against production on 7 August 2026:

```
CHECKOUT.ORDER.APPROVED    has_payer:1  given_name:1  surname:1  email:1
PAYMENT.CAPTURE.COMPLETED                                        email:1
```

This is why the privacy policy previously said something untrue. It stated
*"Name, Anschrift und Telefonnummer werden dabei nicht gespeichert"* — accurate
about what the site **collects**, wrong about what it **stores**, because nobody
had looked inside the payload. The wording now separates the two: we do not
*collect* your name, and we do store what PayPal *tells* us, for 180 days.

If a future provider is added, check what its event bodies carry before assuming
this table is still complete.

## Only the payload is emptied, never the row

`payment_events` rows are never deleted. The row is the audit trail — which
status moved when and on whose say-so — and `event_key` being `UNIQUE` is what
makes a replayed webhook harmless. Delete the row and a webhook PayPal retries a
year later would be treated as new. Nulling the payload takes the name out and
leaves both properties intact.

## How it runs

A Cloudflare Cron Trigger, nightly at **03:17 UTC** (`wrangler.jsonc` →
`triggers.crons`), calling `scheduled()` in `worker/index.js` →
`runRetention()`.

It is **idempotent**: each statement matches only rows that still hold
something, so a missed night is caught up by the next one, an overlapping run
does nothing twice, and a manual run during an incident is safe. There is no
lock, because the `WHERE` clause is the lock.

It **never throws**. A failed sweep is logged and retried on the next tick
rather than becoming an error that stops the Worker doing anything else.

Covered by `tests/unit/retention.test.js`: expired identities gone, recent ones
untouched, the financial record intact, the event row and its key surviving, and
a second run changing nothing.

## Checking it actually happened

```
npx wrangler tail                     # watch a run live
```

To confirm nothing older than the window still holds an identity — this returns
counts only, no personal data:

```
npx wrangler d1 execute kairo1980-payments --remote --command \
  "SELECT COUNT(*) AS stale FROM payments \
    WHERE created_at < datetime('now','-180 day') \
      AND (payer_email IS NOT NULL OR payer_id IS NOT NULL)"
```

`stale` must be `0`. If it is not, the cron is not running — check that
`triggers.crons` survived the last deploy.

## What is deliberately NOT stored

No name, address or telephone number is ever **collected**. Those reach the
restaurant only in the guest's own WhatsApp message. That remains true and is
the reason the Datenschutzerklärung is short and there is no cookie banner.

Changing it — storing the full order server-side so that a cash order also
reaches the restaurant without WhatsApp — is a larger decision with its own
consequences, and is written up in `next-whatsapp-cloud-api.md`. It would need
this document extended, not replaced.
