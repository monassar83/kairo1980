# Working on kairo1980.de

Static site for KAIRO 1980, an Egyptian restaurant in Hockenheim. Read this
before touching anything; it is the context that is expensive to rediscover.

## What this is

No build step, no framework, no bundler, no dependencies. Cloudflare Workers
serves the repo directory as it sits. A change to opening hours is a one-line
edit and a push, not a release. **Do not introduce a build step, a framework or
an npm dependency** — the whole design of the site is that the restaurant can
change a price without a developer.

Push to `main` deploys automatically. `.github/workflows/deploy.yml` checks
that every browser script parses and that `zones.js` still matches the
spreadsheet before publishing.

## Files

```
index.html   markup only — no inline script, no inline style, ever
lang.js      language: detection, memory, direction, the switch (all pages)
config.js    every business rule and feature flag
zones.js     GENERATED from data/delivery_zones.xlsx — never hand-edit
order.js     hours, basket, WhatsApp handover, structured data
app.js       page chrome: scroll reveal, reviews carousel, map consent
qr.js        QR encoder, loaded on demand by the WhatsApp fallback only
style.css    all styles
_headers     cache policy + CSP
```

Load order is `lang.js` → `zones.js` → `config.js` → `order.js` → `app.js`,
all `defer`. `qr.js` is fetched at runtime, never on page load.

## The one rule

**A business fact lives in exactly one place; everything else derives from it.**
If you are about to type a price, a postcode, an opening time or a percentage
into a second file, stop — that is the bug this architecture exists to prevent.

| Fact | Single source |
| --- | --- |
| Hours, lunch start date, lunch delivery | `config.js` → `hours` |
| Payment methods, PayPal | `config.js` → `payment` |
| Postcodes, fees, minimums | `data/delivery_zones.xlsx` → `zones.js` |
| Discounts, thresholds, lead time, basket lifetime | `config.js` → `order`, `business` |
| Dishes, prices, diet tags | `index.html` `.mitem[data-item][data-price]` |
| Ratings and reviews | `reviews.json` (fetched weekly) |
| Every visible string | `data-de` / `data-en` / `data-ar` on the element itself |

Translated copy carries `{placeholders}` (e.g. `{freeDeliveryFrom}`) that
`applyConfig()` in order.js fills at runtime. The literal numbers in the markup
are only the no-JavaScript fallback — update both or neither.

## Hard constraints

- **Strict CSP, no `unsafe-inline`.** No `<script>`, no `style="…"` and no
  `onclick=` in the markup. Event wiring goes through the delegated
  `[data-action]` / `[data-act]` handlers. Setting `el.style.x` from JS is
  fine (CSSOM, not an inline attribute); parsing a style attribute is not.
- **Trilingual: German, English, Egyptian Arabic.** Every visible string needs
  `class="t" data-de="…" data-en="…" data-ar="…"` or it will not switch.
  Generated text must repaint on the `kairo:lang` event, and every key in the
  `T` table in order.js must exist in all three dictionaries — they are checked
  against each other, not filled in later. `data-t="content|alt|aria-label|
  placeholder|title"` writes an attribute instead of the text; `data-t="html"`
  is for legal prose that contains a link, and is used nowhere else.
- **Arabic is a direction, not a stylesheet.** The layout mirrors because every
  rule is written in logical properties (`margin-inline`, `border-inline-start`,
  `text-align: start`) and `lang.js` sets `dir="rtl"`. Do not add a physical
  `left`/`right` property: it will be correct in two languages and wrong in the
  third. The only `[dir="rtl"]` rules that may exist are the ones direction
  cannot express — a mirrored arrow, a drop shadow, and the LTR isolation that
  keeps "+49 176 79906621" and "11,00 €" from being reordered inside an Arabic
  sentence.
- **Arabic typography is not Latin typography.** No `letter-spacing` and no
  `text-transform` — the script is cursive and has no capitals; both are
  switched off under `:root[lang="ar"]`, and the small-caps labels get size and
  weight instead. Amiri for display, Cairo for text, both self-hosted and both
  behind a `unicode-range` so no Latin reader ever downloads them.
- **`zones.js` is generated.** Edit `data/delivery_zones.xlsx`, then
  `python tools/build-zones.py`. CI fails the deploy if the two disagree.
- **No third-party requests on load.** No fonts CDN, no analytics, no cookies.
  The Google Maps embed loads only after an explicit click.
- **Validation is advisory, never blocking.** An unknown postcode, a closed
  slot or a sub-minimum order warns the guest and flags the WhatsApp message —
  it never refuses the order. Losing one €300 corporate order to an automatic
  rejection costs more than reading a message and saying no.

## Things that are the way they are on purpose

- **The basket hands over to WhatsApp.** No backend, no database; nothing
  leaves the browser until the guest presses send. That is also what keeps the
  site GDPR-clean.
