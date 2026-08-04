# Working on kairo1980.de

Static site for KAIRO 1980, an Egyptian restaurant in Hockenheim. Read this
before touching anything; it is the context that is expensive to rediscover.

## What this is

No build step, no framework, no bundler. Cloudflare Workers serves the repo
directory as it sits. A change to opening hours is a one-line edit and a push,
not a release. **Do not introduce a build step, a framework, or an npm
dependency the browser loads** — the whole design of the site is that the
restaurant can change a price without a developer.

There is one server, and it exists for one reason. `worker/` answers `/api/`
so that payments can be taken: deciding what an order costs, telling a provider
to take the money, and being told afterwards whether it worked cannot be done
in a browser without trusting the guest's own arithmetic. Everything that is
not `/api/` still falls through to the static files untouched. The npm
dependencies are wrangler and Playwright — build and test tooling only; nothing
is bundled into a page. See `docs/payments.md`.

Push to `main` deploys automatically. `.github/workflows/deploy.yml` checks
that every browser script parses and that `zones.js` still matches the
spreadsheet before publishing.

**That workflow is the only way anything reaches production, on purpose.**
Cloudflare's own Git integration — Worker Builds, configured in the dashboard
rather than in this repository — was connected once and disconnected on
4 August 2026. It deployed the same Worker on the same push, which is a race
whose winner is whichever finishes last, and it ran none of the guards this
deploy exists for: no parse check, no test suite, no `zones.js`-versus-
spreadsheet comparison, no D1 migration, no regenerated `sitemap.xml`, no
IndexNow ping. A green build there would have published a site that skipped
all of it. **Do not reconnect it.** If deploys ever appear to be broken, the
answer is in the Actions log, and usually in one of the two repository secrets
the workflow needs — `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. A
rolled token fails there the way a rolled build token failed in the dashboard:
loudly, and with a message that names everything except the cause.

## Files

```
index.html   markup only — no inline script, no inline style, ever
firmencatering.html  the corporate offer as its own URL (/firmencatering)
lang.js      language: detection, memory, direction, the switch (all pages)
config.js    every business rule and feature flag
zones.js     GENERATED from data/delivery_zones.xlsx — never hand-edit
order.js     hours, basket, WhatsApp handover, structured data
app.js       page chrome: scroll reveal, reviews carousel, map consent
qr.js        QR encoder, loaded on demand by the WhatsApp fallback only
pay.js       the payment step, loaded on demand when a guest pays online
style.css    all styles
_headers     cache policy + CSP

