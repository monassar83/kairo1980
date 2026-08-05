/* The admin area: /admin and everything under it.
   ---------------------------------------------------------------------------
   One login covers every page here. The session is a signed cookie (auth.js),
   so there is no session table to keep and nothing to clean up.

   Every route follows the same shape: no valid session means the login form
   and nothing else — not a redirect that leaks where you were going, not a
   partial page. A page that is not rendered cannot leak what is on it. */

import { checkCredentials, configured, hasSession, issueSession, clearSession } from './auth.js';
import { loginPage, dashboardPage, newNonce, adminHeaders } from './pages.js';
import * as ordersView from './orders.js';

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
    return html(dashboardPage({ nonce }), nonce);
  }

  if (path === '/admin/orders' && method === 'GET') return ordersView.page(request, env, url);

  return new Response('Not found.', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

async function login(request, env, url) {
  let form;
  try {
    form = await request.formData();
  } catch {
    return loginResponse(env, { error: true, status: 400 });
  }

  const ok = await checkCredentials(env, form.get('username'), form.get('password'));
  if (!ok) {
    // Worth seeing in the log: a run of these is somebody trying.
    console.warn('admin login failed', request.headers.get('cf-connecting-ip') || 'unknown');
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
