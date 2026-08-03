/* The journey a guest actually takes: open the site, look at the menu, build
   a basket, find out whether we deliver to them, and place the order.

   These assert business outcomes — the price shown, the fee charged, the
   warning given, what reaches the restaurant — not pixels. */

import { test, expect } from '@playwright/test';
import { addItem, openBasket, captureWhatsApp, fillContact, choosePickup } from './helpers.js';

test('the menu shows a price for every dish that can be ordered', async ({ page }) => {
  await page.goto('/');
  const items = page.locator('.mitem[data-item]');
  await expect(items.first()).toBeVisible();

  const count = await items.count();
  expect(count).toBeGreaterThan(0);

  for (let i = 0; i < count; i++) {
    const item = items.nth(i);
    // A dish a guest can add must have a price the guest can see, and the two
    // must be the same number.
    const price = await item.getAttribute('data-price');
    expect(Number(price)).toBeGreaterThan(0);
    const shown = (await item.locator('.mprice').innerText()).replace(/[^\d,]/g, '').replace(',', '.');
    expect(Number(shown)).toBeCloseTo(Number(price), 2);
  }
});

test('adding items updates the basket total, and quantities can be changed', async ({ page }) => {
  await page.goto('/');
  await addItem(page, 'hummus', 2);

  const fab = page.locator('#cartFab');
  await expect(fab).toBeVisible();
  await expect(page.locator('#cartFabCount')).toHaveText('2');

  // 2 × 9.50 = 19.00, less the 10 % direct discount = 17.10
  await expect(page.locator('#cartFabTotal')).toContainText('17,10');

  // Taking one back off is reflected everywhere.
  await page.locator('.mitem[data-item="hummus"] [data-act="dec"]').click();
  await expect(page.locator('#cartFabCount')).toHaveText('1');
  await expect(page.locator('#cartFabTotal')).toContainText('8,55');
});

test('the basket survives a reload, so a phone call does not cost the order', async ({ page }) => {
  await page.goto('/');
  await addItem(page, 'hummus', 2);
  await page.reload();
  await expect(page.locator('#cartFabCount')).toHaveText('2');
});

test('a postcode we deliver to shows its fee before the guest commits', async ({ page }) => {
  await page.goto('/');
  await addItem(page, 'hummus', 2);
  await openBasket(page);

  await page.locator('[data-type="delivery"]').click();
  await page.locator('#fPlz').fill('69168');   // Wiesloch: 20 € minimum, 2 € fee

  const body = page.locator('#cartBody');
  await expect(body).toContainText('Wiesloch');
  await expect(body).toContainText('2,00');
});

test('a sub-minimum order is warned about but never blocked', async ({ page }) => {
  await page.goto('/');
  await addItem(page, 'hummus', 1);          // 9.50, under the 20 € minimum
  await openBasket(page);
  await page.locator('[data-type="delivery"]').click();
  await page.locator('#fPlz').fill('69168');

  // Warned…
  await expect(page.locator('.cart-zone')).toHaveClass(/is-below-min/);
  // …and still orderable. The send button must never be disabled for this.
  await expect(page.locator('#cartSend')).toBeEnabled();
});

test('a postcode outside the area becomes an enquiry rather than a refusal', async ({ page }) => {
  await page.goto('/');
  await addItem(page, 'hummus', 2);
  await openBasket(page);
  await page.locator('[data-type="delivery"]').click();
  await page.locator('#fPlz').fill('10115');   // Berlin

  await expect(page.locator('.cart-zone')).toHaveClass(/is-unknown/);
  await expect(page.locator('#cartSend')).toBeEnabled();
});

test('the order that reaches the restaurant carries the items, total and contact', async ({ page }) => {
  const whatsapp = await captureWhatsApp(page);
  await page.goto('/');
  await addItem(page, 'hummus', 2);
  await openBasket(page);
  await choosePickup(page);
  await fillContact(page, { name: 'Sherif Esmat', phone: '+49 176 79906621' });
  await page.locator('#cartSend').click();

  const message = decodeURIComponent((await whatsapp()).split('?text=')[1]);
  expect(message).toContain('Hummus');
  expect(message).toContain('17,10');
  expect(message).toContain('Sherif Esmat');
  expect(message).toContain('+49 176 79906621');
  // Nothing was paid, so the chat must be told to collect on arrival.
  expect(message).toMatch(/Bargeld|EC-|Kreditkarte/);
});

test('warnings survive the trip to WhatsApp intact', async ({ page }) => {
  // The warning sign U+26A0 was the obvious marker and the wrong one: wa.me
  // redirects through api.whatsapp.com, and that redirect replaces it with
  // U+FFFD, so the kitchen read a broken character on the line that matters
  // most. A check mark and an em dash survive the same trip; this one does
  // not. Nothing above ASCII goes in a flag.
  const whatsapp = await captureWhatsApp(page);
  await page.goto('/');
  await addItem(page, 'hummus', 1);
  await openBasket(page);
  await page.locator('[data-type="delivery"]').click();
  await fillContact(page, { address: 'Teststr. 1', postcode: '10115' });   // Berlin — outside the area
  await page.locator('#cartSend').click();

  const message = decodeURIComponent((await whatsapp()).split('?text=')[1]);
  const flags = message.split(/\r?\n/).filter((line) => line.startsWith('*!'));
  expect(flags.length, 'an out-of-area order must be flagged').toBeGreaterThan(0);
  for (const line of flags) expect(line.slice(0, 3)).toBe('*! ');

  expect(message, 'no replacement character').not.toContain('�');
  expect(message, 'no glyph WhatsApp mangles').not.toContain('⚠');
});

test('the confirmation screen appears and the basket is emptied afterwards', async ({ page }) => {
  await captureWhatsApp(page);
  await page.goto('/');
  await addItem(page, 'hummus', 1);
  await openBasket(page);
  await choosePickup(page);
  await fillContact(page, {});
  await page.locator('#cartSend').click();

  await expect(page.locator('.cart-sent')).toBeVisible();
  await expect(page.locator('#cartFab')).toBeHidden();
});

test('an order cannot be sent without a name and a phone number', async ({ page }) => {
  await captureWhatsApp(page);
  await page.goto('/');
  await addItem(page, 'hummus', 1);
  await openBasket(page);
  await page.locator('#cartSend').click();

  await expect(page.locator('#fName')).toHaveClass(/is-invalid/);
  await expect(page.locator('.cart-sent')).toHaveCount(0);
});

test('switching language keeps the basket and translates the chrome', async ({ page }) => {
  await page.goto('/');
  await addItem(page, 'hummus', 2);

  // From the page, not from inside the open basket: the drawer's backdrop
  // covers the header, which is the intended behaviour for a modal.
  await page.locator('[data-lang="en"]').first().click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#cartFabCount')).toHaveText('2');

  await page.locator('[data-lang="ar"]').first().click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('#cartFabCount')).toHaveText('2');
});

test('the page never scrolls sideways on a phone', async ({ page }) => {
  await page.goto('/');
  await addItem(page, 'hummus', 2);
  await openBasket(page);

  const overflows = await page.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(overflows).toBe(false);
});
