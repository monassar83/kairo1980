/* The addresses the site gives out.

   A canonical URL is the one piece of markup whose failure is completely
   invisible: the page looks perfect, and Google quietly drops it. That is
   exactly what happened here — impressum and datenschutz shipped a correct
   canonical in the HTML and had it rewritten to the homepage the moment
   lang.js ran, so the file on disk proved nothing at all.

   Hence the rule these tests exist to hold: every page declares ITSELF, in
   every language, in the DOM as it stands AFTER the scripts have run. The
   static file is checked too, because it is what a crawler that does not
   execute JavaScript reads — but it is never the only thing checked. */

import { test, expect } from '@playwright/test';

const SITE = 'https://kairo1980.de';

// Every page with a URL of its own, and the canonical it must declare. Adding
// a page here is all it takes to hold it to the same standard as the rest.
const PAGES = [
  { path: '/', canonical: `${SITE}/` },
  { path: '/firmencatering', canonical: `${SITE}/firmencatering` },
  { path: '/impressum', canonical: `${SITE}/impressum` },
  { path: '/datenschutz', canonical: `${SITE}/datenschutz` }
];

const LANGS = ['de', 'en', 'ar'];

/** The canonical for a page in a given language: German, the default, keeps
 *  the bare URL — the same rule lang.js and the hreflang set both follow. */
const canonicalFor = (base, lang) => (lang === 'de' ? base : `${base}?lang=${lang}`);

const canonical = (page) => page.locator('link[rel="canonical"]');

for (const { path, canonical: base } of PAGES) {
  test(`${path} declares itself as canonical, in every language, after JavaScript`,
    async ({ page }) => {
      for (const lang of LANGS) {
        const response = await page.goto(lang === 'de' ? path : `${path}?lang=${lang}`);
        expect(response.status()).toBe(200);
        await expect(canonical(page)).toHaveAttribute('href', canonicalFor(base, lang));
      }
    });

  test(`${path} declares itself as canonical without JavaScript too`, async ({ page }) => {
    const html = await (await page.request.get(path)).text();
    const href = /<link rel="canonical" href="([^"]+)"/.exec(html);
    expect(href, `${path} has no canonical in its static HTML`).not.toBeNull();
    expect(href[1]).toBe(base);
  });

  test(`${path} offers all three languages and points every one of them at itself`,
    async ({ page }) => {
      await page.goto(path);
      const alternates = await page.evaluate(() =>
        Object.fromEntries([...document.querySelectorAll('link[rel="alternate"][hreflang]')]
          .map((link) => [link.getAttribute('hreflang'), link.getAttribute('href')])));

      expect(alternates).toEqual({
        de: base,
        en: `${base}?lang=en`,
        ar: `${base}?lang=ar`,
        // x-default is the German page: it is the original, and for the legal
        // pages it is also the binding version.
        'x-default': base
      });
    });

  test(`${path} shares the same URL it canonicalises`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', base);
  });
}

/* The regression itself, in the shape it actually took: not a page loaded in
   another language, but a reader pressing the language buttons. Every subpage
   went to the homepage's address and stayed there — including on the way back
   to German, which is why the German reading is asserted last rather than
   assumed to be safe. */
test('pressing the language buttons never repoints a page at the homepage',
  async ({ page }) => {
    for (const { path, canonical: base } of PAGES.filter((entry) => entry.path !== '/')) {
      await page.goto(path);
      for (const lang of ['en', 'ar', 'de']) {
        await page.locator(`[data-action="lang"][data-lang="${lang}"]`).click();
        await expect(page.locator('html')).toHaveAttribute('lang', lang);
        await expect(canonical(page)).toHaveAttribute('href', canonicalFor(base, lang));
        await expect(canonical(page)).not.toHaveAttribute('href', `${SITE}/`);
      }
    }
  });

/* One host, one scheme. A site reachable at two addresses splits its own
   ranking between them, and the fix is worthless if a single link in the
   markup keeps naming the other one. */
test('every page names one host, over https, without www', async ({ page }) => {
  for (const { path } of PAGES) {
    const html = await (await page.request.get(path)).text();
    expect(html, `${path} names www`).not.toMatch(/https?:\/\/www\.kairo1980\.de/);
    expect(html, `${path} names http`).not.toMatch(/http:\/\/kairo1980\.de/);
  }
});

test('the sitemap lists exactly the pages that canonicalise themselves',
  async ({ page }) => {
    const response = await page.request.get('/sitemap.xml');
    expect(response.status()).toBe(200);
    const locs = [...(await response.text()).matchAll(/<loc>([^<]+)<\/loc>/g)]
      .map((match) => match[1]);

    // Exactly: a page missing from the sitemap is not offered for indexing, and
    // a URL in the sitemap that no page canonicalises is a duplicate invitation.
    expect(new Set(locs)).toEqual(new Set(PAGES.map((entry) => entry.canonical)));
    expect(locs.length).toBe(PAGES.length);
  });

