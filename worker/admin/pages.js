/* The admin area's own markup.
   ---------------------------------------------------------------------------
   Rendered by the Worker rather than served as files, because these pages must
   never exist as assets: an asset has a URL anybody can fetch, and everything
   here is behind a session. That also means they are outside _headers, so each
   response states its own policy — see `layout()`.

   Deliberately plain. This is a page opened one-handed, on a phone, usually
   while something else is going wrong. Big targets, no JavaScript at all, and
   nothing that has to load before it works. */

const ESCAPE = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ESCAPE[c]);

/* A nonce per response, so the one <style> block can be allowed by name
   instead of opening style-src to everything inline. There is no script tag
   anywhere in here and script-src says so. */
export function newNonce() {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))))
    .replace(/[^a-zA-Z0-9]/g, '');
}

export function adminHeaders(nonce, extra = {}) {
  return {
    'Content-Type': 'text/html; charset=utf-8',
    // Never cached, never stored: a shared phone must not be able to reach
    // this page with the back button after a logout.
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': [
      "default-src 'none'",
      `style-src 'nonce-${nonce}'`,
      "form-action 'self'",
      "base-uri 'none'",
      "frame-ancestors 'none'"
    ].join('; '),
    ...extra
  };
}

const CSS = `
 *{box-sizing:border-box}
 body{margin:0;padding:16px;font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      background:#faf7f2;color:#1c1409;-webkit-text-size-adjust:100%}
 a{color:#8a6a2a}
 .bar{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin:0 0 18px}
 .bar h1{font-size:17px;margin:0}
 .bar .spacer{flex:1}
 .bar form{margin:0}
 .linkbtn{background:none;border:0;padding:0;font:inherit;color:#8a6a2a;text-decoration:underline;
          cursor:pointer}
 h1{font-size:17px;margin:0 0 2px}
 .sub{color:#7a6030;font-size:13px;margin-bottom:16px}
 .tiles{display:grid;gap:10px}
 .tile{display:block;background:#fff;border:1px solid #e6dcc9;padding:14px 16px;text-decoration:none;
       color:inherit}
 .tile b{display:block;font-size:15px;margin-bottom:2px}
 .tile span{font-size:13px;color:#7a6030}
 .note{margin-top:16px;font-size:12px;color:#7a6030;line-height:1.65}

 /* --- login --- */
 .login{max-width:340px;margin:12vh auto 0}
 .brand{font-size:13px;letter-spacing:.22em;text-transform:uppercase;color:#7a6030;
        text-align:center;margin-bottom:4px}
 .brand b{display:block;font-size:19px;letter-spacing:.16em;color:#1c1409}
 .card{background:#fff;border:1px solid #e6dcc9;padding:20px 18px;margin-top:20px}
 label{display:block;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#7a6030;
       margin:0 0 6px}
 input{width:100%;padding:12px;font-size:16px;border:1px solid #d8cbb0;background:#fffdf9;
       color:#1c1409;border-radius:0}
 input:focus{outline:2px solid #b8914a;outline-offset:-1px}
 .field{margin-bottom:14px}
 button.go{width:100%;padding:13px;font-size:15px;font-weight:600;border:0;background:#1c1409;
           color:#f5e8cc;cursor:pointer}
 .err{margin:0 0 14px;padding:10px 12px;background:#fdf0e0;border:1px solid #e8c9a0;
      color:#a04a00;font-size:13.5px}
`;

export function layout({ title, nonce, body, logout = false, back = null, extraCss = '' }) {
  const bar = logout
    ? `<div class="bar">
         ${back ? `<a href="${esc(back)}">&larr; Verwaltung</a>` : '<h1>Verwaltung</h1>'}
         <span class="spacer"></span>
         <form method="post" action="/admin/logout"><button class="linkbtn" type="submit">Abmelden</button></form>
       </div>`
    : '';

  return `<!doctype html><html lang="de"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${esc(title)} · KAIRO 1980</title>
<style nonce="${nonce}">${CSS}${extraCss}</style></head><body>
${bar}${body}
</body></html>`;
}

/* The login form.

   `autocomplete` is not decoration here: "username" and "current-password" are
   the tokens iOS Keychain and Google Password Manager look for before they
   offer to fill or to save. Without them a saved credential silently stops
   being offered, which on a phone reads as the password having been lost.

   The error never says which of the two was wrong. Telling an attacker they
   have found the username is telling them half the answer. */
export function loginPage({ nonce, error = false, unconfigured = false }) {
  const body = `<div class="login">
  <div class="brand">KAIRO 1980<b>Verwaltung</b></div>
  <div class="card">
    ${unconfigured
      ? `<p class="err">Diese Seite ist noch nicht eingerichtet. ADMIN_USER und ADMIN_PASSWORD
         müssen als Secrets gesetzt sein.</p>`
      : `${error ? '<p class="err">Benutzername oder Passwort ist falsch.</p>' : ''}
    <form method="post" action="/admin/login">
      <div class="field">
        <label for="u">Benutzername</label>
        <input id="u" name="username" type="text" autocomplete="username"
               autocapitalize="none" autocorrect="off" spellcheck="false" required>
      </div>
      <div class="field">
        <label for="p">Passwort</label>
        <input id="p" name="password" type="password" autocomplete="current-password" required>
      </div>
      <button class="go" type="submit">Anmelden</button>
    </form>`}
  </div>
</div>`;

  return layout({ title: 'Anmelden', nonce, body });
}

/** What you see once you are in. */
export function dashboardPage({ nonce }) {
  const body = `<div class="sub">Interne Seite — nicht öffentlich, nicht indexiert.</div>
<div class="tiles">
  <a class="tile" href="/admin/orders">
    <b>Bezahlte Bestellungen</b>
    <span>Was der Anbieter abgerechnet hat, und was bezahlt aber nie gesendet wurde.</span>
  </a>
</div>
<p class="note">Angemeldet bleibst du 30 Tage. „Abmelden“ beendet die Sitzung sofort —
auf allen Geräten, wenn danach das Passwort geändert wird.</p>`;

  return layout({ title: 'Verwaltung', nonce, body, logout: true });
}
