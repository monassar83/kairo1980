/* The kitchen's view of what has been paid for.
   ---------------------------------------------------------------------------
   Orders arrive in WhatsApp and that does not change. This is the safety net
   underneath: every payment the provider actually settled, and — the reason it
   exists — every paid order that never reached the chat, because a guest who
   pays and closes the tab is owed food and would otherwise be invisible.

   Deliberately NOT a customer-facing surface and not an order queue. It cannot
   show a name, a phone number or an address, because those never reach this
   server. It shows what was paid, for what, and whether it arrived.

   Basic auth rather than a token in the URL: a phone can open it, and a URL
   with a credential in it ends up in browser history and in logs. */

const ESCAPE = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ESCAPE[c]);
const money = (cents) => (cents / 100).toFixed(2).replace('.', ',') + ' €';
const clock = (iso) => (iso || '').slice(11, 16);

export function unauthorised() {
  return new Response('Not authorised.', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="KAIRO 1980", charset="UTF-8"',
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

/** The password is REPORT_TOKEN; the username is ignored. */
export function checkBasic(request, token) {
  const header = request.headers.get('authorization') || '';
  const match = header.match(/^Basic (.+)$/);
  if (!match || !token) return false;
  let decoded = '';
  try { decoded = atob(match[1]); } catch { return false; }
  const offered = decoded.slice(decoded.indexOf(':') + 1);
  if (offered.length !== token.length) return false;
  let diff = 0;
  for (let i = 0; i < offered.length; i++) diff |= offered.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}

export function render({ day, orders, orphans, totals }) {
  const row = (o, flagged) => {
    const items = JSON.parse(o.lines || '[]')
      .map((l) => `${l.qty}× ${esc(l.name)}`).join(', ');
    return `<tr class="${flagged ? 'flag' : ''}">
      <td class="ref">${esc(o.reference)}</td>
      <td>${clock(o.captured_at)}</td>
      <td>${o.order_type === 'pickup' ? 'Abholung' : 'Lieferung'}</td>
      <td class="items">${items}</td>
      <td class="amt">${money(o.amount)}</td>
      <td class="st">${flagged ? 'NICHT GESENDET' : (o.status === 'pending' ? 'in Prüfung' : 'ok')}</td>
    </tr>`;
  };

  const orphanRows = orphans.map((o) => row(o, true)).join('');
  const orderRows = orders.map((o) => row(o, false)).join('');

  return `<!doctype html><html lang="de"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Bezahlte Bestellungen · KAIRO 1980</title>
<style>
 *{box-sizing:border-box}
 body{margin:0;padding:16px;font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      background:#faf7f2;color:#1c1409}
 h1{font-size:17px;margin:0 0 2px}
 .sub{color:#7a6030;font-size:13px;margin-bottom:16px}
 .cards{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px}
 .card{flex:1 1 130px;background:#fff;border:1px solid #e6dcc9;padding:10px 12px}
 .card b{display:block;font-size:20px}
 .card span{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#7a6030}
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
 .note{margin-top:16px;font-size:12px;color:#7a6030;line-height:1.65}
 @media(max-width:560px){.items{display:none}}
</style></head><body>
<h1>Bezahlte Bestellungen</h1>
<div class="sub">${esc(day)} · Zahlungen, die der Anbieter tatsächlich abgerechnet hat</div>

<div class="cards">
  <div class="card"><span>Bestellungen</span><b>${totals.orders}</b></div>
  <div class="card"><span>Netto</span><b>${money(totals.net)}</b></div>
  <div class="card"><span>Nicht gesendet</span><b>${orphans.length}</b></div>
</div>

${orphans.length ? `<table><thead><tr><th>Nr.</th><th>Zeit</th><th>Art</th><th>Inhalt</th><th class="amt">Betrag</th><th>Status</th></tr></thead><tbody>${orphanRows}</tbody></table>
<p class="note"><b>Nicht gesendet</b> heißt: bezahlt, aber die WhatsApp-Nachricht wurde nie abgeschickt. Die Bestellung ist bezahlt und der Gast wartet darauf. Nummer notieren — der Gast nennt sie, wenn er sich meldet.</p>` : ''}

${orderRows ? `<table style="margin-top:${orphans.length ? '18px' : '0'}"><thead><tr><th>Nr.</th><th>Zeit</th><th>Art</th><th>Inhalt</th><th class="amt">Betrag</th><th>Status</th></tr></thead><tbody>${orderRows}</tbody></table>`
  : `<div class="empty">Heute noch keine Online-Zahlung.</div>`}

<p class="note">Name, Telefon und Adresse stehen bewusst nicht hier — die stehen nur in der WhatsApp-Nachricht. Diese Seite ist die Gegenprobe, keine Bestellliste.</p>
</body></html>`;
}
