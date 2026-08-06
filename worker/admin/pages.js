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
         ${back ? `<a href="${esc(back)}">&larr; Admin</a>` : '<h1>Admin</h1>'}
         <span class="spacer"></span>
         <form method="post" action="/admin/logout"><button class="linkbtn" type="submit">Sign out</button></form>
       </div>`
    : '';

  // English, not the site's German. Nobody but the restaurant ever sees these
  // pages, and an internal tool in three languages is three times the surface
  // for no reader.
  return `<!doctype html><html lang="en"><head>
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
  <div class="brand">KAIRO 1980<b>Admin</b></div>
  <div class="card">
    ${unconfigured
      ? `<p class="err">This page is not set up yet. ADMIN_USER and ADMIN_PASSWORD
         must be set as Cloudflare secrets.</p>`
      : `${error ? '<p class="err">Wrong username or password.</p>' : ''}
    <form method="post" action="/admin/login">
      <div class="field">
        <label for="u">Username</label>
        <input id="u" name="username" type="text" autocomplete="username"
               autocapitalize="none" autocorrect="off" spellcheck="false" required>
      </div>
      <div class="field">
        <label for="p">Password</label>
        <input id="p" name="password" type="password" autocomplete="current-password" required>
      </div>
      <button class="go" type="submit">Sign in</button>
    </form>`}
  </div>
</div>`;

  return layout({ title: 'Sign in', nonce, body });
}

const SWITCH_CSS = `
 .switch{background:#fff;border:1px solid #e6dcc9;padding:16px;margin-bottom:14px}
 .switch.off{border-color:#e8c9a0;background:#fdf0e0}
 .state{display:flex;align-items:center;gap:9px;margin-bottom:4px}
 .dot{width:10px;height:10px;border-radius:50%;background:#4c8a35;flex:none}
 .switch.off .dot{background:#c2410c}
 .state b{font-size:15px}
 .switch p{margin:0 0 14px;font-size:13px;color:#7a6030}
 .switch form{margin:0}
 .row{display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap}
 .row .grow{flex:1 1 120px}
 .row label{margin-bottom:4px}
 .row input{padding:10px;font-size:16px;border:1px solid #d8cbb0;background:#fffdf9;width:100%}
 button.stop{padding:13px 18px;font-size:15px;font-weight:600;border:0;background:#c2410c;
             color:#fff;cursor:pointer;flex:1 1 100%}
 button.go2{padding:13px 18px;font-size:15px;font-weight:600;border:0;background:#2f6b1d;
            color:#fff;cursor:pointer;width:100%}
 .cap{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#7a6030;margin:14px 0 6px}
 .reasons{display:grid;gap:6px;margin-bottom:4px}
 label.tick{display:flex;align-items:center;gap:9px;font-size:14px;letter-spacing:0;
            text-transform:none;color:#1c1409;margin:0;padding:7px 9px;background:#fffdf9;
            border:1px solid #e6dcc9}
 label.tick input{width:19px;height:19px;flex:none;margin:0}
 .hint{margin:8px 0 14px;font-size:12.5px;color:#7a6030;line-height:1.55}
`;

/* What the guest is told is chosen from a list, not typed. A sentence typed
   here would be one language only, and every guest-facing string on the site
   exists in German, English and Egyptian Arabic or it does not ship. The
   wording a guest actually reads lives in the T table in order.js; these are
   only the labels for choosing which of them to show. */
const REASON_CHOICES = [
  ['', 'No reason given'],
  ['demand', 'Too many orders'],
  ['emergency', 'Emergency / short-notice closure'],
  ['holiday', 'Holiday']
];
const REASON_LABEL = Object.fromEntries(REASON_CHOICES.filter(([v]) => v));

/* The dashboard leads with the switch rather than a menu of pages, because the
   reason this page gets opened in a hurry is always the switch. */
export function dashboardPage({ nonce, ordering, hoursAreCustom }) {
  const closed = !ordering.open;
  const resumes = closed ? new Date(ordering.resumesAt) : null;

  // Said as a wall clock in the restaurant's own zone, because that is the
  // clock the person reading it is standing next to.
  const resumesText = resumes
    ? resumes.toLocaleString('en-GB', {
        timeZone: 'Europe/Berlin', weekday: 'long', day: 'numeric', month: 'short',
        hour: '2-digit', minute: '2-digit'
      })
    : '';

  const body = `<div class="switch ${closed ? 'off' : ''}">
  <div class="state"><span class="dot"></span><b>${closed
    ? 'Not taking orders'
    : 'Taking orders'}</b></div>
  ${closed
    ? `<p>Reason: ${esc(REASON_LABEL[ordering.reason] || 'none given')}.<br>
       Reopens automatically on ${esc(resumesText)} — nothing has to happen
       here for that.</p>
       <form method="post" action="/admin/ordering">
         <input type="hidden" name="open" value="1">
         <button class="go2" type="submit">Start taking orders again</button>
       </form>`
    : `<p>Stops orders immediately. The menu, the prices and the opening hours
       stay visible — only ordering is withheld, with a note beside it
       explaining why.</p>
       <form method="post" action="/admin/ordering">
         <input type="hidden" name="open" value="0">

         <p class="cap">Reason</p>
         <div class="reasons">
           ${REASON_CHOICES.map(([value, label], i) => `<label class="tick">
             <input type="radio" name="reason" value="${value}" ${i === 0 ? 'checked' : ''}>
             ${label}</label>`).join('')}
         </div>

         <p class="cap">Closed until</p>
         <div class="row">
           <div class="grow">
             <label for="untilDate">Date</label>
             <input id="untilDate" name="untilDate" type="date">
           </div>
           <div class="grow">
             <label for="untilTime">Time</label>
             <input id="untilTime" name="untilTime" type="time" step="300">
           </div>
         </div>
         <p class="hint">Leave both empty and orders start again automatically the
         next day. Setting a date overrides that — it stays closed until then.</p>

         <button class="stop" type="submit">Stop taking orders</button>
       </form>`}
</div>

<div class="tiles">
  <a class="tile" href="/admin/hours">
    <b>Opening hours</b>
    <span>The regular hours, permanently. ${hoursAreCustom
      ? 'Currently using the hours saved here.'
      : 'Currently using the defaults from config.js.'}</span>
  </a>
  <a class="tile" href="/admin/orders">
    <b>Paid orders</b>
    <span>What the provider actually settled, and what was paid but never sent.</span>
  </a>
</div>
<p class="note">You stay signed in for 30 days. “Sign out” ends this session at once —
and on every device, if you change the password afterwards.</p>`;

  return layout({ title: 'Admin', nonce, body, logout: true, extraCss: SWITCH_CSS });
}
