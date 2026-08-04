# Business listing content pack

Everything below is ready to paste. The only things that cannot be prepared
for you are the ones requiring your identity: logging in, proving ownership,
and pressing submit.

Keep this file as the master copy. If the address, phone or hours ever change,
change them here and on every platform in the same sitting — inconsistent
name/address/phone data across directories is one of the few things that
demonstrably suppresses local rankings.

---

## 1. Canonical business data (NAP)

Use these EXACT strings everywhere. Do not reformat the phone number, do not
abbreviate "Straße", do not add a second address line.

| Field | Value |
| --- | --- |
| Business name | `KAIRO 1980` |
| Street | `Rostocker Straße 20a` |
| Postcode / City | `68766 Hockenheim` |
| Country | `Deutschland` |
| Phone | `+49 176 79906621` |
| Email | `info@kairo1980.de` |
| Website | `https://kairo1980.de` |
| Latitude / Longitude | `49.3298953`, `8.5472743` |

**Opening hours.** These are a second copy of `config.js` → `hours`, and the
only ones on this page that a directory cannot derive for itself. Read them out
of `config.js`, never from memory.

Until **4 August 2026** (evening service only):

```
Monday        closed
Tuesday       closed
Wednesday     18:00–23:00
Thursday      18:00–23:00
Friday        18:00–23:00
Saturday      18:00–23:00
Sunday        18:00–23:00
```

From **5 August 2026**, when `hours.lunch.startsOn` falls due — two windows a
day, entered as two intervals on the same weekday wherever the platform allows
it (Apple, Google and Bing all do):

```
Monday        closed
Tuesday       closed
Wednesday     11:00–14:30, 18:00–23:00
Thursday      11:00–14:30, 18:00–23:00
Friday        11:00–14:30, 18:00–23:00
Saturday      11:00–14:30, 18:00–23:00
Sunday        11:00–14:30, 18:00–23:00
```

> The website switches itself on that date. **The directories do not** — put
> the two intervals into every platform on 5 August, in one sitting.
>
> On the same day, add the lunch window to the static `openingHoursSpecification`
> block in `index.html`. `order.js` rewrites that JSON-LD from `config.js` for
> anything that runs scripts, but the block in the markup is the fallback for
> anything that does not — and a fallback that says "18:00–23:00" is a crawler
> telling Siri we are closed at noon.
>
> Midday is **collection only** (`hours.lunch.delivery: false`). No directory
> has a field for that, so it belongs in the description or a Showcase, never
> in the hours: the shop *is* open at midday. Do not let a platform's delivery
> hours claim otherwise where they can be set separately.

---

## 2. Categories

Pick the first as primary, add the rest as secondary where the platform allows.

1. **Egyptian restaurant** / `Ägyptisches Restaurant`
2. Middle Eastern restaurant / `Orientalisches Restaurant`
3. Delivery service / `Lieferservice`
4. Caterer / `Catering`
5. Vegetarian restaurant / `Vegetarisches Restaurant`

Attributes to tick where offered: delivery, takeaway, vegetarian options,
vegan options, halal, wheelchair-accessible entrance (only if true), cash
payment, catering, LGBTQ+ friendly (only if you wish).

---

## 3. Descriptions

### Short (max 100 characters)
```
Moderne ägyptische Küche in Hockenheim — Koshary, Hummus, Hawawshy. Lieferung & Abholung.
```

### Medium (max 300 characters)
```
KAIRO 1980 bringt moderne ägyptische Küche nach Hockenheim: Koshary, Hummus, Baba Ghanough, Hawawshy und ägyptisches Streetfood, alles frisch nach Bestellung zubereitet. Wir liefern in über 30 Orte im Rhein-Neckar-Kreis. Firmen- und Büro-Catering mit Vorlauf auf Anfrage.
```

### Long (Google Business Profile, max 750 characters)
```
KAIRO 1980 ist ein ägyptisches Restaurant und Lieferservice in Hockenheim. Wir kochen die Gerichte, mit denen viele Ägypter aufgewachsen sind: Koshary, das Nationalgericht aus Linsen, Reis und Pasta, cremiges Hummus, rauchiges Baba Ghanough, herzhaftes Hawawshy aus dem Ofen und Klassiker der ägyptischen Straßenküche. Jedes Gericht wird erst nach Ihrer Bestellung frisch zubereitet, mit hausgemachten Saucen und ohne Fertigprodukte. Ein großer Teil der Karte ist vegan oder vegetarisch.

Wir liefern in über 30 Orte rund um Hockenheim, darunter Schwetzingen, Ketsch, Walldorf, Wiesloch, Heidelberg, Mannheim und Speyer. Abholung ist ebenfalls möglich. Für Büros und Firmen bieten wir Catering für Meetings und Team-Lunches an.
```

