/* What was actually sold, month by month.
   ---------------------------------------------------------------------------
   The settlement report (/api/reports/settlement) counts PAYMENTS, and a cash
   order never creates one — so for as long as it was the only figure available
   it understated every day the restaurant did business at the door. Orders are
   recorded now, cash included, so this is the first view that can answer "what
   did we take" rather than "what did PayPal take".

   Money is counted from what actually settled, not from what was ordered:

     cash        the order total, because nobody pays a card fee on it and the
                 order is the receipt
     online      the PAYMENT's amount less anything refunded, and only once it
                 reached `captured` — an abandoned checkout leaves an order row
                 behind, and counting it would invent revenue

   An online order still waiting or failed is shown separately rather than
   folded in. A figure that quietly includes money that never arrived is worse
   than no figure, because it goes in the books.

   Navigation is two links and a month box. Admin pages carry `default-src
   'none'` and have no script at all, which is worth more than any calendar
   widget. */

import { layout, esc, newNonce, adminHeaders } from './pages.js';

const money = (cents) => (cents / 100).toFixed(2).replace('.', ',') + ' €';

/* UTC in the database, Berlin on the till. `orders.created_at` is SQLite's
   datetime('now') and carries no zone at all — JavaScript reads that as local
   time and silently files a 23:00 order under the wrong day. The zone is added
   only where it is missing. */