/* Cloudflare serves each page at two paths — with and without .html — and the
   extensionless one is what every canonical, sitemap entry and internal link
   names. The redirect is what keeps the other from being a second copy. */
test('the .html twin of every page redirects to the canonical path', async ({ page }) => {
  const twins = [
    ['/index.html', '/'],
    ['/firmencatering.html', '/firmencatering'],
    ['/impressum.html', '/impressum'],
    ['/datenschutz.html', '/datenschutz']
  ];

  for (const [from, to] of twins) {
    const response = await page.request.get(from, { maxRedirects: 0 });
    expect(response.status(), `${from} did not redirect`).toBeGreaterThanOrEqual(300);
    expect(response.status(), `${from} did not redirect`).toBeLessThan(400);
    const location = response.headers()['location'];
    expect(new URL(location, 'http://127.0.0.1').pathname, `${from} → ${location}`).toBe(to);
  }
});

test('the structured data names the same origin the canonical does',
  async ({ page }) => {
    // Before JavaScript: the fallback a non-executing crawler reads.
    const html = await (await page.request.get('/')).text();
    const stat = JSON.parse(
      /<script id="restaurantSchema" type="application\/ld\+json">([\s\S]*?)<\/script>/
        .exec(html)[1]);
    expect(stat['@id']).toBe(`${SITE}/#restaurant`);
    expect(stat.url).toBe(`${SITE}/`);
    expect(stat.parentOrganization.url).toBe(`${SITE}/`);
    expect(stat.hasMenu).toBe(`${SITE}/#speisekarte`);

    // After: order.js replaces hasMenu with the menu it reads off the page, and
    // that node has to keep pointing at the address the menu actually has.
    await page.goto('/');
    await expect(page.locator('.mitem[data-item]').first()).toBeVisible();
    const live = await page.evaluate(() =>
      JSON.parse(document.getElementById('restaurantSchema').textContent));
    expect(live['@id']).toBe(`${SITE}/#restaurant`);
    expect(live.url).toBe(`${SITE}/`);
    expect(live.hasMenu.url).toBe(`${SITE}/#speisekarte`);
    expect(live.hasMenu['@type']).toBe('Menu');
  });

/* The menu deliberately has no page of its own: it is the homepage's primary
   content, and the basket that goes with it only works under the checkout CSP
   that names '/'. So #speisekarte is a published address — printed on the
   Google and Apple place cards — and these are the links that have to keep
   resolving to something. */
test('the menu keeps the address every listing points at', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#speisekarte')).toHaveCount(1);
  await expect(page.locator('.mitem[data-item]').first()).toBeVisible();

  // Reached by fragment, exactly as a place-card button reaches it.
  await page.goto('/#speisekarte');
  await expect(page.locator('#speisekarte')).toBeInViewport({ timeout: 10000 });

  // And the fragment does not become the canonical: it is one place on a page,
  // not a page.
  await expect(canonical(page)).toHaveAttribute('href', `${SITE}/`);
});

/* Every page must be reachable from every other one, or the crawler that finds
   the corporate page from a search never finds the menu. */
test('the legal pages link back into the site', async ({ page }) => {
  for (const path of ['/impressum', '/datenschutz']) {
    await page.goto(path);
    await expect(page.locator('nav.nav a[href="/#speisekarte"]')).toHaveCount(1);
    await expect(page.locator('nav.nav a[href="/"]').first()).toBeVisible();
  }
});

/* --- the canonical belongs to the URL, not to the reader -------------------
   Search Console, 8 August 2026: "Duplicate, Google chose different canonical
   than user", and the homepage out of the index since 13 June — indexed pages
   2 -> 1.

   The cause was here and the whole suite above missed it, because
   playwright.config.js pins `locale: 'de-DE'`. On a German browser the bare URL
   displays German, so the canonical stayed bare and every assertion passed.
   Googlebot renders in ENGLISH: it fetched https://kairo1980.de/, lang.js chose
   `en` from navigator.languages, and rewrote the canonical of the page it was
   standing on to https://kairo1980.de/?lang=en.

   These run in English and Arabic deliberately. A canonical describes the URL
   it was served at; what language the visitor happens to read is none of its
   business. */