### English (for platforms serving both languages)
```
KAIRO 1980 is an Egyptian restaurant and delivery service in Hockenheim. We cook the dishes many Egyptians grew up with: Koshary, the national dish of lentils, rice and pasta, creamy hummus, smoky baba ghanough, oven-baked hawawshy and Egyptian street food classics. Every dish is prepared fresh after you order, with homemade sauces and no ready-made products. A large part of the menu is vegan or vegetarian. We deliver to more than 30 towns around Hockenheim and offer catering for offices and companies.
```

---

## 4. Keywords / services to list

Where a platform accepts a services or keywords list:

```
Ägyptisches Restaurant, Koshary, Hummus, Hawawshy, Baba Ghanough, Foool,
Om Ali, Kebda, ägyptisches Streetfood, orientalische Küche, Lieferservice
Hockenheim, Essen bestellen Hockenheim, Büro Catering, Firmencatering,
Business Lunch, vegetarisches Essen, veganes Essen, Mittagessen Büro,
arabisches Essen, Rhein-Neckar
```

Service areas — enter all of these where the platform supports a delivery
area. They match `data/delivery_zones.xlsx` exactly:

```
Hockenheim, Reilingen, Neulußheim, Altlußheim, Ketsch, Ladenburg,
Edingen-Neckarhausen, Walldorf, St. Leon-Rot, Sandhausen, Schwetzingen,
Plankstadt, Waghäusel, Oberhausen-Rheinhausen, Brühl, Eppelheim, Wiesloch,
Philippsburg, Rauenberg, Heidelberg, Schifferstadt, Mannheim, Speyer, Bruchsal
```

---

## 5. Images to upload

Use what the repository already contains, in this priority order:

| Purpose | File | Notes |
| --- | --- | --- |
| Logo / profile | `images/logo-mark.png` | 680×586, transparent |
| Cover / hero | `images/hero-1920.webp` or `images/hero.jpg` | 1920×1280 |
| Square avatar | crop `images/logo-mark.png` to 1:1 | most platforms want square |

**You still need to take these** — they matter more than any text on this page,
and their absence is the single biggest gap in the listings:

- 5–10 photos of actual dishes, daylight, plain background
- 2–3 photos of the premises, inside and the entrance from the street
- 1 photo of the team

Platforms rank and convert on photo count and freshness. Add a few every month.

---

## 6. Platform-by-platform

### Google Business Profile — highest impact
<https://business.google.com>

| Field | URL |
| --- | --- |
| Website | `https://kairo1980.de` |
| Menu link / Speisekarte | `https://kairo1980.de/#speisekarte` |
| Order online / Online-Bestellung | `https://kairo1980.de/#speisekarte` |
| Posts about catering | `https://kairo1980.de/firmencatering` |

Three things about that table, all of which cost money if they are got wrong:

- **No UTM parameters, and no tracking suffix of any kind.** A tagged URL is a
  second address for the same page. The site runs no analytics, so the tag
  would buy nothing and cost the tidy address it replaced.
- **The menu is a fragment on purpose**, not a page of its own — see
  `CLAUDE.md`. `#speisekarte` is where the basket is, so the button that says
  "Speisekarte" lands on a menu a guest can order from rather than on one they
  then have to leave. The homepage's `hasMenu` structured data carries every
  dish, section, price and diet tag, so Google reads the full menu from `/`
  whatever the link says.
- **Google will offer to fill "Order online" from an ordering partner** —
  Lieferando and Uber Eats both feed it. Decline it, or set our own link as the
  preferred one where Google allows it. A partner button here hands away
  commission on an order Google delivered to us for nothing, and it costs the
  guest the 10 % direct discount. Same reasoning as the Apple place card.

Then:

