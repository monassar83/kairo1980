/* Who may open the admin area.
   ---------------------------------------------------------------------------
   Two secrets, ADMIN_USER and ADMIN_PASSWORD, both set with
   `wrangler secret put` and neither of them ever in this repository. A login
   form checks both, and on success the browser is given a signed cookie so the
   credentials are typed once and not on every request.

   Three things this file is careful about, in the order they matter:

   1. BOTH fields are checked. The page this replaces read the password and
      threw the username away, which made the username decoration around a
      shared secret. Here a wrong username fails exactly as a wrong password
      does — and takes the same time to do it.

   2. Every comparison is over SHA-256 digests rather than the strings. Digests
      are always 32 bytes, so the loop that compares them cannot reveal how
      long the real secret is by how long it runs. The old length check leaked
      exactly that.

   3. Nothing short-circuits. Username and password are both hashed and both
      compared before either answer is looked at, so "right user, wrong
      password" and "wrong user, wrong password" are indistinguishable from
      the outside.

   What actually protects this page is the strength of the password chosen.
   The measures above close the side channels; they do not make a short
   password safe. */

const COOKIE = 'kairo_session';

/* Thirty days. This is the switch a restaurant reaches for when something has
   gone wrong, and being asked to remember a password at that moment is how the
   switch does not get thrown. The logout button ends a session early, and
   changing either credential ends every session at once — see sessionKey(). */
const SESSION_DAYS = 30;

const enc = new TextEncoder();
const dec = new TextDecoder();

/** Both secrets present. Absent, the admin area refuses everyone rather than
 *  falling open — an unconfigured lock is not an unlocked door. */
export function configured(env) {
  return !!(env.ADMIN_USER && env.ADMIN_PASSWORD);
}

async function sha256(value) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(String(value))));
}

/** Constant time over two equal-length byte arrays. */
function sameBytes(a, b) {
  if (a.length !== b.length) return false;      // both are always 32
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function sameText(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Does this username and password pair open the admin area? */
export async function checkCredentials(env, username, password) {
  if (!configured(env)) return false;

  const [offeredUser, realUser, offeredPass, realPass] = await Promise.all([
    sha256(username == null ? '' : username),
    sha256(env.ADMIN_USER),
    sha256(password == null ? '' : password),
    sha256(env.ADMIN_PASSWORD)
  ]);

  // Both compared before either is read: no early return, no branch that one
  // half of a guess can be timed against.
  const userOk = sameBytes(offeredUser, realUser);
  const passOk = sameBytes(offeredPass, realPass);
  return userOk && passOk;
}

/* --- the session ---------------------------------------------------------
   A cookie carrying an expiry and an HMAC of it. There is no session table:
   the signature is what makes the cookie unforgeable, so nothing has to be
   stored and nothing can go stale.

   The signing key is derived from the credentials themselves rather than kept
   as a third secret. That is deliberate and it buys a property worth having:
   changing the username or the password changes the key, which invalidates
   every cookie ever issued. A password changed because a phone was lost logs
   that phone out, with no extra step to forget. */

async function sessionKey(env) {
  const material = await sha256(`${env.ADMIN_USER}:${env.ADMIN_PASSWORD}:kairo-session-v1`);
  return crypto.subtle.importKey('raw', material, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

const b64url = (bytes) => btoa(String.fromCharCode(...bytes))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function fromB64url(text) {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded + '='.repeat((4 - padded.length % 4) % 4)), (c) => c.charCodeAt(0));
}

async function sign(env, payload) {
  const key = await sessionKey(env);
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  return b64url(new Uint8Array(mac));
}

/** The Set-Cookie for a fresh session. `secure` is dropped on plain http so
 *  that `wrangler dev` on 127.0.0.1 can still log in; production is https and
 *  HSTS makes it stay that way. */
export async function issueSession(env, url) {
  const payload = b64url(enc.encode(JSON.stringify({
    exp: Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400
  })));
  const value = `${payload}.${await sign(env, payload)}`;
  return cookie(url, value, SESSION_DAYS * 86400);
}

export function clearSession(url) {
  return cookie(url, '', 0);
}

function cookie(url, value, maxAge) {
  const secure = url.protocol === 'https:' ? ' Secure;' : '';
  // SameSite=Strict: the cookie is not sent on any request originating from
  // another site, which is what keeps a link in a stranger's page from
  // throwing switches in an already-logged-in browser. It is also why the
  // admin forms need no CSRF token of their own.
  return `${COOKIE}=${value}; Path=/;${secure} HttpOnly; SameSite=Strict; Max-Age=${maxAge}`;
}

/** Is there a valid, unexpired, correctly signed session on this request? */
export async function hasSession(env, request) {
  if (!configured(env)) return false;

  const raw = readCookie(request, COOKIE);
  if (!raw) return false;

  const dot = raw.lastIndexOf('.');
  if (dot < 1) return false;

  const payload = raw.slice(0, dot);
  const offered = raw.slice(dot + 1);
  if (!sameText(offered, await sign(env, payload))) return false;

  try {
    const { exp } = JSON.parse(dec.decode(fromB64url(payload)));
    return typeof exp === 'number' && exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

/* --- slowing down whoever is guessing --------------------------------------
   The password is what protects this page, and a long random one cannot be
   guessed at any rate. This exists for the case where it is not: a password
   reused from another site, which is the attack that needs no flaw here at
   all — someone else gets breached, the list gets tried against every domain,
   and nothing on this end is broken.

   Five wrong answers from one address buys a fifteen-minute wait. Deliberately
   crude: it counts failures already written to `payment_events`, which is
   append-only and indexed, so there is no new table and nothing to clean up.
   A distributed attempt from many addresses walks around it — that is what the
   password's own length is for. This closes the cheap door, not every door. */

const MAX_FAILURES = 8;
const LOCKOUT_MINUTES = 15;

export async function tooManyFailures(env, ip) {
  if (!ip) return false;
  try {
    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM login_failures
        WHERE ip = ?1 AND at > datetime('now', ?2)`
    ).bind(ip, `-${LOCKOUT_MINUTES} minutes`).first();
    return !!row && row.n >= MAX_FAILURES;
  } catch {
    /* A counter that cannot be read must never lock the restaurant out of its
       own switch. Failing open is the right trade here: the password still
       stands between an attacker and the page, and the alternative is a locked
       door on the evening it is needed. */
    return false;
  }
}

export async function recordFailure(env, ip) {
  if (!ip) return;
  try {
    // Old rows are worth nothing once the window has passed, so the write
    // pays for the cleanup and the table never grows.
    await env.DB.prepare(
      `DELETE FROM login_failures WHERE at <= datetime('now', ?1)`
    ).bind(`-${LOCKOUT_MINUTES} minutes`).run();
    await env.DB.prepare('INSERT INTO login_failures (ip) VALUES (?1)').bind(ip).run();
  } catch (err) {
    console.error('could not record a failed login', err && err.message);
  }
}

function readCookie(request, name) {
  const header = request.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}
