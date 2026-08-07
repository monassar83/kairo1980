/* Telling the restaurant that money arrived.
   ---------------------------------------------------------------------------
   The order and the money have always travelled by different paths. The money
   is taken server-side and confirmed by a signed webhook, so it cannot go
   missing. The ORDER is composed in the guest's own browser and handed to
   WhatsApp by the guest — which means a guest who pays and then closes the tab
   has bought food nobody has been told to cook. That happened, with a real
   customer, and it was only noticed because the restaurant happened to look at
   /admin.

   So this sends the order from the one place that already knows the money is
   real: the transition to `captured`. Not from the browser — the browser is
   exactly the party that may have already gone.

   WHAT IT DOES NOT DO is as important as what it does. It carries no name, no
   phone number and no address, because the server has never held any: see
   migrations/0001_payments.sql. It sends the reference, what was ordered, what
   it cost, and where it is going as a postcode. That is enough to recognise the
   order when the guest rings up, and it keeps this change clear of the privacy
   rewrite that delivering the FULL order server-side would require (a retention
   period, Meta as a processor, § 312i BGB). See docs/next-whatsapp-cloud-api.md
   — this is step 1 of that plan, running in parallel with the guest's own
   handover, and it is deliberately the cheap half.

   Telegram rather than WhatsApp for now because WhatsApp's Cloud API cannot use
   a number that is signed in to the WhatsApp Business App, and that app is the
   one the restaurant actually watches. Moving the number would take the shop
   off the app it runs on. A second number and an approved template are the
   proper answer and are days of Meta onboarding; this is minutes, and the hole
   is open tonight.

   UNCONFIGURED IS OFF, not broken. With no token the site behaves exactly as it
   did before — the same call the admin area makes, for the same reason: a lock
   nobody has set up is not an unlocked door. */

const API = 'https://api.telegram.org';

/** Is anybody listening? Both halves or neither: a token with no chat id has
 *  nowhere to send and would fail on every order. */
export function notifyConfigured(env) {
  return !!(env && env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID);
}

/** Cents -> "47,80 €", in the restaurant's own reading, not the guest's. The
 *  currency comes off the payment row rather than being assumed. */
function money(cents, currency) {
  const amount = (Number(cents || 0) / 100).toFixed(2).replace('.', ',');
  return currency === 'EUR' || !currency ? `${amount} €` : `${amount} ${currency}`;
}

/** Berlin's clock, because that is the one the kitchen runs on. */
function berlinTime(iso) {
  try {
    return new Date(iso).toLocaleString('de-DE', {
      timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit',
      day: '2-digit', month: '2-digit'
    });
  } catch {
    return String(iso || '');
  }
}

/** The message. Plain text on purpose: no Markdown, no HTML parse mode, so a
 *  dish name containing an underscore or an asterisk cannot break the send —
 *  a notification that fails to render is a notification that did not arrive. */
export function composeOrderMessage(payment) {
  const lines = [];
  lines.push('NEUE BEZAHLTE BESTELLUNG');
  lines.push('');
  lines.push(`Referenz: ${payment.reference}`);

  const type = payment.order_type === 'pickup' ? 'Abholung' : 'Lieferung';
  lines.push(`Art:      ${type}${payment.postcode ? ` — ${payment.postcode}` : ''}`);
  lines.push(`Betrag:   ${money(payment.amount, payment.currency)}`);
  lines.push(`Bezahlt:  ${berlinTime(payment.captured_at)} (${payment.provider || 'paypal'})`);
  lines.push('');

  /* The basket, read out of the row the server priced. `lines` is JSON written
     by pricing.js; a row that cannot be parsed still sends the rest, because a
     notification missing its item list beats no notification at all. */
  let items = [];
  try {
    items = JSON.parse(payment.lines || '[]');
  } catch {
    items = [];
  }
  if (items.length) {
    for (const item of items) {
      lines.push(`${item.qty}x ${item.name}`);
    }
  } else {
    lines.push('(Positionen konnten nicht gelesen werden — siehe /admin)');
  }

  lines.push('');
  lines.push('Der Gast sendet die Bestellung ggf. zusätzlich per WhatsApp.');
  return lines.join('\n');
}

/** Send it. Never throws, never returns a rejected promise: a notification is
 *  the last thing that may be allowed to fail a payment, and by the time this
 *  runs the money is already taken. Every failure is logged and swallowed. */
export async function sendOrderNotification(env, payment) {
  if (!notifyConfigured(env) || !payment) return false;

  try {
    const res = await fetch(`${API}/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text: composeOrderMessage(payment),
        disable_web_page_preview: true
      })
    });

    if (!res.ok) {
      // The body names the cause — a revoked token, a chat the bot was removed
      // from — and none of it is a secret worth withholding from our own logs.
      console.error('order notification refused', res.status, (await res.text()).slice(0, 300));
      return false;
    }
    return true;
  } catch (err) {
    console.error('order notification failed', err && err.message);
    return false;
  }
}
