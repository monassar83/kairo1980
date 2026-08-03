/* Which provider handles which payment method.

   One provider today. The table is still a table, because that is the entire
   cost of being able to add a second one: a new file exporting the same five
   functions, and a line here. Nothing in the checkout, the store or the routes
   knows a provider's name.

   Every method below is carried by PayPal, and none of them requires the GUEST
   to have a PayPal account:

     applepay   the Apple Pay sheet — Face ID, done
     googlepay  the Google Pay sheet
     card       "Debit or Credit Card", PayPal's guest checkout
     paypal     the one method where the guest does sign in to PayPal

   Whether the first three can actually be offered is not knowable here. Apple
   Pay and Google Pay need PayPal's Advanced Checkout enabled for the merchant
   account, and additionally a device that has the wallet. Both facts exist
   only in the browser. So this says what is POSSIBLE and pay.js draws what is
   REAL — which is why nothing here has to change on the day PayPal approves
   the account. */

import * as paypal from './paypal.js';

const PROVIDERS = { paypal };

// Ordered as the guest should see them: the wallet already unlocked on the
// phone first, then card, then PayPal.
const ROUTES = [
  ['applepay', 'paypal'],
  ['googlepay', 'paypal'],
  ['card', 'paypal'],
  ['paypal', 'paypal']
];

/** By name — used to reload the provider that created an existing payment. */
export function providerFor(name) {
  return PROVIDERS[name] || null;
}

/** By payment method, but only if that provider is actually configured. */
export function providerForMethod(env, method) {
  const route = ROUTES.find(([m]) => m === method);
  if (!route) return null;
  const provider = PROVIDERS[route[1]];
  return provider && provider.isConfigured(env) ? provider : null;
}

/** The methods that could be offered, in display order. */
export function availableMethods(env) {
  return ROUTES.filter(([method]) => providerForMethod(env, method)).map(([method]) => method);
}

/** The public keys the page needs, per provider that is switched on. */
export function publicKeys(env) {
  const keys = {};
  if (paypal.isConfigured(env)) keys.paypal = { clientId: env.PAYPAL_CLIENT_ID };
  return keys;
}
