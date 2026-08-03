/* What the order actually costs.

   The browser computes the same figures in order.js to show the guest a
   running total. This module recomputes them from scratch, in cents, from the
   published menu and the generated zones — because the browser's number is a
   claim by an untrusted party. Nothing a client sends about money is used:
   the client says WHAT it wants, the server says what it COSTS.

   The rules mirror totals() in order.js exactly:
     - the discount applies to food, never to driving
     - the delivery fee sits outside the discount
     - the fee is waived from `business.freeDeliveryFrom` on the food subtotal
     - an unknown postcode charges no fee; that is agreed in the chat instead */

import { CONFIG, menu, zoneFor } from './site-data.js';

export const MAX_ITEMS = 200;

/**
 * @param {object} env
 * @param {{items: Record<string, number>, type: string, business: boolean, postcode: string}} req
 * @returns {Promise<{lines: Array, subtotal: number, discount: number, discountPercent: number,
 *                    fee: number, total: number, zone: object|null, belowMinimum: boolean}>}
 */
export async function quote(env, req) {
  const prices = await menu(env);
  const type = req.type === 'pickup' ? 'pickup' : 'delivery';
  const business = !!req.business;

  const lines = [];
  let subtotal = 0;
  let units = 0;

  for (const [id, rawQty] of Object.entries(req.items || {})) {
    const qty = Math.floor(Number(rawQty));
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const dish = prices.get(id);
    if (!dish) throw new PricingError('unknown_item', 'Unknown menu item: ' + id);
    units += qty;
    if (units > MAX_ITEMS) throw new PricingError('too_many_items', 'Order exceeds ' + MAX_ITEMS + ' items');
    const amount = dish.price * qty;
    subtotal += amount;
    lines.push({ id, name: dish.name, qty, unit: dish.price, amount });
  }

  if (!lines.length) throw new PricingError('empty_cart', 'The basket is empty');

  const order = CONFIG.order || {};
  const percent = (business && type === 'pickup' && order.businessPickupDiscountPercent != null)
    ? order.businessPickupDiscountPercent
    : (order.directDiscountPercent || 0);
  const discount = Math.round(subtotal * percent / 100);

  const zone = type === 'delivery' ? zoneFor(req.postcode) : null;
  const b = CONFIG.business || {};
  const threshold = b.freeDeliveryFrom != null ? b.freeDeliveryFrom * 100 : Infinity;
  const waived = subtotal >= threshold && (!b.freeDeliveryBusinessOnly || business);
  const fee = (zone && !waived) ? Math.round(zone.fee * 100) : 0;

  const total = subtotal - discount + fee;
  if (total <= 0) throw new PricingError('zero_total', 'Nothing to pay');

  return {
    lines,
    subtotal,
    discount,
    discountPercent: percent,
    fee,
    total,
    zone,
    // Advisory only, exactly as in the browser: a sub-minimum order is flagged
    // in the chat, never refused. It must not block a payment either.
    belowMinimum: !!(zone && subtotal < zone.minimum * 100)
  };
}

export class PricingError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/** Cents -> the string PayPal wants: "23.40". */
export function toAmount(cents) {
  return (cents / 100).toFixed(2);
}
