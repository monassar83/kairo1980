# Payments

How a guest pays for an order on kairo1980.de, and what has to be configured
before they can.

## What changed, and why there is now a server

The site used to send guests to a PayPal.Me link. That link could not confirm
anything: the amount in it is editable by the payer, and nothing reported back
to the page, so every payment had to be checked by hand in the PayPal app
against the WhatsApp order before food went out.

Taking payment properly cannot be done in a browser. Deciding what an order
costs, telling a provider to take the money and being told afterwards whether
it worked all have to happen somewhere the guest cannot edit. So the Worker
exists — and only for that. Everything that is not `/api/` is still served as
a static file, byte for byte.

## The one rule, applied to money

**The browser says what it WANTS. The server says what it COSTS.**

No amount, price, discount or fee is ever read from a request body. The Worker
prices every order itself, from the same sources the page uses:

| Fact | Where the server reads it |
| --- | --- |
| Dish prices and names | `index.html` `.mitem[data-item][data-price]`, through the ASSETS binding |
| Postcodes, fees, minimums | `zones.js` (generated from the spreadsheet) |
| Discounts, thresholds | `config.js` |

`worker/site-data.js` imports `config.js` and `zones.js` — the actual browser
files — so there is no second copy of a business fact anywhere on the server.
The import order matters and is commented: `config.js` reads `window.KAIRO_ZONES`
while it evaluates, so `zones.js` has to run first.

## The shape of it

```
worker/index.js            routes; everything not /api/ falls through to ASSETS
worker/pricing.js          what an order costs, in cents
worker/site-data.js        the business facts, read from the browser's own files
worker/payments/store.js   the state machine and the event log
worker/payments/paypal.js  the only file that knows PayPal's vocabulary
worker/payments/providers.js  the list of providers
pay.js                     the browser side, fetched on demand
migrations/                the schema
```

Adding a second provider — Stripe, SumUp — means writing one file exporting
`createOrder`, `captureOrder`, `getOrder`, `refund` and `verifyEvent`, and
naming it in `providers.js`. Nothing in the checkout, the store or the routes
learns its name.

## What the guest sees

The basket offers two choices: pay online now, or pay on arrival. Choosing
online shows a payment step listing every method the device and the account
can actually do — Apple Pay, Google Pay, card, PayPal — in that order, because
the wallet already unlocked on a phone is the fastest way to finish.

**Apple Pay and Google Pay do not require the guest to have a PayPal account.**
PayPal is the processor behind them, not a login they have to pass.

Payment happens **before** the WhatsApp handover. That is deliberate:

- the order reaches the restaurant already marked `ONLINE BEZAHLT ✓` with its
  reference, so nothing has to be checked by hand;
- on a phone, sending the message first would switch apps and leave the payment
  behind in a tab the guest may never return to.

Every failure path — cancelled, declined, SDK blocked, provider unreachable —
ends with the same escape: *send the order anyway and pay on arrival*. A guest
whose card was refused still wants dinner, and the site must never lose that
order.

## Why it cannot go wrong twice

| What happens | What stops it |
| --- | --- |
| Double-clicking pay | `settle()` moves a payment only from a status it may legally come from, in one conditional UPDATE. The second caller changes no row and is told the current state. |
| A retried request after a timeout | Every mutating PayPal call carries `PayPal-Request-Id` set to our payment id, so PayPal returns the original result instead of charging again. |
| A replayed webhook | `payment_events.event_key` is UNIQUE. PayPal retries for days; every retry after the first does nothing. |
| A forged webhook | Verified with PayPal against the registered webhook id before a single byte is believed. An unverified event is refused with 400. |
| The guest approves, then the browser dies | `CHECKOUT.ORDER.APPROVED` arrives by webhook and the capture is completed server-side. |
| A refresh mid-checkout | The page asks the server; if the server is unsure it asks PayPal before answering. "I don't know" is never shown to a guest. |
| PayPal captures the wrong amount | Compared against the amount the server computed. A mismatch is recorded as `failed` and logged, never silently accepted. |

`payments` holds current state; `payment_events` is append-only and never
edited. When a figure is questioned months later, the log is the answer.

## The books

`GET /api/reports/settlement?from=YYYY-MM-DD&to=YYYY-MM-DD` with
`Authorization: Bearer $REPORT_TOKEN` returns money actually taken, net of
refunds, per day, provider and order type. It reads the `payments_settled`
view, which counts only captured payments — not attempts, and not gross before
refunds.