for (const locale of ['en-GB', 'ar-EG']) {
  test.describe(`a ${locale} browser`, () => {
    test.use({ locale });

    test('is still served a homepage that canonicalises to the bare URL', async ({ page }) => {
      await page.goto('/');
      // The language really did switch — otherwise this proves nothing.
      await expect(page.locator('html')).not.toHaveAttribute('lang', 'de');
      await expect(page.locator('link[rel="canonical"]'))
        .toHaveAttribute('href', 'https://kairo1980.de/');
    });

    test('does not repoint any page at a language variant', async ({ page }) => {
      for (const { path, canonical: base } of PAGES) {
        await page.goto(path);
        await expect(page.locator('link[rel="canonical"]'), `${path} under ${locale}`)
          .toHaveAttribute('href', base);
      }
    });

    test('still canonicalises an explicit ?lang= URL to itself', async ({ page }) => {
      // The other half of the rule: when the URL DOES name a language, the
      // canonical must name it too, or the variant cannot be indexed at all.
      await page.goto('/?lang=en');
      await expect(page.locator('link[rel="canonical"]'))
        .toHaveAttribute('href', 'https://kairo1980.de/?lang=en');
      await page.goto('/?lang=ar');
      await expect(page.locator('link[rel="canonical"]'))
        .toHaveAttribute('href', 'https://kairo1980.de/?lang=ar');
    });
  });
}

/* --- what a search result actually looks like -----------------------------
   Found by sweeping every page rather than by anyone reporting it: two titles
   and two descriptions were long enough for Google to cut them off mid-word,
   and the legal pages shared as a bare grey box because they carried no
   og:image. None of it breaks a page, which is exactly why nobody notices. */

const HEAD_LIMITS = { title: 65, description: 165 };

test('no page has a title or description Google will truncate', async ({ page }) => {
  test.slow();
  const seen = { title: new Map(), description: new Map() };

  for (const { path } of PAGES) {
    await page.goto(path);
    const head = await page.evaluate(() => ({
      title: document.title,
      description: (document.querySelector('meta[name="description"]') || {}).content || ''
    }));

    for (const key of ['title', 'description']) {
      const value = head[key];
      expect(value, `${path} has no ${key}`).not.toBe('');
      expect(value.length,
        `${path} ${key} is ${value.length} chars: "${value}"`)
        .toBeLessThanOrEqual(HEAD_LIMITS[key]);
      // Two pages competing on the same title is two pages competing for the
      // same result.
      expect(seen[key].get(value), `${path} duplicates the ${key} of ${seen[key].get(value)}`)
        .toBeUndefined();
      seen[key].set(value, path);
    }
  }
});

test('every page can be shared as a card, and names one h1', async ({ page }) => {
  test.slow();
  for (const { path, canonical } of PAGES) {
    await page.goto(path);
    const head = await page.evaluate(() => ({
      h1: [...document.querySelectorAll('h1')].map((h) => h.textContent.trim()),
      og: Object.fromEntries([...document.querySelectorAll('meta[property^="og:"]')]
        .map((m) => [m.getAttribute('property'), m.getAttribute('content')])),
      twitter: (document.querySelector('meta[name="twitter:card"]') || {}).content || '',
      // alt="" is CORRECT for a decorative image — the hero sits behind the
      // h1 and a screen reader should skip it. A MISSING alt is the fault.
      noAlt: [...document.querySelectorAll('img')].filter((i) => i.getAttribute('alt') === null).length
    }));

    expect(head.h1.length, `${path} has ${head.h1.length} <h1>: ${JSON.stringify(head.h1)}`).toBe(1);
    for (const tag of ['og:title', 'og:description', 'og:image', 'og:url']) {
      expect(head.og[tag], `${path} has no ${tag}`).toBeTruthy();
    }
    expect(head.og['og:url'], `${path} og:url disagrees with its canonical`).toBe(canonical);
    expect(head.twitter, `${path} has no twitter:card`).toBeTruthy();
    expect(head.noAlt, `${path} has ${head.noAlt} <img> with no alt attribute`).toBe(0);
  }
});

test('the .html twins move permanently, and the verification file does not move at all', async ({ request }) => {
  /* A 307 says the old URL may come back, so a crawler keeps it, keeps asking
     for it, and keeps the ranking split across two addresses. These pages have
     lived at the extensionless paths since launch. */
  for (const path of ['/index.html', '/impressum.html', '/datenschutz.html', '/firmencatering.html']) {
    const res = await request.get(path, { maxRedirects: 0 });
    expect(res.status(), `${path} should move permanently`).toBe(301);
  }

  // Google's own verification file. Redirecting it un-verifies the property.
  const verify = await request.get('/googled7bbc73984e8deda.html', { maxRedirects: 0 });
  expect(verify.status(), 'the Google verification file must be served where it is').toBe(200);
});

