# Taking the order ourselves

Today an order leaves the basket as a pre-written message in the guest's own
WhatsApp, and the restaurant reads it in the app. That has carried the business
this far and it has two costs that only grow:

- **Nothing knows an order exists.** The server sees payments and nothing else,
  so there can be no order screen, no live notification, no "you have three
  open orders", and no way to tell a guest their food is on its way.
- **The guest has to have WhatsApp, and has to press send.** A basket that
  reaches the handover and stops there is an order nobody ever sees. The
  `paidButNotSent` list on `/admin/orders` exists because that already happens.

This is the plan for taking the order onto our own server and using the
WhatsApp Cloud API to talk to the guest — rather than relying on the guest to
talk to us.

**Status: designed and partly built, on the branch `next/orders-and-push`.
Nothing here is live and nothing is on `main`.** Every route is behind
`WHATSAPP_ENABLED`, which is absent, and absent means off.

---

## What has to happen on your side

None of this is code, and none of it can be done from here. It is also the
critical path: the rest waits behind business verification.

### 1. Decide about the phone number — do this first

A number registered on the Cloud API **cannot also be used in the WhatsApp
Business app**. `+49 176 79906621` is in the app today, and registering it for
the API takes it out of the app permanently. There are two ways and they are
not equally reversible.

| | Migrate the existing number | Take a second number |
| --- | --- | --- |
| Place cards, printed menus | Keep working — same number | Name the old number, which stays human-answered |
| The Business app | Stops working for that number | Keeps working |
| Conversation history | Migrates once, then API only | Stays where it is |
| If we change our minds | Slow — deregistering and re-adding to the app is not instant | Trivial: stop using the second number |
| During the build | Everything is live at once | The two can run side by side |

**Recommended: a second number for the API.** It lets the new pipeline run
beside the old one until it is trusted, and the migration becomes a decision
rather than a cutover. A cheap prepaid SIM that can receive one SMS is enough —
the number only ever needs to receive its verification code once.

### 2. Meta, in this order

1. **Business Portfolio** at `business.facebook.com`. You may already have one
   from Instagram — reuse it rather than making a second.
2. **Business verification.** Meta wants to see that KAIRO 1980 is a real
   business: Gewerbeanmeldung or a Handelsregister extract, the address as it
   appears on the impressum, and a phone number they can reach. **Days, and
   sometimes weeks.** Start it before anything else here. Unverified accounts
   are capped at a handful of recipients, which is fine for testing and not for
   a restaurant.
3. **A Meta app** at `developers.facebook.com` — type *Business* — with the
   **WhatsApp** product added.
4. **A WhatsApp Business Account (WABA)**, created through that app.
5. **Add the phone number** from step 1 and verify it by SMS.
6. **Display name.** The name a guest sees above the messages. `KAIRO 1980`.
   Meta reviews it; it must match the business, so this is another reason the
   verification comes first.
7. **A payment method** on the WABA. Conversations are billed. For a
   restaurant answering guests who wrote first, the cost is small — but there
   is no free tier that needs no card on file.
8. **A System User** in Business Settings, with a **permanent** access token
   scoped to `whatsapp_business_messaging` and `whatsapp_business_management`.
   The token the dashboard shows you first expires in 24 hours and is for
   trying things, not for running on.

### 3. Then five values, and I do the rest

Set as Cloudflare secrets, never in this repository:

```
npx wrangler secret put WHATSAPP_TOKEN              # the permanent System User token
npx wrangler secret put WHATSAPP_PHONE_NUMBER_ID    # from the WhatsApp product page
npx wrangler secret put WHATSAPP_BUSINESS_ID        # the WABA id
npx wrangler secret put WHATSAPP_APP_SECRET         # App Settings -> Basic
npx wrangler secret put WHATSAPP_VERIFY_TOKEN       # any long random string; you choose it
```

The webhook callback URL to give Meta is
`https://kairo1980.de/api/webhooks/whatsapp`, subscribed to the **`messages`**
field. It is already written and already verifies signatures; it answers
Meta's `hub.challenge` handshake as soon as `WHATSAPP_VERIFY_TOKEN` is set.

### 4. Message templates

Inside 24 hours of a guest writing to us, we may reply freely. Outside that
window every business-initiated message must be an **approved template**. Three
are worth submitting, all category *Utility*:

| Name | When | Body |
| --- | --- | --- |
| `order_received` | The moment an order is placed | Order {{1}} received — {{2}}. We will confirm shortly. |
| `order_confirmed` | The kitchen accepts it | Order {{1}} confirmed for {{2}}. |
| `order_ready` | Collection is ready / driver leaving | Order {{1}} is on its way / ready to collect. |

Templates are reviewed in hours, not weeks, but they cannot be submitted before
the WABA exists.

---

## What the change actually is

```
                          today                         after

  basket ──► wa.me link ──► guest's WhatsApp     basket ──► POST /api/orders
                                │                              │
                                ▼                              ├──► D1 `orders`
                          restaurant reads                     ├──► WhatsApp Cloud API
                          the app                              │      (message to the guest)
                                                               └──► Web Push
                                                                      (sound on your phone)
```

The order becomes a row before anybody is told about it. Everything else — the
notification, the order screen, the confirmation to the guest — reads that row.
That is the whole point: **an order that exists only as a message cannot be
counted, listed, or alerted on.**

### What does not change

- **The server still prices the order.** `POST /api/orders` takes a basket and
  a postcode, exactly as `POST /api/payments` does, and reads every price out
  of `index.html`. No amount is ever read from a request body.
- **Payment stays where it is.** An order may be paid online before it is
  placed, or paid on arrival. The `payments` table is unchanged and the
  reference printed in both is what ties them together.
- **The switch and the hours still decide what is orderable.** `/api/orders`
  applies `wantedAfterClosure` exactly as the payment route does.

### What we take on that we did not have before

Personal data. Today a name, address and phone number never touch this server;
after this they must, because we are placing the order rather than composing a
message. That is not a technical detail:

- `datenschutz.html` needs a section on order data — what is stored, why, on
  what legal basis (Art. 6(1)(b) DSGVO, performance of a contract), and for how
  long.
- A retention rule, and something that enforces it. Orders are business records
  under § 147 AO but the *contact details* are not; the sensible line is to
  keep the order and drop name, address and phone after a short period.
- § 312i BGB: an electronically placed order needs a confirmation of receipt
  without undue delay. The `order_received` template is that confirmation, and
  it stops being a nicety.

**None of that is optional and none of it is built.** It belongs in the same
piece of work as the pipeline, not after it.

---

## Order of work

1. ~~Schema, pricing and the write path — an order can be created and read.~~ **Built.**
2. ~~The Cloud API client and the webhook, signature-verified, flag-off.~~ **Built.**
3. ~~Web Push, so a new order makes a sound on a phone.~~ **Built** — see `docs/notifications.md`.
4. The order screen at `/admin/orders`, replacing the payments-only view.
5. The basket posts to `/api/orders` instead of building a `wa.me` link.
   Behind a config flag, so the old path stays until the new one is trusted.
6. Datenschutz, retention, § 312i confirmation. **Before any of this is live.**

Steps 1–3 are on the branch and cannot do anything: `WHATSAPP_ENABLED` is
unset. Steps 4 and 5 are the ones that change what a guest sees, and step 6
gates all of it.
