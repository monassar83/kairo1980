# Being told an order exists

## The hole this closes

The money and the order have always travelled by different paths.

| | path | reaches the restaurant? |
| --- | --- | --- |
| The money | PayPal → signed webhook → D1 | always — it is server-side |
| The order | composed in the **guest's browser** → `wa.me` link → **guest taps send** | only if the guest finishes |

On 6 August 2026 a real customer paid, never completed the WhatsApp handover,
and the restaurant found out only because it happened to open `/admin`. The
payment was captured correctly; nothing failed. There was simply no server-side
path that said an order existed.

There is one now. It hangs off the transition to `captured` — the moment the
money is known to be real — and fires whether or not the guest's browser is
still alive.

Note that `/admin/orders` shows a "sent" tick against orders whose
`order.handed_over` event was recorded. That event fires when the guest **taps
the send button**, not when a message is delivered. A guest can tap, land in
WhatsApp and never press send. The tick is weaker evidence than it looks, which
is another reason the server has to say so itself.

## Why Telegram and not WhatsApp

The right answer is WhatsApp Cloud API — see `next-whatsapp-cloud-api.md`, this
is step 1 of that plan. It is not the answer *today* because **a number
registered to the Cloud API cannot also be signed in to the WhatsApp Business
App**, and that app is the one the restaurant actually watches during service.
Moving `+49 176 79906621` to the Cloud API would take the shop off the app it
runs on. The proper fix is a second number as the Cloud API sender, messaging
the existing number, plus a pre-approved message template — days of Meta
onboarding. This was minutes, and the hole was open.

Telegram is therefore a stopgap **that runs in parallel**, exactly as the plan's
step 1 requires. When Cloud API lands, this becomes a second channel or is
removed; nothing else has to change, because the call site is one function.

## What it sends, and what it never sends

```
NEUE BEZAHLTE BESTELLUNG

Referenz: K7F2-9QX
Art:      Lieferung — 68766
Betrag:   47,80 €
Bezahlt:  06.08. 19:42 (paypal)

2x Koshari
1x Molokhia

Der Gast sendet die Bestellung ggf. zusätzlich per WhatsApp.
```

No name, no phone number, no address — because the server has never held any
(`migrations/0001_payments.sql` says why). That is deliberate and it is what
keeps this change clear of the privacy rewrite that delivering the *full* order
server-side would require: a documented retention period, Meta as a processor,
and the § 312i BGB confirmation duty. Those land at **step 3** of the plan, when
the customer-facing send step is dropped — not here.

The reference is enough to match the order when the guest arrives or rings.

## Setting it up

1. In Telegram, message **@BotFather** → `/newbot` → follow the prompts. It
   replies with a token like `8134…:AAH…`.
2. Send any message to your new bot (a bot cannot open a conversation).
3. Get the chat id: open
   `https://api.telegram.org/bot<TOKEN>/getUpdates` and read
   `result[0].message.chat.id`.
4. Set both secrets:

```
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_CHAT_ID
```

Set neither and the notifier is **off**, not broken: the site behaves exactly as
it did before, which is the same call `worker/admin/auth.js` makes about its own
credentials. An unconfigured alert is not a broken one.

To alert more than one phone, make a Telegram group, add the bot, and use the
group's id — it is negative, e.g. `-1001234567890`.

## The guarantees

- **Once per order.** The send is gated on `changed` from `store.settle`, which
  moves a payment only from a status it may legally come from, in one
  conditional UPDATE. A double click, a provider retry and a replayed webhook
  all reach the same code and only the first notifies. It is the same replay
  guard the ledger uses, not a second one that could disagree with it.
- **Never fails a payment.** `sendOrderNotification()` never throws and never
  returns a rejected promise. By the time it runs the money is taken; a revoked
  token or a Telegram outage leaves the payment captured and the order in
  `/admin`, which is where it was before any of this existed.
- **Never delays the guest.** Handed to `ctx.waitUntil` on the browser path, so
  the confirmation screen does not wait for Telegram. On the webhook path it is
  awaited, because that code is already inside the webhook's own `waitUntil`.
- **Plain text, no parse mode.** A dish name containing `_` or `*` cannot break
  the send. A notification that fails to render is one that did not arrive.

Covered by `tests/integration/payment-flow.test.js` — announced once, announced
when the browser never comes back, not announced twice on a replay, harmless
when it fails, and absent when unconfigured.