test('an unknown path is a real 404, not a soft one', async ({ request }) => {
  // A soft 404 gets the page indexed as if it existed.
  const res = await request.get('/no-such-page-' + Date.now(), { maxRedirects: 0 });
  expect(res.status()).toBe(404);
});

test('every URL in the sitemap answers 200 without redirecting', async ({ request }) => {
  const xml = await (await request.get('/sitemap.xml')).text();
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  expect(locs.length, 'the sitemap lists no URLs').toBeGreaterThan(0);

  for (const loc of locs) {
    const res = await request.get(loc.replace(SITE, '') || '/', { maxRedirects: 0 });
    expect(res.status(), `${loc} is in the sitemap but answers ${res.status()}`).toBe(200);
  }
});

test('no page leaves an unfilled {placeholder} on screen, in any language', async ({ page }) => {
  // Twenty-four navigations: four pages, three languages, cleared between each.
  test.slow();
  /* applyConfig() fills {freeDeliveryFrom} and friends at runtime. One that
     survives is a config value that no longer exists, and it reaches the guest
     as literal curly braces in the middle of a sentence. */
  for (const { path } of PAGES) {
    for (const lang of ['de', 'en', 'ar']) {
      // Cleared between languages: following a ?lang= link is remembered on
      // purpose, and without this the next page inherits the last choice.
      await page.goto(path);
      await page.evaluate(() => localStorage.clear());
      await page.goto(lang === 'de' ? path : `${path}?lang=${lang}`);

      const state = await page.evaluate(() => ({
        lang: document.documentElement.getAttribute('lang'),
        dir: document.documentElement.getAttribute('dir'),
        left: (document.body.innerText.match(/\{[a-zA-Z]+\}/g) || []).slice(0, 5)
      }));

      expect(state.lang, `${path}?lang=${lang}`).toBe(lang);
      expect(state.dir, `${path}?lang=${lang}`).toBe(lang === 'ar' ? 'rtl' : 'ltr');
      expect(state.left, `${path} in ${lang} shows unfilled placeholders`).toEqual([]);
    }
  }
});

/* --- the map is visible, and costs the guest nothing ----------------------
   A map on the page at load used to mean Google's embed, which transmits the
   visitor's IP before they have agreed to anything — § 25 TDDDG, and the
   reason the click-to-load panel exists. The picture underneath is rendered
   from OpenStreetMap and served from this origin, so it is not a third-party
   request at all: the guest sees where we are immediately, and Google still
   waits for the button.

   What is actually asserted is the promise: NO request leaves this origin
   until the button is pressed. */
test('the page makes no third-party request before anything is clicked', async ({ page }) => {
  const foreign = [];
  page.on('request', (req) => {
    const host = new URL(req.url()).host;
    if (host && !host.includes('127.0.0.1') && !host.includes('localhost')) foreign.push(req.url());
  });

  await page.goto('/');
  await page.evaluate(async () => {
    // Scroll the whole page so every lazy image is asked for.
    for (let y = 0; y < document.body.scrollHeight; y += 400) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 40));
    }
  });
  await page.waitForTimeout(800);

  expect(foreign, `these left our origin unasked: ${foreign.join(', ')}`).toEqual([]);

  // And the map really is on screen, not a grey placeholder.
  const map = page.locator('.map-static');
  await expect(map).toBeVisible();
  const box = await map.boundingBox();
  expect(box.width, 'the static map has no width').toBeGreaterThan(200);
  await expect(page.locator('.map-attrib')).toContainText('OpenStreetMap');

  /* The notice sits on a card, not on a scrim across the whole map. A full
     overlay washes the map into wallpaper, which wastes the reason for drawing
     one underneath — the guest should be able to read the street before
     deciding whether they want to pan around it. */
  const paint = await page.evaluate(() => ({
    panel: getComputedStyle(document.querySelector('.map-consent')).backgroundColor,
    card: getComputedStyle(document.querySelector('.map-consent-card')).backgroundColor
  }));
  expect(paint.panel, 'the consent panel must not cover the map').toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
  expect(paint.card, 'the notice needs its own card to stay legible').not.toMatch(/rgba\(0, 0, 0, 0\)/);
});

test('the interactive map loads only when asked, and replaces the picture', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.map-ph iframe')).toHaveCount(0);

  await page.locator('#mapConsentBtn').scrollIntoViewIfNeeded();
  await page.locator('#mapConsentBtn').click();

  const frame = page.locator('.map-ph iframe');
  await expect(frame).toHaveCount(1);
  await expect(frame).toHaveAttribute('src', /google\.com\/maps\/embed/);
  // The panel and the picture it covered are gone together.
  await expect(page.locator('#mapConsent')).toHaveCount(0);
  await expect(page.locator('.map-static')).toHaveCount(0);
});
