/* The emergency switch, from both ends: thrown at /admin on a phone, met by a
   guest on the site.

   These exist because the integration tests prove the Worker answers
   correctly, and that is not the same thing as the guest being stopped. Every
   failure below has a real shape:

     - the notice renders in German but not in Arabic, because a string was
       added to one dictionary and not the other three;
     - the buttons dim but a determined tap still adds to the basket;
     - the basket built before the switch was thrown sends anyway;
     - the hours saved at /admin never reach the page a crawler reads;
     - and the one that costs money: ordering resumes and something,
       somewhere, is still holding the closed state. */

import { test, expect } from '@playwright/test';
import { addItem, openBasket, choosePickup, fillContact, captureWhatsApp } from './helpers.js';

/* One switch, one database, one restaurant. Two of these running at once would
   be two tests writing the same row — which reads as flakiness and is not. */
test.describe.configure({ mode: 'serial' });

const ADMIN_USER = process.env.ADMIN_USER || 'devuser';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'dev-password-not-a-real-one';

/** Sign in to /admin, or notice we already are.
 *
 *  The "already signed in" branch matters: this runs from afterEach too, where
 *  the session from the test body is still live and there is no form to fill.
 *  An earlier version called test.skip() here — which throws when a hook calls
 *  it, failing the test that had just passed and aborting the serial chain
 *  behind it. A helper used in a hook must not decide to skip. */
/* Chromium reports ERR_ABORTED when a navigation is superseded by whatever the
   page was still doing — a real hazard here, because these tests navigate away
   immediately after pressing things. Retried once rather than papered over with
   a wait: the second attempt starts from a settled page. */
async function goAdmin(page, path = '/admin') {
  try {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
  } catch {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
  }
}

async function signIn(page) {
  await goAdmin(page);
  if (await page.locator('.switch').count()) return;

  await expect(page.locator('#p'),
    'ADMIN_USER / ADMIN_PASSWORD must be set for this run').toBeVisible();
  await page.fill('#u', ADMIN_USER);
  await page.fill('#p', ADMIN_PASSWORD);
  await page.click('button.go');
  await expect(page.locator('.switch')).toBeVisible();
}

async function setOrdering(page, { closed, reason = '', untilDate = '', untilTime = '' } = {}) {
  await goAdmin(page);
  if (!closed) {
    const resume = page.locator('button.go2');
    if (await resume.count()) await resume.click();
    await expect(page.locator('.switch.off')).toHaveCount(0);
    return;
  }
  if (await page.locator('button.go2').count()) await page.locator('button.go2').click();
  await page.locator(`input[name="reason"][value="${reason}"]`).check();
  if (untilDate) await page.fill('#untilDate', untilDate);
  if (untilTime) await page.fill('#untilTime', untilTime);
  await page.click('button.stop');
  await expect(page.locator('.switch.off')).toBeVisible();
}

/* Whatever a test does — including crashing — the shop is left taking orders.
   A run that died half way through once left the shop closed in the local
   database, and every later test failed trying to add an item to a basket. A
   suite that can do that is a suite nobody will dare run twice, so the state
   is put back both before and after. */
test.beforeEach(async ({ page }) => {
  await signIn(page);
  await setOrdering(page, { closed: false });

  /* And an empty basket. These tests run serially against one browser profile,
     so the basket and the remembered form survive from one to the next — which
     is exactly the behaviour the site is built for and exactly wrong for a
     test that then asserts a count. Isolation is the test's job, not the
     site's. */
  await page.goto('/');
  await page.evaluate(() => {
    try { localStorage.clear(); sessionStorage.clear(); } catch (e) { /* fine */ }
  });
});

test.afterEach(async ({ page }) => {
  await signIn(page).catch(() => {});
  await setOrdering(page, { closed: false }).catch(() => {});
});

