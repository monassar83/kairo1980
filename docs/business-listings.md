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

**Opening hours** (current — lunch service is not published yet):

```
Monday        closed
Tuesday       18:00–23:00
Wednesday     18:00–23:00
Thursday      18:00–23:00
Friday        18:00–23:00
Saturday      18:00–23:00
Sunday        18:00–23:00
```

> When you enable lunch service in `config.js`, update every platform below in
> the same session. The website changes automatically; the directories do not.

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

### Apple Business Connect — powers Apple Maps and Siri
<https://businessconnect.apple.com>

Frequently neglected, and a meaningful share of German phone users never touch
Google Maps. Sign in with an Apple ID, claim the place, paste the same data,
upload logo and cover, set the hours. Apple also supports a "Showcase" card —
use the medium description.

### Also worth claiming
- **Apple/Yelp**: Yelp feeds several downstream directories.
- **Das Örtliche**, **Gelbe Seiten**, **11880** — German directories that still
  carry local weight.
- Keep **Lieferando** and **Uber Eats** name/address/phone identical to the
  table above.

---

## 7. What only you can do

- Log in and prove ownership on each platform
- Receive and enter verification codes
- Take and upload real photographs
- Reply to reviews in your own voice
