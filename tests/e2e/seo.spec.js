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