worker/      the /api/ routes: pricing, payments, webhooks, settlement
migrations/  the payments schema (D1)
tests/       unit + integration (node --test) and e2e (Playwright)
```

Load order is `lang.js` → `zones.js` → `config.js` → `order.js` → `app.js`,
all `defer`. `qr.js` and `pay.js` are fetched at runtime, never on page load.
That order is load-bearing in the Worker too: `worker/site-data.js` imports the
very same `zones.js` and `config.js`, in the same order, rather than keeping a
second copy of a price or a postcode on the server.

## The one rule

**A business fact lives in exactly one place; everything else derives from it.**
If you are about to type a price, a postcode, an opening time or a percentage
into a second file, stop — that is the bug this architecture exists to prevent.

| Fact | Single source |
| --- | --- |
| Hours, lunch start date, lunch delivery | `config.js` → `hours` |
| Payment on arrival, the online switch | `config.js` → `payment` |
| PayPal credentials, which online methods are live | Cloudflare secrets + `wrangler.jsonc` vars, served by `/api/payments/config` |
| Postcodes, fees, minimums | `data/delivery_zones.xlsx` → `zones.js` |
| Discounts, thresholds, lead time, basket lifetime | `config.js` → `order`, `business` |
| Who the minimum order value is asked of | `config.js` → `order.minimumOrder` |
| Dishes, prices, diet tags | `index.html` `.mitem[data-item][data-price]` |
| Ratings and reviews | `reviews.json` (fetched weekly) |
| Every visible string | `data-de` / `data-en` / `data-ar` on the element itself |

Translated copy carries `{placeholders}` (e.g. `{freeDeliveryFrom}`) that
`applyConfig()` in order.js fills at runtime. The literal numbers in the markup
are only the no-JavaScript fallback — update both or neither.

## Hard constraints

- **Strict CSP.** No `<script>`, no `style="…"` and no
  `onclick=` in the markup. There is exactly one exception and it is narrow:
  the ordering page (`/` only) allows the named PayPal hosts, and `style-src`
  there gains `'unsafe-inline'` because the checkout SDK styles what it
  injects. `script-src` stays strict everywhere, and impressum and datenschutz
  keep the untouched policy. That one policy is set by the Worker
  (`CHECKOUT_CSP` in `worker/index.js`), **not** in `_headers` — a per-path
  rule there does not override the `/*` rule, it loses to it, which is why
  `run_worker_first` names `/`. Event wiring goes through the delegated
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

- **The two delivery rules are asked by name, never re-derived.**
  Free delivery is one threshold for every order — company and private are the
  same trip to a driver, so there is no switch to narrow it. The minimum order
  value is asked only of a private order that has to be driven out: never of a
  collection, never of a company. Both live in `config.js`
  (`business.freeDeliveryFrom`, `order.minimumOrder`) and are asked through
  `freeDeliveryQualifies()` / `minimumApplies()` — the same two names in
  `order.js` and in `worker/pricing.js`. The server cannot trust the browser's
  answer, but it must never give a different one. `totals()` answers
  `belowMinimum` once, so the basket, the send button and the WhatsApp message
  cannot each reach their own verdict.
- **A rule that qualifies a number is printed with it, from the rule.**
  `{minimumClause}` and `{freeDeliveryAll}` are written by `applyConfig()` the
  way `{lunchClause}` is, and fall silent by themselves when the rule they
  describe no longer needs saying. Never type "gilt nur für private
  Lieferbestellungen" into copy: that is the sentence that goes stale the day
  the rule changes, in the one place nobody thinks to look.
- **The corporate offer has a URL, and the homepage section is a teaser.**
  `#firmen` keeps the heading, the lead, the two figures and one button, and
  hands the reader on; `/firmencatering` carries the formats, the allergen
  declaration, the diet tags, the invoice and § 19 UStG, and is the only place
  any of that is written. Hub and spoke: the homepage sells the idea to someone
  already reading it, the page answers a search for *Firmencatering Walldorf*,
  which a `#fragment` never can. Do not let the teaser grow the detail back —
  two pages saying the same thing is how a site competes with itself. `order.js` runs there for what it knows, not for the basket —
  it builds no basket on a page carrying no `.mitem`, which also keeps the
  checkout away from a page the relaxed CSP does not name.
- **A page's canonical URL is written once, in its own `<link rel="canonical">`.**
  `lang.js` reads that href at load and appends `?lang=` to it for the two
  non-German readings, so the canonical and the hreflang set always agree and a
  new page needs nothing but a correct href. It used to read a `data-base`
  attribute whose fallback was the homepage, which meant impressum and
  datenschutz — neither of which carried one — declared the homepage as their
  canonical the moment the script ran, and asked Google to drop them as
  duplicates. Do not reintroduce a second attribute holding the same URL: the
  bug was not the missing attribute, it was that the URL was written twice.
  `tests/e2e/seo.spec.js` holds every page to it, in the rendered DOM.
- **The menu is a section, not a page.** `#speisekarte` is the homepage's
  primary content and the address printed on the Google and Apple place cards.
  It stays there because the basket and the checkout CSP both belong to `/`,
  because the homepage already emits the whole menu as `hasMenu` structured
  data, and because a `/speisekarte` page would compete with `/` for the one
  search the homepage exists to win. This is the opposite call to
  `/firmencatering`, and for the opposite reason: *Firmencatering Walldorf* is
  a search the homepage cannot answer, "Speisekarte" is the search it IS.
- **A page that can be found alone must be complete alone.** Whoever lands on
  `/firmencatering` from a search may never see the menu, so LMIV, the PAngV
  price notice and § 19 UStG are stated there in full rather than one click
  away. Its `Service` node names the Restaurant by `@id` instead of describing
  a second business, and asserts only what the page renders — the formats are
  read out of the cards that describe them, so a format deleted from the page
  leaves the markup with it.
- **The basket hands over to WhatsApp.** The order itself still goes nowhere
  but the guest's own chat: no name, address or phone number is ever sent to
  our server, and the payment API receives only the basket and the postcode.
  What ties a payment to an order is the short reference printed in both.
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
- **Payment is chosen before the order is sent.** The outcome travels in the
  WhatsApp message, because whoever answers the chat has to know whether the
  money is already in — and under which reference — or whether to take the
  terminal to the counter or send the driver for cash. What is offered comes from `payment.onSite` per order type —
  the terminal stands in the shop, so a delivery is cash only until a driver
  carries one.
- **Payment is a payment, not a link.** PayPal.Me is gone: its amount was
  editable by the payer and nothing reported back, so every order had to be
  checked by hand. The checkout takes the money through PayPal Checkout and
  records the result, so a paid order reaches the chat already marked paid,
  with its reference.
- **The checkout is built around payment methods, not around PayPal.** The
  guest picks Apple Pay, Google Pay, card or PayPal. PayPal processes all four,
  and three of them — the wallets and the card — are guest checkout: no PayPal
  account, no sign-in, the guest never sees the name. A second provider is one
  file in `worker/payments/` plus a line in `providers.js`, never a change to
  the checkout.
- **The server says what is possible; the browser draws what is real.** Apple
  Pay and Google Pay need PayPal's Advanced Checkout enabled for the merchant
  AND a device that has the wallet, and neither fact is knowable server-side.
  So `pay.js` asks the SDK per method and skips whatever is ineligible. Do not
  move that decision into config: the point is that the wallets appear on their
  own the day PayPal approves the account, with no edit and no deploy.
- **The server prices the order; the browser only says what is in the basket.**
  No amount, discount or fee is ever read from a request body. The prices are
  read out of `index.html` itself through the ASSETS binding.
- **Payment happens before the WhatsApp handover, and never blocks the order.**
  Paying first means the restaurant is told the truth in one message. But every
  failure — declined, cancelled, SDK blocked, provider down — offers the same
  way out: send the order anyway and pay on arrival. Losing an order to a
  refused card costs more than taking cash at the door.
- **A payment can only be captured once.** `worker/payments/store.js` moves a
  payment only from a status it may legally come from, in one conditional
  UPDATE, and `payment_events.event_key` is UNIQUE. Those two facts are what
  make a double click, a provider retry and a replayed webhook all harmless.
  Do not add a code path that writes `status` directly.
- **The webhook is the source of truth, and is verified with PayPal before it
  is believed.** A browser redirect only says the guest came back; it does not
  say the money arrived.
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