That one is for a program. A person wants `/admin/orders`, which shows the same
day's settled payments and, highlighted, every paid order that never reached
the chat. It is behind the admin login — see `docs/admin.md`. The two are
deliberately different doors: a report token pasted into a script should not
also be able to close the shop.

## Setting it up

Everything below is done once, in the PayPal and Cloudflare dashboards. No
credential belongs in this repository.

1. **Create the database** and paste the id it prints into `wrangler.jsonc`:

   ```
   npx wrangler d1 create kairo1980-payments
   ```

   Until this is done the deploy fails on purpose, with a message saying so.

2. **Apply the schema** (CI does this on every deploy, but do it once by hand
   to confirm it works):

   ```
   npm run migrate:remote
   ```

3. **Create a PayPal app** at
   <https://developer.paypal.com/dashboard/applications>, on the **Sandbox**
   tab to begin with. Copy the client id and the secret.

   Take them from the **business** account. The developer dashboard has no
   personal/business switcher — it shows whichever account you signed in with,
   so it is easy to generate credentials from the wrong profile without
   noticing. The only toggle there is Sandbox ↔ Live, which is a different
   thing.

4. **Paste them in and let the setup do the rest:**

   ```
   cp .dev.vars.example .dev.vars     # then fill in the two PayPal values
   npm run setup:payments             # registers the webhook, generates the token
   npm run secrets:push               # copies everything to Cloudflare
   ```

   `setup:payments` registers the webhook with PayPal over the API and writes
   the id back into `.dev.vars`, so nothing is copied out of a dashboard by
   hand — which is where these setups usually go wrong, because a mistyped
   signing value fails silently and only later, as a webhook that never
   verifies. It is idempotent; run it again whenever you like.

   `secrets:push` pipes each value to `wrangler secret put` on stdin, so no
   secret reaches your shell history or the process list.

   **If you ever change the client id and secret, clear `PAYPAL_WEBHOOK_ID`
   and run the setup again.** Webhooks belong to a PayPal account: keep the old
   id after switching accounts and every incoming event is verified against the
   wrong account and refused.

5. **Test with sandbox accounts** (PayPal creates fake buyer and business
   accounts under *Testing Tools → Sandbox accounts* — no real money is
   involved), then switch `PAYPAL_ENV` in `wrangler.jsonc` to `"live"`, replace
   the two credentials with the live app's, clear `PAYPAL_WEBHOOK_ID`, and run
   steps 4 again.

### Apple Pay and Google Pay

There is nothing to switch on here, and that is deliberate.

The server offers all four methods; the browser draws only the ones that
actually work. `pay.js` asks the PayPal SDK about each one and skips silently
whatever reports itself ineligible. A wallet is eligible only when **both** are
true:

1. the guest's device has it — Apple Pay needs Safari on Apple hardware with a
   card in Wallet, Google Pay needs a supported browser; and
2. PayPal has enabled **Advanced Checkout** for the merchant account.

The second is an underwriting review by PayPal, per merchant and per country.
It is not a settings toggle, cannot be checked from this codebase, and cannot
be hurried. Until it is granted the wallet buttons simply do not appear —
"Debit or Credit Card" and the PayPal button carry the checkout on their own,
and card is already a no-account guest checkout that needs no approval.

The day PayPal approves the account, the wallets appear by themselves. No
edit, no deploy, no flag: the SDK starts reporting them eligible and `pay.js`
draws them. That is the whole reason eligibility is asked at render time
instead of being written into config.

What none of them require is a PayPal account **from the guest**. Apple Pay is
Face ID and done; the guest never sees the word PayPal.

## Switching it all off

`config.payment.prepayOnline: false` in `config.js` removes online payment from
the site in one edit — no deploy of anything else, no credentials touched. The
basket falls back to paying on arrival exactly as it did before.

## Running it locally

```
cp .dev.vars.example .dev.vars     # then fill in sandbox credentials
npm run migrate:local
npm run dev
```

`--persist-to` points outside the repository on purpose: `assets.directory` is
the repo root, so wrangler's default `.wrangler` state would land inside the
directory it is watching and the dev server would reload in a loop.

## Tests

```
npm test        # pricing, the state machine, and the whole API against a fake PayPal
npm run test:e2e  # the customer journey in a real browser, against a real Worker
```

`tests/integration` drives the real routes and the real SQL, with PayPal
replaced so declines, replays, lost callbacks and amount mismatches can
actually be produced. `tests/e2e` covers what only a browser can prove: what
the guest sees at each step, and what reaches the restaurant afterwards.