1. Claim/verify the listing (postcard, phone or video — Google decides).
2. Paste the long description, categories and service areas above.
3. Add the menu: Products → use the dish names and prices from the website.
4. Turn on messaging if you want WhatsApp-style enquiries.
5. Post once a week. Even a photo with one sentence counts.
6. **Reply to every review**, positive and negative. This is the highest-value
   recurring task on this entire list.

### Bing Places
<https://www.bingplaces.com>

Bing can import directly from Google Business Profile — do the Google listing
first, then use "Import from Google My Business". Verify and submit. Ten
minutes of work once the Google listing is complete.

### Bing Webmaster Tools
<https://www.bing.com/webmasters>

1. Add site `https://kairo1980.de`.
2. Verify — **easiest option: "Import from Google Search Console"**, since the
   site already carries a Google verification file.
3. Submit `https://kairo1980.de/sitemap.xml`.
4. IndexNow is already wired: the deploy workflow pings it on every release and
   the key file is served at
   `https://kairo1980.de/168e760065044f7d27e17028d7ef2c88a1e8c5a1b83da9f1.txt`.
   Nothing to configure there.

### Apple Business — powers Apple Maps, Siri and Spotlight
<https://business.apple.com> (Apple Business Connect was folded into
"Apple Business" in April 2026; claimed locations and place cards carried over,
the old URL redirects)

Frequently neglected, and a meaningful share of German phone users never touch
Google Maps. It has its own section below — the place card has fields no other
platform has.

### Also worth claiming
- **Apple/Yelp**: Yelp feeds several downstream directories.
- **Das Örtliche**, **Gelbe Seiten**, **11880** — German directories that still
  carry local weight.
- Keep **Lieferando** and **Uber Eats** name/address/phone identical to the
  table above.

---

## 7. Apple Business, field by field

The place card feeds Apple Maps, Siri, Spotlight, the Apple Intelligence
answers on iOS and every car running CarPlay. Paste exactly this.

### Identity

| Field | Value |
| --- | --- |
| Business name | `KAIRO 1980` — nothing appended. "KAIRO 1980 Ägyptisches Restaurant" is keyword stuffing and is a documented rejection reason |
| Primary category | Restaurant → **Egyptian** (`Ägyptisch`). If the cuisine list has no Egyptian entry, use Middle Eastern and say Egyptian in the description |
| Secondary categories | Middle Eastern · Delivery · Caterer · Vegetarian (as far as the tree allows) |
| Phone | `+49 176 79906621` |
| Website | `https://kairo1980.de` |
| Address | `Rostocker Straße 20a`, `68766 Hockenheim`, Deutschland |
| Pin | `49.3298953, 8.5472743` — then drag the pin to the actual entrance and set the arrival point, so directions end at the door and not on the through road |

### About / description

The field takes 500 characters and one text per language. Apple shows the
visitor's own language and falls back to German, so every version has to stand
on its own — these are not translations of a sentence order, they are the same
facts written natively. Nothing dated goes in here: a launch date belongs in a
Showcase, which expires by itself.

German (493 characters):
```
KAIRO 1980 kocht moderne ägyptische Küche in Hockenheim: Koshary, das Nationalgericht aus Linsen, Reis und Pasta, cremiges Hummus, rauchiges Baba Ghanough und Hawawshy aus dem Ofen. Jedes Gericht wird erst nach Ihrer Bestellung frisch zubereitet, mit hausgemachten Saucen und ohne Fertigprodukte. Ein großer Teil der Karte ist vegan oder vegetarisch. Wir liefern in über 30 Orte im Rhein-Neckar-Kreis, von Schwetzingen und Ketsch bis Heidelberg und Mannheim. Abholung und Büro-Catering ebenso.
```

English (481 characters):
```
KAIRO 1980 cooks modern Egyptian food in Hockenheim: Koshary, the national dish of lentils, rice and pasta, creamy hummus, smoky baba ghanough and oven-baked hawawshy. Every dish is prepared fresh after you order, with homemade sauces and no ready-made products. A large part of the menu is vegan or vegetarian. We deliver to more than 30 towns across the Rhein-Neckar area, from Schwetzingen and Ketsch to Heidelberg and Mannheim. Pickup at the restaurant and office catering too.
```

