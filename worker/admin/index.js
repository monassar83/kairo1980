/* The admin area: /admin and everything under it.
   ---------------------------------------------------------------------------
   One login covers every page here. The session is a signed cookie (auth.js),
   so there is no session table to keep and nothing to clean up.

   Every route follows the same shape: no valid session means the login form
   and nothing else — not a redirect that leaks where you were going, not a
   partial page. A page that is not rendered cannot leak what is on it. */

import {
  checkCredentials, configured, hasSession, issueSession, clearSession,
  tooManyFailures, recordFailure
} from './auth.js';
import { loginPage, dashboardPage, newNonce, adminHeaders } from './pages.js';
import * as ordersView from './orders.js';
import * as hoursView from './hours.js';
import { readSettings, closeOrdering, openOrdering } from '../settings.js';
import { subscribe, unsubscribe } from '../push.js';

/* Long enough to make scripted guessing tedious, short enough that a mistyped
   password does not feel like a broken page. It is not a defence against a
   distributed attack — the password's own length is that — but it costs
   nothing and it takes the cheapest attack off the table. */
const FAILED_LOGIN_DELAY_MS = 400;

export async function handle(request, env, url) {
  const path = url.pathname.replace(/\/+$/, '') || '/admin';
  const method = request.method.toUpperCase();

  if (path === '/admin/login' && method === 'POST') return login(request, env, url);
  if (path === '/admin/logout' && method === 'POST') return logout(url);

  // Everything below is behind the session.
  const signedIn = await hasSession(env, request);
  if (!signedIn) return loginResponse(env, { next: path === '/admin' ? null : path });

  if (path === '/admin' && method === 'GET') {
    const nonce = newNonce();
    const { ordering, hours, hoursAreCustom } = await readSettings(env);
    // Public by definition — the browser needs it to subscribe, and a
    // subscription is worth nothing without the private half.
    return html(dashboardPage({
      nonce, ordering, hours, hoursAreCustom, vapidKey: env.VAPID_PUBLIC_KEY || ''
    }), nonce);
  }

  if (path === '/admin/ordering' && method === 'POST') return setOrdering(request, env);
  if (path === '/admin/hours' && method === 'GET') return hoursView.page(request, env, url);
  if (path === '/admin/hours' && method === 'POST') return hoursView.save(request, env, url);
  if (path === '/admin/orders' && method === 'GET') return ordersView.page(request, env, url);
  if (path === '/admin/push/on' && method === 'POST') return pushOn(request, env);
  if (path === '/admin/push/off' && method === 'POST') return pushOff(request, env);
  if (path === '/admin/api/latest' && method === 'GET') return latest(env);

  return new Response('Not found.', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

/* The emergency switch. Closing always carries an end with it — the time given,
   or the end of the day — so a shop closed on Saturday night is taking orders
   again on Sunday without anybody remembering to come back here. */
async function setOrdering(request, env) {
  const form = await request.formData();
  if (form.get('open') === '1') {
    await openOrdering(env);
  } else {
    await closeOrdering(env, {
      reason: form.get('reason'),
      minutes: form.get('minutes'),
      untilDate: form.get('untilDate'),
      untilTime: form.get('untilTime')
    });
  }

  return new Response(null, {
    status: 303,
    headers: { Location: '/admin', 'Cache-Control': 'no-store' }
  });
}

/* --- notifications --------------------------------------------------------
   All three are behind the session like everything else here, which is what
   makes them safe: a subscription can only be registered by somebody already
   signed in, and /admin/api/latest — read by the service worker when a push
   arrives — answers only to the same cookie. */

async function pushOn(request, env) {
  const body = await request.json().catch(() => null);
  if (!body) return jsonResponse({ error: 'bad_request' }, 400);
  const ok = await subscribe(env, body);
  return jsonResponse({ ok }, ok ? 200 : 400);
}

async function pushOff(request, env) {
  const body = await request.json().catch(() => ({}));
  if (body.endpoint) await unsubscribe(env, body.endpoint);
  return jsonResponse({ ok: true });
}

/* What the service worker shows. The push itself carries nothing, so this is
   where the words come from — over our own origin, to a signed-in session,
   rather than through a third party's push service. */
async function latest(env) {
  const row = await env.DB.prepare(
    `SELECT reference, amount, order_type, captured_at
       FROM payments
      WHERE captured_at IS NOT NULL
      ORDER BY captured_at DESC LIMIT 1`
  ).first().catch(() => null);

  if (!row) {
    return jsonResponse({ title: 'KAIRO 1980', body: 'Something needs your attention.', url: '/admin' });
  }

  const money = (row.amount / 100).toFixed(2).replace('.', ',') + ' €';
  return jsonResponse({
    title: `Paid: ${money}`,
    body: `${row.order_type === 'pickup' ? 'Pickup' : 'Delivery'} · ${row.reference}`,
    url: '/admin/orders'
  });
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

async function login(request, env, url) {
  let form;
  try {
    form = await request.formData();
  } catch {
    return loginResponse(env, { error: true, status: 400 });
  }

  const ip = request.headers.get('cf-connecting-ip') || '';

  /* Checked before the password is, and answered exactly as a wrong password
     is. Telling a guesser they have been locked out tells them the lockout
     exists and how long to wait; saying nothing new tells them nothing. */
  if (await tooManyFailures(env, ip)) {
    await new Promise((resolve) => setTimeout(resolve, FAILED_LOGIN_DELAY_MS));
    return loginResponse(env, { error: true, status: 401 });
  }

  const ok = await checkCredentials(env, form.get('username'), form.get('password'));
  if (!ok) {
    // Worth seeing in the log: a run of these is somebody trying.
    console.warn('admin login failed', ip || 'unknown');
    await recordFailure(env, ip);
    await new Promise((resolve) => setTimeout(resolve, FAILED_LOGIN_DELAY_MS));
    return loginResponse(env, { error: true, status: 401, next: safeNext(form.get('next')) });
  }

  return new Response(null, {
    status: 303,
    headers: {
      Location: safeNext(form.get('next')) || '/admin',
      'Set-Cookie': await issueSession(env, url),
      'Cache-Control': 'no-store'
    }
  });
}

function logout(url) {
  return new Response(null, {
    status: 303,
    headers: { Location: '/admin', 'Set-Cookie': clearSession(url), 'Cache-Control': 'no-store' }
  });
}

/* Where to go after signing in. Only ever a path inside the admin area: an
   open redirect is a phishing primitive, and "//evil.example" is a URL a
   browser reads as another host however much it looks like a path. */
function safeNext(value) {
  const next = String(value || '');
  if (!next.startsWith('/admin') || next.startsWith('//')) return null;
  return next;
}

function loginResponse(env, { error = false, status = 200, next = null } = {}) {
  const nonce = newNonce();
  let page = loginPage({ nonce, error, unconfigured: !configured(env) });
  if (next) {
    page = page.replace('</form>',
      `<input type="hidden" name="next" value="${next.replace(/"/g, '&quot;')}"></form>`);
  }
  return html(page, nonce, status);
}

export function html(body, nonce, status = 200) {
  return new Response(body, { status, headers: adminHeaders(nonce) });
}
