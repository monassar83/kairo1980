# Architecture

The site is deliberately a static, build-free set of files. Cloudflare serves
the repository directory as-is. There is no framework, no bundler and no
runtime dependency, which is why a change to opening hours is a one-line edit
and a deploy, not a release.

## The one rule

**Business facts live in exactly one place and everything else derives from
them.** If you find yourself typing a price, a postcode, an opening time or a
percentage into a second file, stop — that is the bug this architecture exists
to prevent.

| Fact | Single source | Derived by |
| --- | --- | --- |
| Opening hours, lunch flag | `config.js` → `hours` | hours table, live status, `openingHoursSpecification`, FAQ answer, corporate hours line |
| Delivery postcodes, fees, minimums | `data/delivery_zones.xlsx` | `zones.js` (generated) → basket fee, zone hints, delivery-area section, `areaServed` |
| Discounts, thresholds, lead time | `config.js` → `order`, `business` | basket totals, WhatsApp message, business cards, FAQ, hero badge |
| Menu items, prices, diet tags | `index.html` (`.mitem[data-item][data-price]`) | basket, `hasMenu` schema |
| Ratings | `reviews.json` (fetched) | carousel, `aggregateRating` |

The generated files (`zones.js`, `sitemap.xml`) carry a "do not edit" header
and CI fails the deploy if `zones.js` disagrees with the spreadsheet.

## Files

```
index.html    markup only — no inline script, no inline style
config.js     every business rule and feature flag
zones.js      GENERATED from data/delivery_zones.xlsx
order.js      hours, basket, WhatsApp handover, structured data
app.js        page chrome: language switch, scroll reveal, reviews carousel
style.css     all styles
_headers      cache policy and security headers, incl. CSP
```

`config.js` and `zones.js` load first, `order.js` consumes them, `app.js`
handles presentation. All four are `defer`, so order is guaranteed without
blocking the parser.

## Why the basket hands over to WhatsApp

A free-text chat order arrives without quantities, address or total and costs
a phone call to repair. The basket composes a complete, priced message and
keeps the conversation in WhatsApp, where the restaurant already answers. It
needs no backend and no database: nothing leaves the browser until the guest
presses send, which is also what keeps the site GDPR-clean.

Validation is **advisory, never blocking**. An unknown postcode, a closed-hours
slot or a sub-minimum order warns the guest and flags the message — it does not
refuse the order. An automatic rejection silently discards large orders and you
never learn they existed.

## Growing into multiple pages

The current single page is already sectioned along the lines the site will
eventually split on, and each section has a stable id that is also its future
URL:

| Section today | Future page | Already has |
| --- | --- | --- |
| `#speisekarte` | `/speisekarte` | own heading, Menu schema, orderable items |
| `#firmen` | `/firmenbestellungen` | own heading, business config flag |
| `#liefergebiet` | `/liefergebiet` | generated from zone data |
| `#faq` | `/faq` | FAQPage schema generated from the DOM |
| `#kontakt` | `/kontakt` | hours, map consent, contact data |

To split one out:

1. Create `<name>.html` reusing the same `<head>` block, the same four script
   tags and the same nav.
2. Move the `<section>` across unchanged — every section already renders itself
   from config and needs no page-specific code.
3. Add the URL to `PAGES` in `tools/build-sitemap.py`. The sitemap, its
   `lastmod` and the IndexNow ping follow automatically.
4. Set that page's `<link rel="canonical">` and keep the anchor on the home
   page pointing at the new URL.

`order.js` guards every render with an element lookup and returns quietly when
the element is absent, so a page containing only some sections works without
modification.

### Location pages

If local landing pages are ever added, write a small number with genuinely
unique content — the specific delivery time to that town, local landmarks,
what that town actually orders. Do **not** generate one per postcode from a
template: near-duplicate pages across 33 towns are doorway pages, which Google
penalises rather than rewards. Three good pages beat thirty thin ones.

## Deployment

Push to `main` → GitHub Actions → Cloudflare. The workflow checks that every
browser script parses, that `zones.js` matches the spreadsheet, and regenerates
`sitemap.xml` from git history before publishing. No local login, ever.

`fetch-reviews.yml` refreshes Google reviews weekly and then calls the deploy
workflow, because a push made by a GitHub Action does not trigger other
workflows on its own.

## Security posture

- Strict CSP with no `unsafe-inline`, which is why there is no inline script or
  style anywhere in the markup. Keep it that way.
- The Google Maps embed loads only after an explicit click.
- No cookies, no analytics, no third-party requests on load.
- Source data and tooling are excluded from publication via `.assetsignore`.
- Secrets live only in GitHub repository secrets.
