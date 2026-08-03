# Next: delivering the order without the customer pressing send

Handover for a fresh session. Nothing here is started; the site is live and
working without it.

## What is being asked for

Today a guest pays, and then has to tap **"Bestellung jetzt senden"** to hand the
order to WhatsApp themselves. The wish is to drop that step: pay, see
*"Bestellung erfolgreich"*, done — and the order reaches the restaurant on its
own.

It is the better experience and it closes the last hole through which a paid
order can go missing. It is also a change to what this site fundamentally is,
which is why it was deferred rather than rushed.

## Why it is not a refactor

**The privacy design inverts.** Today no name, phone or address reaches the
server — deliberately. `worker/payments/store.js` has no columns for them and
`migrations/0001_payments.sql` says why. That is the reason the
Datenschutzerklärung is short, there is no cookie banner, and the payment API
takes only a basket and a postcode.

Delivering the order server-side means the server must carry those details. That
brings:

- personal data stored, so a documented retention period and a rewritten
  Datenschutzerklärung (section 8 was already rewritten once — see the commit
  "Take payment on the site instead of asking for it afterwards")
- Meta added as a processor if the Cloud API is used
- **§ 312i Abs. 1 Nr. 3 BGB**: the contract now concludes on the website, so
  receipt must be confirmed without undue delay
- the § 312j button wording, already applied to the online-payment flow in
  `paintSendButton()`, would then apply to every order

## The agreed route

**WhatsApp Cloud API**, because the order lands in the Business App the
restaurant already watches. Email was considered and rejected — too easy to miss
mid-service. A kitchen page with a sound needs a device left open all evening.

## Sequence — do it in this order, nothing breaks at any point

1. **Send in parallel.** Keep the customer-facing handover exactly as it is. Add
   a Worker call that also sends the order to the restaurant via Cloud API after
   a successful capture. Two messages arrive; compare them.
2. **Confirm they always match**, over real service, for long enough to trust it.
   The `order.handed_over` event already records whether the customer sent
   theirs, so divergence is measurable rather than felt.
3. **Then** drop the customer-facing step and replace the confirmation screen
   with a plain success message.
4. Legal last, before step 3 goes live: Datenschutzerklärung, retention, § 312i
   confirmation.

## What already exists to build on

- `/api/reports/orders` — the kitchen page, basic auth on `REPORT_TOKEN`,
  showing settled payments and, highlighted, any paid order that never reached
  the chat.
- `order.handed_over` in `payment_events` — recorded by beacon when the guest
  taps send.
- `buildMessage()` in `order.js` — already produces the exact text the
  restaurant reads. Reuse it rather than writing a second format; it is the one
  place that knows how an order should read, including the `*!` flags.
- The `paidButNotSent` list in `/api/reports/settlement`.

## What to be careful about

- **`buildMessage()` runs in the browser** and reads the DOM for dish names. A
  server-side sender needs the same text built from `worker/pricing.js` line
  items instead. Do not let the two drift — that is the bug this codebase is
  organised to prevent.
- The WhatsApp redirect mangles some characters; `warn()` in `order.js` exists
  because `⚠` became `�` in transit. Cloud API may not have that problem, but
  do not assume it.
- Sandbox first. `sandboxOnProduction()` in `worker/index.js` is the pattern to
  copy: make it impossible to ship the test configuration to a real guest.