Egyptian Arabic, if the account offers it — the site carries all three, and the
place card should not be the one surface that drops one (353 characters):
```
مطعم KAIRO 1980 بيقدّم أكل مصري عصري في هوكنهايم: كشري بعدس ورز ومكرونة، وحمص كريمي، وبابا غنوج مدخّن، وحواوشي من الفرن. كل طبق بيتعمل طازة بعد الطلب، بصوصات بيتي ومن غير أي منتجات جاهزة. جزء كبير من المنيو نباتي أو فيجن. بنوصّل لأكتر من 30 مدينة في منطقة راين-نيكار، من شفتسينجن وكيتش لحد هايدلبرج ومانهايم، وفيه كمان استلام من المطعم وكاترينج للمكاتب.
```

Dish names stay in Latin script in German and English and in Arabic script only
in the Arabic text, exactly as on the website. `KAIRO 1980` is the brand and is
never transliterated.

Do not put the opening hours, the phone number or the delivery fee in the
description. They are structured fields; repeating them is how a listing starts
contradicting itself.

### Attributes

Tick: delivery, takeout/pickup, catering, vegetarian options, vegan options,
online ordering, cash, EC-/Girocard and credit card. Tick halal and
wheelchair-accessible **only if true of the premises** — an attribute that is
wrong in person is worse than an attribute that is missing.

Leave reservations off: `acceptsReservations` is `False` in the site's
structured data and the two must agree.

### Actions

Actions are the buttons on the card, and they are the only part of a listing
that is worth money. Every one of them points at our own basket — a platform
button on the place card hands away a commission on an order Apple already
delivered to us for nothing.

| Button | URL |
| --- | --- |
| Order / Bestellen | `https://kairo1980.de/#speisekarte` |
| Menu / Speisekarte | `https://kairo1980.de/#speisekarte` |
| Website | `https://kairo1980.de` |
| Call | `+49 176 79906621` |

If a partner-integration picker offers Lieferando or Uber Eats, decline it.
They are labelled as alternatives on the site for the same reason, and the
site's own route carries the 10 % direct discount.

### Showcases

Photo, headline (**38 characters**), description (**58 characters is the safe
figure** — Apple's own guidance is quoted as both 58 and 100 in different
places, so write to 58 and nothing gets clipped), an action, and a run of up to
365 days. Keep two or three live and rotate them; a card that never changes is
a card Apple stops trusting.

**1 — Lunch launch.** Run from now to roughly mid-September.
```
Neu: Mittagstisch ab 5. August
Mi–So 11:00–14:30 Uhr. Abholung im Restaurant.
```
Action → `https://kairo1980.de/#speisekarte`. Note "Abholung" — this is the one
place the collection-only rule has to be said out loud on Apple.

**2 — The direct-order discount.** Permanent.
```
10 % Rabatt bei Direktbestellung
Direkt bestellen statt über Portale: 10 % Rabatt.
```
Action → `https://kairo1980.de/#speisekarte`

**3 — Corporate catering.** Permanent, and the highest-value one.
```
Büro-Catering aus Ägypten
Meetings & Team-Lunch. Ab 100 € liefern wir kostenlos — ohne Mindestbestellwert.
```
Action → `https://kairo1980.de/firmencatering`

Both figures come from `config.js` (`order.directDiscountPercent`,
`business.freeDeliveryFrom`). Change either one there and these two Showcases
are stale the same day.

### Photos

| Slot | File |
| --- | --- |
| Logo | `brand/apple-logo-mark-1024.png` |
| Cover | `brand/apple-cover-1920x1280.jpg` |

Read `brand/README.md` before uploading the cover: Apple requires an unedited
photograph of the actual business, so `hero.jpg` qualifies only if it is our
own photograph of our own food. Apple Maps crops the cover to about 2.5:1 —
`brand/preview-maps-crop-2.5to1.jpg` shows what survives.

### Ratings on the Apple card

Apple Maps in Germany shows its own thumbs-up ratings plus material from Yelp,
Foursquare and Tripadvisor. Google reviews never appear there. Two consequences:

- Claiming the **Yelp** and **Foursquare** pages is Apple work, not Yelp work —
  it is how photos and a rating reach the place card at all.
- Guests on an iPhone can rate directly in Apple Maps. Worth asking for in the
  shop; there is no shareable review link the way `g.page/r/…` works for Google.

## 8. What only you can do

- Log in and prove ownership on each platform
- Receive and enter verification codes
- Take and upload real photographs
- Reply to reviews in your own voice