test('a paused shop still shows its menu, and says why in all three languages',
  async ({ page }) => {
    await signIn(page);
    await setOrdering(page, { closed: true, reason: 'demand' });

    await page.goto('/');
    // The menu is the point: someone who cannot order tonight may still be
    // deciding where to eat tomorrow.
    await expect(page.locator('.mitem[data-item]').first()).toBeVisible();
    await expect(page.locator('.mprice').first()).toBeVisible();

    const note = page.locator('#speisekarte .order-off');
    await expect(note).toBeVisible();
    await expect(note).toContainText('Bestellungen');
    // The phone number is the way out, and it must be in the sentence.
    await expect(note).toContainText('+49 176 79906621');

    /* The failure this catches: a string added to the German dictionary and
       forgotten in the other two, which shows up as an empty notice or a
       German sentence on the Arabic page. */
    for (const [lang, expected] of [['en', /orders/i], ['ar', /طلبات/]]) {
      await page.locator(`[data-lang="${lang}"]`).first().click();
      await expect(page.locator('html')).toHaveAttribute('lang', lang);
      await expect(note).toHaveText(expected);
      await expect(note).not.toHaveText(/Bestellungen/);
    }
  });

test('a paused shop still lets a guest build a basket, and refuses only "now"',
  async ({ page }) => {
    const whatsapp = await captureWhatsApp(page);
    await signIn(page);
    await setOrdering(page, { closed: true, reason: 'emergency' });

    /* Filling a basket is never withheld. The guest may be putting together an
       order for tomorrow, and blocking the basket would lose it — which is the
       same mistake as refusing an out-of-area postcode instead of flagging it. */
    await page.goto('/');
    await addItem(page, 'hummus', 2);
    await expect(page.locator('#cartFabCount')).toHaveText('2');

    await openBasket(page);
    await choosePickup(page);
    await fillContact(page, { name: 'Test Gast', phone: '+49 176 1234567' });

    // "As soon as possible" is what the closure takes away.
    const send = page.locator('#cartSend');
    await expect(send).toBeDisabled();
    const note = page.locator('#cartOrderOff');
    await expect(note).toBeVisible();
    // And the note names the way out rather than just closing the door.
    await expect(note).toContainText(/Wunschtermin/);

    // Forced past the disabled attribute, the way a script or a stuck tap would.
    await send.evaluate((el) => { el.disabled = false; el.click(); });
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => window.__waUrl)).toBeNull();
    await expect(page.locator('.cart-sent')).toHaveCount(0);
  });

test('an order scheduled past the closure goes through untouched', async ({ page }) => {
  const whatsapp = await captureWhatsApp(page);
  await signIn(page);

  // Closed until a named time this evening, so "later today" is a real choice.
  await setOrdering(page, { closed: true, reason: 'demand', untilTime: '23:30' });

  await page.goto('/');
  await addItem(page, 'hummus', 2);
  await openBasket(page);
  await choosePickup(page);

  // Pick a moment after we reopen — tomorrow, so no clock arithmetic can make
  // this test fail at some hours of the day and pass at others.
  const tomorrow = await page.evaluate(() => {
    const d = new Date(Date.now() + 86400000);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  });
  await page.locator('[data-when="scheduled"]').click();
  await page.fill('#fDate', tomorrow);
  await page.fill('#fTime', '19:00');

  const send = page.locator('#cartSend');
  await expect(send).toBeEnabled();
  await expect(page.locator('#cartOrderOff')).toBeHidden();

  await fillContact(page, { name: 'Test Gast', phone: '+49 176 1234567' });
  await send.click();

  const message = decodeURIComponent((await whatsapp()).split('?text=')[1]);
  expect(message).toContain('2× Hummus');
  await expect(page.locator('.cart-sent')).toBeVisible();
});

