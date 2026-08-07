/* The kitchen's view of the orders themselves.
   ---------------------------------------------------------------------------
   This page used to be a cross-check on payments and nothing more, because the
   order did not exist on this server: it said what had been paid and could not
   say who by or where to. A guest who paid and never pressed send in WhatsApp
   left a row here that was owed food and impossible to deliver.

   Orders are recorded now (worker/orders.js), so this is the queue. It is also
   the ONLY place a customer's name, telephone number and address are ever
   shown — they are never put in a notification, because the notification
   travels to Telegram, whose company is outside the EU. The details stay here,
   behind the login, on a server in the EU, and are deleted by the nightly sweep
   once the limitation period has run (docs/data-retention.md).

   The telephone number is a `tel:` link on purpose. The complaint that produced
   this page was "I cannot even call him". */

import { layout, esc, newNonce, adminHeaders } from './pages.js';

const money = (cents) => (cents / 100).toFixed(2).replace('.', ',') + ' €';
const clock = (iso) => (iso || '').slice(11, 16);

export async function page(request, env, url) {
  // Berlin, because that is the day the restaurant is working.
  const day = (url.searchParams.get('day') ||
    new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' })).slice(0, 10);

  /* Timestamps are UTC; the working day is Berlin's. Comparing one against the
     other files a 23:00 order under tomorrow and hides it. The window is
     widened by a day either side in SQL and narrowed in JS, where the timezone
     is actually known — a day's orders is a handful of rows, and correctness
     across a DST boundary is worth more than the index. */
  /* Two tables, two timestamp formats, both UTC. `payments` is written by JS
     and carries a real ISO string with its Z; `orders` is written by SQLite's
     datetime('now'), which is "YYYY-MM-DD HH:MM:SS" with no zone at all — and
     JavaScript reads THAT as local time, which silently shifts the day. So the
     zone is added only when it is missing, rather than assumed either way. */
  const berlinDay = (stamp) => {
    const text = String(stamp || '');
    const utc = /[Z+]|\d{2}:\d{2}$/.test(text.slice(10)) && /[Z+]/.test(text)
      ? text
      : text.replace(' ', 'T') + 'Z';
    const date = new Date(utc);
    return isNaN(date.getTime()) ? '' : date.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
  };

  const { results: rows } = await env.DB.prepare(
    `SELECT o.*, p.status AS payment_status
       FROM orders o
       LEFT JOIN payments p ON p.id = o.payment_id
      WHERE substr(o.created_at, 1, 10) BETWEEN date(?1, '-1 day') AND date(?1, '+1 day')
      ORDER BY o.created_at DESC`
  ).bind(day).all();

  /* Paid, but no order row: the money arrived and the browser died before it
     could say what the money was for. Rare, and the one case still missing a
     name — so it is listed loudly rather than folded in with the rest. */
  const { results: unmatched } = await env.DB.prepare(
    `SELECT p.reference, p.amount, p.order_type, p.captured_at, p.lines
       FROM payments p
      WHERE p.captured_at IS NOT NULL
        AND substr(p.captured_at, 1, 10) BETWEEN date(?1, '-1 day') AND date(?1, '+1 day')
        AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.payment_id = p.id)
      ORDER BY p.captured_at DESC`
  ).bind(day).all();

  const orders = rows.filter((o) => berlinDay(o.created_at) === day);
  const orphans = unmatched.filter((o) => berlinDay(o.captured_at) === day);

  const totals = orders.reduce((a, o) => ({
    orders: a.orders + 1,
    net: a.net + o.total,
    cash: a.cash + (o.pay_method === 'onsite' ? 1 : 0)
  }), { orders: 0, net: 0, cash: 0 });

  const nonce = newNonce();
  return new Response(
    render({ day, orders, orphans, totals, nonce }),
    { headers: adminHeaders(nonce) }
  );
}

const CSS = `
 .cards{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px}
 .card{flex:1 1 120px;background:#fff;border:1px solid #e6dcc9;padding:10px 12px}
 .card b{display:block;font-size:20px}
 .card span{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#7a6030}
 .order{background:#fff;border:1px solid #e6dcc9;margin:0 0 12px;padding:12px 14px}
 .order.cash{border-inline-start:4px solid #a04a00}
 .order.paid{border-inline-start:4px solid #31601f}
 .otop{display:flex;flex-wrap:wrap;gap:8px;align-items:baseline;margin-bottom:8px}
 .ref{font-weight:700;font-size:16px;letter-spacing:.04em}
 .when{color:#7a6030;font-size:12.5px}
 .tag{font-size:11px;letter-spacing:.06em;text-transform:uppercase;padding:2px 7px;
      border:1px solid #d8cbb0;color:#5a4020}
 .tag.cash{background:#fdf0e0;border-color:#e8c9a0;color:#a04a00;font-weight:700}
 .tag.paid{background:#eef6ea;border-color:#bcd8b0;color:#31601f;font-weight:700}
 .amt{margin-inline-start:auto;font-weight:700;white-space:nowrap}
 .who{margin:8px 0;line-height:1.6;font-size:14px}
 .who a{color:#1c1409;font-weight:700}
 .who .lbl{display:inline-block;min-width:74px;color:#7a6030;font-size:12px;
           letter-spacing:.06em;text-transform:uppercase}
 .items{color:#5a4020;font-size:13.5px;border-top:1px solid #f0e8d8;padding-top:8px}
 .note-in{background:#fdf9ef;border:1px solid #e6dcc9;padding:7px 9px;margin-top:8px;
          font-size:13.5px}
 .gone{color:#7a6030;font-style:italic;font-size:13px}
 .empty{padding:18px;color:#7a6030;background:#fff;border:1px solid #e6dcc9}
 .warn{border:1px solid #e8c9a0;background:#fdf0e0;padding:10px 12px;margin-bottom:14px;
       font-size:13.5px;color:#a04a00}
`;

export function render({ day, orders, orphans, totals, nonce }) {
  const itemsOf = (json) => {
    try {
      return JSON.parse(json || '[]').map((l) => `${l.qty}× ${esc(l.name)}`).join(', ');
    } catch {
      return '—';
    }
  };

  const card = (o) => {
    const cash = o.pay_method === 'onsite';
    const delivery = o.order_type === 'delivery';
    const purged = !!o.details_purged_at;

    /* A telephone number with spaces in it is not a dialable href. Everything
       that is not a digit or a leading + goes, and what is shown keeps the
       spacing the guest typed. */
    const dial = String(o.customer_phone || '').replace(/[^\d+]/g, '');

    const who = purged
      ? '<p class="gone">Contact details deleted (retention period elapsed).</p>'
      : `<div class="who">
          ${o.customer_name ? `<div><span class="lbl">Name</span>${esc(o.customer_name)}</div>` : ''}
          ${o.customer_company ? `<div><span class="lbl">Company</span>${esc(o.customer_company)}</div>` : ''}
          ${o.customer_phone ? `<div><span class="lbl">Phone</span><a href="tel:${esc(dial)}">${esc(o.customer_phone)}</a></div>` : ''}
          ${delivery && o.customer_address ? `<div><span class="lbl">Address</span>${esc(o.customer_address)}${o.postcode ? ', ' + esc(o.postcode) : ''}</div>` : ''}
          ${o.requested_time ? `<div><span class="lbl">Time</span>${esc(o.requested_time)}</div>` : ''}
        </div>`;

    return `<div class="order ${cash ? 'cash' : 'paid'}">
      <div class="otop">
        <span class="ref">${esc(o.reference)}</span>
        <span class="when">${clock(o.created_at)}</span>
        <span class="tag">${delivery ? 'Delivery' : 'Pickup'}</span>
        <span class="tag ${cash ? 'cash' : 'paid'}">${cash ? 'PAY ON ARRIVAL' : 'PAID ONLINE'}</span>
        ${o.business ? '<span class="tag">Company</span>' : ''}
        <span class="amt">${money(o.total)}</span>
      </div>
      ${who}
      <div class="items">${itemsOf(o.lines)}</div>
      ${!purged && o.notes ? `<div class="note-in"><b>Note:</b> ${esc(o.notes)}</div>` : ''}
    </div>`;
  };

  const orphanCard = (o) => `<div class="order cash">
    <div class="otop">
      <span class="ref">${esc(o.reference)}</span>
      <span class="when">${clock(o.captured_at)}</span>
      <span class="tag ${o.order_type === 'pickup' ? '' : ''}">${o.order_type === 'pickup' ? 'Pickup' : 'Delivery'}</span>
      <span class="tag paid">PAID ONLINE</span>
      <span class="amt">${money(o.amount)}</span>
    </div>
    <p class="gone">No order details reached us for this payment.</p>
    <div class="items">${itemsOf(o.lines)}</div>
  </div>`;

  const body = `<h1>Orders</h1>
<div class="sub">${esc(day)} · every order placed through the website</div>

<div class="cards">
  <div class="card"><span>Orders</span><b>${totals.orders}</b></div>
  <div class="card"><span>Value</span><b>${money(totals.net)}</b></div>
  <div class="card"><span>Pay on arrival</span><b>${totals.cash}</b></div>
</div>

${orphans.length ? `<div class="warn"><b>Paid, but no order details.</b> The money
  arrived and the browser closed before it could say who it was for. The guest
  is owed food and will quote the reference — the basket is below.</div>
  ${orphans.map(orphanCard).join('')}` : ''}

${orders.length ? orders.map(card).join('')
  : `<div class="empty">No orders through the website yet today.</div>`}

<p class="note">Orders reach this page whether or not the guest sent the WhatsApp
message. Contact details are shown here only, never in a notification, and are
deleted automatically once the limitation period has run.</p>`;

  return layout({
    title: 'Orders', nonce, body, logout: true, back: '/admin', extraCss: CSS
  });
}