function berlinDay(stamp) {
  const text = String(stamp || '');
  const utc = /[Z+]/.test(text) ? text : text.replace(' ', 'T') + 'Z';
  const date = new Date(utc);
  return isNaN(date.getTime())
    ? '' : date.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/** 'YYYY-MM' + n months, without touching the local timezone. */
function shiftMonth(month, n) {
  const [y, m] = month.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthName(month) {
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

export async function page(request, env, url) {
  const thisMonth = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }).slice(0, 7);
  const asked = String(url.searchParams.get('month') || '');
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(asked) ? asked : thisMonth;

  /* Widened by a day at each end and narrowed in JS, where the timezone is
     actually known. A month of one restaurant's orders is a few hundred rows,
     and correctness across a DST boundary is worth more than the index. */
  const { results } = await env.DB.prepare(
    `SELECT o.created_at, o.order_type, o.pay_method, o.total, o.business,
            p.status AS payment_status, p.amount AS paid_amount,
            p.refunded_amount AS refunded
       FROM orders o
       LEFT JOIN payments p ON p.id = o.payment_id
      WHERE substr(o.created_at, 1, 7) BETWEEN ?1 AND ?2
      ORDER BY o.created_at`
  ).bind(shiftMonth(month, -1), shiftMonth(month, 1)).all();

  const SETTLED = new Set(['captured', 'partially_refunded', 'refunded']);
  const days = new Map();
  const totals = {
    orders: 0, net: 0, cash: 0, cashNet: 0, online: 0, onlineNet: 0,
    delivery: 0, pickup: 0, business: 0, unsettled: 0, unsettledValue: 0
  };

  for (const row of results) {
    const day = berlinDay(row.created_at);
    if (!day.startsWith(month)) continue;

    const isCash = row.pay_method !== 'online';
    // Only money that actually arrived counts. See the note at the top.
    const settled = isCash || SETTLED.has(row.payment_status);
    const net = isCash
      ? row.total
      : Math.max(0, (row.paid_amount || 0) - (row.refunded || 0));

    if (!settled) {
      totals.unsettled += 1;
      totals.unsettledValue += row.total;
      continue;
    }

    totals.orders += 1;
    totals.net += net;
    if (isCash) { totals.cash += 1; totals.cashNet += net; }
    else { totals.online += 1; totals.onlineNet += net; }
    if (row.order_type === 'pickup') totals.pickup += 1; else totals.delivery += 1;
    if (row.business) totals.business += 1;

    const seen = days.get(day) || { day, orders: 0, net: 0, cash: 0, online: 0 };
    seen.orders += 1;
    seen.net += net;
    if (isCash) seen.cash += 1; else seen.online += 1;
    days.set(day, seen);
  }

  const nonce = newNonce();
  return new Response(
    render({
      month, thisMonth, totals,
      days: [...days.values()].sort((a, b) => b.day.localeCompare(a.day)),
      nonce
    }),
    { headers: adminHeaders(nonce) }
  );
}

const CSS = `
 .nav{display:flex;align-items:center;gap:10px;margin:0 0 16px}
 .nav a{flex:none;display:block;padding:9px 14px;border:1px solid #d8cbb0;background:#fff;
        color:#1c1409;text-decoration:none;font-size:18px;line-height:1}
 .nav a.off{opacity:.35;pointer-events:none}
 .nav b{flex:1;text-align:center;font-size:16px}
 .jump{display:flex;gap:8px;margin:0 0 18px}
 .jump input{flex:1;min-width:0;padding:9px;font-size:16px;border:1px solid #d8cbb0;
             background:#fffdf9}
 .jump button{flex:none;padding:9px 14px;border:1px solid #d8cbb0;background:#faf7f2;
              cursor:pointer;font-size:13.5px}
 .cards{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:8px}
 .card{flex:1 1 130px;background:#fff;border:1px solid #e6dcc9;padding:10px 12px}
 .card b{display:block;font-size:22px}
 .card span{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#7a6030}
 .card.big{flex:1 1 100%}
 .split{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px}
 .split div{flex:1 1 130px;background:#fff;border:1px solid #e6dcc9;padding:9px 11px;
            font-size:13.5px}
 .split span{color:#7a6030}
 table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #e6dcc9}
 th,td{padding:10px;text-align:left;border-bottom:1px solid #f0e8d8;font-size:14px}
 th{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#7a6030}
 td.amt,th.amt{text-align:right;white-space:nowrap}
 td a{color:#1c1409;font-weight:600}
 .empty{padding:18px;color:#7a6030;background:#fff;border:1px solid #e6dcc9}
 .warn{border:1px solid #e8c9a0;background:#fdf0e0;padding:10px 12px;margin:14px 0;
       font-size:13.5px;color:#a04a00}
`;

export function render({ month, thisMonth, totals, days, nonce }) {
  const prev = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);
  // Nothing to see in the future; the link is drawn but dimmed so the row
  // does not jump about between months.
  const nextOff = next > thisMonth ? ' off' : '';

  const rows = days.map((d) => `<tr>
      <td><a href="/admin/orders?day=${esc(d.day)}">${esc(d.day)}</a></td>
      <td>${d.orders}</td>
      <td>${d.cash} / ${d.online}</td>
      <td class="amt">${money(d.net)}</td>
    </tr>`).join('');

  const body = `<h1>Sales</h1>
<div class="sub">Everything ordered through the website — cash and card</div>

<div class="nav">
  <a href="/admin/sales?month=${esc(prev)}" aria-label="Previous month">&lsaquo;</a>
  <b>${esc(monthName(month))}</b>
  <a class="${nextOff.trim()}" href="/admin/sales?month=${esc(next)}" aria-label="Next month">&rsaquo;</a>
</div>

<form class="jump" method="get" action="/admin/sales">
  <input type="month" name="month" value="${esc(month)}" aria-label="Jump to month">
  <button type="submit">Go</button>
</form>

<div class="cards">
  <div class="card big"><span>Taken this month</span><b>${money(totals.net)}</b></div>
  <div class="card"><span>Orders</span><b>${totals.orders}</b></div>
  <div class="card"><span>Cash</span><b>${totals.cash}</b></div>
  <div class="card"><span>Paid online</span><b>${totals.online}</b></div>
</div>

<div class="split">
  <div><span>Cash</span><br>${money(totals.cashNet)}</div>
  <div><span>Online</span><br>${money(totals.onlineNet)}</div>
  <div><span>Delivery / Pickup</span><br>${totals.delivery} / ${totals.pickup}</div>
  <div><span>Company orders</span><br>${totals.business}</div>
</div>

${totals.unsettled ? `<div class="warn"><b>${totals.unsettled} order(s)
  not counted</b> — started an online payment that never completed
  (${money(totals.unsettledValue)} of baskets). They are left out on purpose:
  the money did not arrive, and a total that includes it goes into the books
  wrong.</div>` : ''}

${days.length ? `<table>
  <thead><tr><th>Day</th><th>Orders</th><th>Cash / online</th><th class="amt">Taken</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<p class="note">Tap a day to see the orders themselves. Online figures are net
of refunds and count only payments that actually settled — cross-check the
month against PayPal before it goes in the books.</p>`
  : `<div class="empty">No orders through the website in ${esc(monthName(month))}.</div>`}`;

  return layout({
    title: 'Sales', nonce, body, logout: true, back: '/admin', extraCss: CSS
  });
}