test('moving the chosen time back into the closure withholds the button again',
  async ({ page }) => {
    await signIn(page);
    await setOrdering(page, { closed: true, reason: 'demand', untilTime: '23:30' });

    await page.goto('/');
    await addItem(page, 'hummus', 1);
    await openBasket(page);
    await choosePickup(page);

    const send = page.locator('#cartSend');
    const tomorrow = await page.evaluate(() => {
      const d = new Date(Date.now() + 86400000);
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    });

    await page.locator('[data-when="scheduled"]').click();
    await page.fill('#fDate', tomorrow);
    await page.fill('#fTime', '19:00');
    await expect(send).toBeEnabled();

    // Back to "as soon as possible", which is the one moment we cannot cook in.
    await page.locator('[data-when="asap"]').click();
    await expect(send).toBeDisabled();
  });

test('taking something OFF an order is never blocked', async ({ page }) => {
  await signIn(page);
  await page.goto('/');
  await addItem(page, 'hummus', 2);
  await setOrdering(page, { closed: true, reason: 'demand' });

  await page.goto('/');
  await expect(page.locator('#cartFabCount')).toHaveText('2');
  // Withholding "remove" would trap a guest with a basket they cannot empty.
  await page.locator('.mitem[data-item="hummus"] [data-act="dec"]').dispatchEvent('click');
  await expect(page.locator('#cartFabCount')).toHaveText('1');
});

test('the page says it is closed before a single line of script has run',
  async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    // Signing in needs no JavaScript either — the admin area is plain forms.
    await page.goto('/admin');
    if (await page.locator('#p').count()) {
      await page.fill('#u', ADMIN_USER);
      await page.fill('#p', ADMIN_PASSWORD);
      await page.click('button.go');
    }
    if (await page.locator('button.go2').count()) await page.locator('button.go2').click();
    await page.locator('input[name="reason"][value="holiday"]').check();
    await page.click('button.stop');

    /* The attribute is written by the Worker into the markup. Without it the
       order buttons are live for however long order.js takes to boot — on a
       slow phone, long enough to tap. */
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-ordering', 'off');

    await page.goto('/admin');
    await page.locator('button.go2').click();
    await context.close();
  });

test('hours saved in the admin reach the markup a crawler reads', async ({ page }) => {
  await signIn(page);
  await page.goto('/admin/hours');

  await page.locator('input[name="wed_closed"]').uncheck();
  await page.fill('input[name="wed_evening_from"]', '17:15');
  await page.fill('input[name="wed_evening_to"]', '22:45');
  await page.click('button.save-btn');
  await expect(page.locator('.msg')).toContainText('Saved');

  try {
    /* Read with JavaScript switched off. Googlebot renders, eventually;
       Applebot and Bingbot largely do not, and those two feed the Apple Maps
       and Bing place cards this restaurant is actually found through. */
    const raw = await page.request.get('/');
    const html = await raw.text();
    expect(html).toContain('17:15');
    expect(html).toContain('22:45');

    const schema = html.match(/<script id="restaurantSchema"[^>]*>([\s\S]*?)<\/script>/);
    expect(schema, 'the JSON-LD block is still there to rewrite').toBeTruthy();
    const spec = JSON.parse(schema[1]).openingHoursSpecification;
    expect(spec.some((s) => s.opens === '17:15' && s.closes === '22:45')).toBe(true);

    // And the visible table, for a reader without JavaScript.
    expect(html).toMatch(/<!--hours:start-->[\s\S]*17:15[\s\S]*<!--hours:end-->/);
  } finally {
    await page.goto('/admin/hours');
    await page.locator('button.reset').click();
  }
});

test('resuming clears every trace of the closure', async ({ page }) => {
  await signIn(page);
  await setOrdering(page, { closed: true, reason: 'holiday' });
  await setOrdering(page, { closed: false });

  await page.goto('/');
  await expect(page.locator('html')).not.toHaveAttribute('data-ordering', 'off');
  await expect(page.locator('#speisekarte .order-off')).toBeHidden();

  await addItem(page, 'hummus', 1);
  await openBasket(page);
  await expect(page.locator('#cartSend')).toBeEnabled();
});
