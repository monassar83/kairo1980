import { expect } from '@playwright/test';

/** Add a dish to the basket n times. */
export async function addItem(page, id, times = 1) {
  const row = page.locator(`.mitem[data-item="${id}"]`);
  await row.scrollIntoViewIfNeeded();
  await row.locator('[data-act="inc"]').click();
  for (let i = 1; i < times; i++) await row.locator('[data-act="inc"]').click();
  await expect(page.locator('#cartFab')).toBeVisible();
}

export async function openBasket(page) {
  await page.locator('#cartFab').click();
  await expect(page.locator('#cartPanel')).toBeVisible();
}

/* The basket opens on delivery, so an address is required unless pickup is
   chosen. A test that skips this is stopped by the same validation a guest
   would meet — which is correct behaviour, and was worth finding. */
export async function choosePickup(page) {
  await page.locator('[data-type="pickup"]').click();
}

export async function fillContact(page, {
  name = 'Test Gast', phone = '+49 176 1234567', address = null, postcode = null
} = {}) {
  await page.locator('#fName').fill(name);
  await page.locator('#fPhone').fill(phone);
  if (address) await page.locator('#fAddress').fill(address);
  if (postcode) await page.locator('#fPlz').fill(postcode);
}

/** Intercept the WhatsApp handover. window.open would otherwise leave the
 *  page, and the message it carries is the thing worth asserting. */
export async function captureWhatsApp(page) {
  await page.addInitScript(() => {
    window.__waUrl = null;
    window.open = (url) => { window.__waUrl = url; return null; };
  });
  return async () => {
    await expect.poll(() => page.evaluate(() => window.__waUrl)).toBeTruthy();
    return page.evaluate(() => window.__waUrl);
  };
}

/* --- standing in for the provider in the browser -------------------------
   The real PayPal SDK cannot run in CI without live credentials and a real
   card, so it is replaced by a script that renders a button and drives the
   same callbacks the real one does. Everything on OUR side of the boundary —
   creating the payment, capturing it, the confirmation, what the restaurant
   is told — is exercised for real against the Worker. */

/**
 * The Worker needs live PayPal credentials to create a real order, which CI
 * does not have. So the payment API is answered here instead.
 *
 * That boundary is deliberate and is not a gap: everything the Worker does
 * with a payment — pricing it, capturing it, refusing a double capture,
 * verifying a webhook, surviving a lost callback — is covered for real in
 * tests/integration against the actual routes. What only a browser can prove
 * is what these tests cover: that the guest sees the right thing at each step
 * and that the right words reach the restaurant.
 *
 * @param {'approve'|'cancel'|'error'|'decline'|'pending'} outcome
 */
export async function stubPayments(page, { methods = ['paypal'], outcome = 'approve',
  amount = 1710, reference = 'K7F3QA' } = {}) {
  const id = 'test-payment-id';

  await page.route('**/api/payments/config', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        online: true, methods,
        keys: { paypal: { clientId: 'test-client' } },
        environment: 'sandbox', currency: 'EUR', onSite: {}
      })
    }));

  await page.route('**/api/payments', (route) =>
    route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        id, reference, provider: 'paypal', providerOrderId: 'PP-ORDER-1',
        amount, amountText: (amount / 100).toFixed(2), currency: 'EUR'
      })
    }));

  await page.route('**/api/payments/*/capture', (route) => {
    if (outcome === 'decline') {
      return route.fulfill({
        status: 402,
        contentType: 'application/json',
        body: JSON.stringify({
          payment: { id, reference, status: 'failed', amount, failureCode: 'INSTRUMENT_DECLINED' },
          error: 'declined'
        })
      });
    }
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        payment: {
          id, reference, amount, currency: 'EUR',
          status: outcome === 'pending' ? 'pending' : 'captured'
        }
      })
    });
  });

  await page.route('**/api/payments/*/cancel', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ payment: { id, reference, status: 'cancelled', amount } })
    }));

  await page.route('**/sdk/js*', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: fakeSdk(outcome)
    }));
}

function fakeSdk(outcome) {
  return `
    window.paypal = {
      FUNDING: { PAYPAL: 'paypal', CARD: 'card' },
      getFundingSources: () => ['card', 'paypal'],
      isFundingEligible: () => true,
      // Apple Pay and Google Pay go through their own components, and both
      // report themselves ineligible here — which is the truth in a Chromium
      // test browser with no wallet and no Advanced Checkout. The page must
      // draw the two methods that DO work and silently skip the two that
      // do not.
      Applepay: () => ({ config: () => Promise.resolve({ isEligible: false }) }),
      Googlepay: () => ({ config: () => Promise.resolve({ isEligible: false }) }),
      Buttons: function (opts) {
        return {
          isEligible: () => true,
          render: async (host) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'fake-pay-button';
            button.dataset.funding = opts.fundingSource;
            button.textContent = 'Pay with ' + opts.fundingSource;
            button.addEventListener('click', async () => {
              try {
                await opts.createOrder();
                if ('${outcome}' === 'cancel') { opts.onCancel(); return; }
                if ('${outcome}' === 'error') { opts.onError(new Error('x')); return; }
                await opts.onApprove();
              } catch (err) { /* the page reports it */ }
            });
            host.appendChild(button);
          }
        };
      }
    };
  `;
}
