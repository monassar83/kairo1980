/* The kitchen's view of what has been paid for.
   ---------------------------------------------------------------------------
   Orders arrive in WhatsApp and that does not change. This is the safety net
   underneath: every payment the provider actually settled, and — the reason it
   exists — every paid order that never reached the chat, because a guest who
   pays and closes the tab is owed food and would otherwise be invisible.

   Deliberately NOT a customer-facing surface and not an order queue. It cannot
   show a name, a phone number or an address, because those never reach this
   server. It shows what was paid, for what, and whether it arrived. */

import { layout, esc, newNonce, adminHeaders } from './pages.js';

const money = (cents) => (cents / 100).toFixed(2).replace('.', ',') + ' €';
const clock = (iso) => (iso || '').slice(11, 16);

export async function page(request, env, url) {
  // Berlin, because that is the day the restaurant is working.
  const day = (url.searchParams.get('day') ||
    new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' })).slice(0, 10);

  /* captured_at is UTC; the working day is Berlin's. Comparing one against the
     other files a 23:00 order under tomorrow and hides it. The window is
     widened by a day either side in SQL and narrowed in JS, where the timezone
     is actually known — a day's orders is a handful of rows, and correctness
     across a DST boundary is worth more than the index. */
  const berlinDay = (iso) =>
    new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });

  const { results: window } = await env.DB.prepare(
    `SELECT p.reference, p.amount, p.order_type, p.captured_at, p.lines, p.status,
            EXISTS (SELECT 1 FROM payment_events e
                     WHERE e.payment_id = p.id AND e.event_type = 'order.handed_over') AS sent
       FROM payments p
      WHERE p.captured_at IS NOT NULL
        AND substr(p.captured_at, 1, 10) BETWEEN date(?1, '-1 day') AND date(?1, '+1 day')
      ORDER BY p.captured_at DESC`
  ).bind(day).all();

  const onDay = window.filter((o) => berlinDay(o.captured_at) === day);
  const orphans = onDay.filter((o) => !o.sent);

  const totals = onDay.reduce((a, o) => ({
    orders: a.orders + 1, net: a.net + o.amount
  }), { orders: 0, net: 0 });

  // Orphans are listed separately above, so they are not repeated below.
  const flagged = new Set(orphans.map((o) => o.reference));
  const rest = onDay.filter((o) => !flagged.has(o.reference));

  const nonce = newNonce();
  return new Response(
    render({ day, orders: rest, orphans, totals, nonce }),
    { headers: adminHeaders(nonce) }
  );
}

const CSS = `
 table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #e6dcc9}
 th,td{padding:9px 10px;text-align:left;border-bottom:1px solid #f0e8d8;font-size:13.5px;
       vertical-align:top}
 th{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#7a6030}
 .ref{font-weight:700;white-space:nowrap}
 .amt{text-align:right;white-space:nowrap}
 .items{color:#5a4020}
 .st{white-space:nowrap;font-size:12px}
 tr.flag{background:#fdf0e0}
 tr.flag .st{color:#a04a00;font-weight:700}
 .empty{padding:18px;color:#7a6030;background:#fff;border:1px solid #e6dcc9}
 .cards{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px}
 .card{flex:1 1 130px;background:#fff;border:1px solid #e6dcc9;padding:10px 12px}
 .card b{display:block;font-size:20px}
 .card span{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#7a6030}
 .spaced{margin-top:18px}
 @media(max-width:560px){.items{display:none}}
`;

export function render({ day, orders, orphans, totals, nonce }) {
  const row = (o, flagged) => {
    const items = JSON.parse(o.lines || '[]')
      .map((l) => `${l.qty}× ${esc(l.name)}`).join(', ');
    return `<tr class="${flagged ? 'flag' : ''}">
      <td class="ref">${esc(o.reference)}</td>
      <td>${clock(o.captured_at)}</td>
      <td>${o.order_type === 'pickup' ? 'Pickup' : 'Delivery'}</td>
      <td class="items">${items}</td>
      <td class="amt">${money(o.amount)}</td>
      <td class="st">${flagged ? 'NOT SENT' : (o.status === 'pending' ? 'under review' : 'ok')}</td>
    </tr>`;
  };

  const head = `<thead><tr><th>Ref.</th><th>Time</th><th>Type</th><th>Items</th>
    <th class="amt">Amount</th><th>Status</th></tr></thead>`;

  const body = `<h1>Paid orders</h1>
<div class="sub">${esc(day)} · payments the provider actually settled</div>

<div class="cards">
  <div class="card"><span>Orders</span><b>${totals.orders}</b></div>
  <div class="card"><span>Net</span><b>${money(totals.net)}</b></div>
  <div class="card"><span>Not sent</span><b>${orphans.length}</b></div>
</div>

${orphans.length ? `<table>${head}<tbody>${orphans.map((o) => row(o, true)).join('')}</tbody></table>
<p class="note"><b>Not sent</b> means: paid for, but the WhatsApp message was never sent. The order is paid and the guest is waiting for it. Note the reference — the guest will quote it when they get in touch.</p>` : ''}

${orders.length ? `<table class="${orphans.length ? 'spaced' : ''}">${head}<tbody>${orders.map((o) => row(o, false)).join('')}</tbody></table>`
  : `<div class="empty">No online payments yet today.</div>`}

<p class="note">Name, phone and address are deliberately not here — they exist only in the WhatsApp message. This page is the cross-check, not an order queue.</p>`;

  return layout({
    title: 'Paid orders', nonce, body, logout: true, back: '/admin', extraCss: CSS
  });
}