- **A service that has not started yet is advertised, not opened.**
  `hours.lunch.startsOn` publishes the lunch service as marketing copy while
  keeping it out of the opening-hours table, the "open now" badge, the indexed
  `openingHoursSpecification` and every orderable slot. On that date it becomes
  an ordinary window by itself — launch day needs no edit and no deploy. The
  announced day is the first day at or after `startsOn` that actually has a
  lunch window, so it can never name one of the closed days.
- **Lunch delivery is one word, and one word only.**
  `hours.lunch.delivery: false` makes midday collection-only. It disables the
  delivery button for a lunch slot, corrects `form.type`, and rewrites the
  business section, the hours rows, the delivery area, the FAQ and the corporate
  answer from the same sentence (`lunchNotice()`). Never write the restriction
  into copy by hand — that is how the site ends up promising delivery in one
  paragraph and refusing it in the next. The public wording states the fact
  only; the reason is nobody's business but ours.
- **The delivery button is dimmed, never removed.** It is the one place
  validation withholds anything, and it withholds an option, not an order: a
  missing button reads as a broken page, so it stays visible with the note that
  names pickup and the evening alternative.
- **Payment is chosen before the order is sent.** The method travels in the
  WhatsApp message, because whoever answers the chat has to know whether to
  watch for a PayPal payment, take the terminal to the counter or send the
  driver for cash. What is offered comes from `payment.onSite` per order type —
  the terminal stands in the shop, so a delivery is cash only until a driver
  carries one.
- **PayPal is a link, not an integration.** `paypalMe` + `prepayOnline` produce
  a paypal.com URL carrying the exact amount. No SDK, no cookie, no
  third-party request, so the strict CSP and the consent-free privacy policy
  both survive. What it cannot do is confirm payment: the amount in a
  PayPal.Me link is editable by the payer and nothing reports back to the page,
  so the received total must be checked in PayPal against the order. Anything
  better than that needs a Worker with `main` and PayPal REST credentials —
  which is a backend, and therefore a decision, not a refactor.
- **The basket expires.** `order.cartLifetimeMinutes` (120) is a sliding
  window: long enough to survive a reload, short enough that a guest returning
  tomorrow does not meet a stale order at last week's prices.
- **Review text is never translated.** It is a quoted statement by a named
  person. Only the chrome around it — score, count, relative date, buttons —
  follows the language switch. Review dates are formatted from `publishTime`
  with `Intl.RelativeTimeFormat`, falling back to Google's German string.
- **`aggregateRating` is only ever emitted for figures actually rendered.**
  Inventing them is a structured-data violation.
- **Diet tags are a selling point, not a footnote.** Green = vegan, olive =
  vegetarian, both with a leaf. Do not shrink them back into hairline text.
- **One primary order route.** The menu and its basket. Lieferando and Uber
  Eats are secondary and labelled as alternatives — they charge commission.
  Resist adding more order buttons; every extra one splits the same intent.
- **Hairlines: exactly one line between any two things.** Rows carry their own
  rule (`border-top` in the delivery list, `border-bottom` in the menu with the
  last item of each category cleared). Do not add a container rule on top of
  a list whose rows already draw one — that is where doubled lines come from.
- **The reviews carousel has a fixed height** so the page cannot jump every
  five seconds. The height comes from the 5-line clamp, not from the longest
  review. Longer reviews get "Mehr lesen".

## Brand, and what is never translated

KAIRO 1980 is a brand: the name, the logo, the domain, `info@kairo1980.de`,
the WhatsApp number, the Instagram handle, Lieferando, Uber Eats, Google,
PayPal, `Fritz Kola`, the street address and every technical identifier are the
same string in all three languages. They carry no `data-*` attributes, so no
switch can touch them. German statute citations (§ 5 DDG, § 139c AO, Art. 6
DSGVO) stay in German in the English and Arabic legal texts — a translated
citation is not a citation. **Dish names are identical in German and English**
— the printed menu, the shop signage and the delivery platforms all use the
same spelling — and are written in Arabic script only on the Arabic page.

## Legal pages

`impressum.html` and `datenschutz.html` carry all three languages in the same
markup. **German is the binding version**; the English and Arabic texts show a
notice saying so, which is empty in German (`.legal-note:empty` hides it). The
German wording was never retyped when the translations were added — it was read
out of the file and put back — so the binding text cannot drift.

## Local preview

```
python -m http.server 8788
```

`config.js` behaves exactly as it will in production.

## Email

`info@kairo1980.de` runs on Cloudflare Email Routing, forwarding to a personal
Gmail. DNS (MX, SPF, DKIM, DMARC) is in place. To check whether the address
actually accepts mail, an SMTP `RCPT TO` probe against `route1.mx.cloudflare.net`
answers definitively without sending anything — `550 5.1.1 Address does not
exist` means the routing rule is missing or its destination is unverified.
