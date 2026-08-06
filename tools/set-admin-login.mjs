/* Set the username and password for /admin, without typing them anywhere they
   can be read afterwards.
   ---------------------------------------------------------------------------
   Run it:

     node tools/set-admin-login.mjs

   It opens a form in your browser on 127.0.0.1, and when you submit it, hands
   the two values straight to `wrangler secret put`. Then it stops.

   Why a form and not two prompts: the values never appear on a command line,
   never reach a shell history file, and never sit in a scrollback buffer that
   somebody screen-shares a week later. They go from the browser, through this
   process's memory, into Cloudflare, and nowhere else. Nothing is written to
   disk and nothing is logged — including by this script, which prints the
   NAMES it set and never the values.

   Secrets take effect immediately. There is no deploy, and running this again
   is how the password gets changed — which also signs every device out, since
   the session cookie is signed with a key derived from these two values. */

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8791;

// An unguessable path, so nothing else running on this machine can post to it.
const KEY = randomBytes(18).toString('base64url');

/** Hand one value to wrangler on stdin. Never as an argument: an argument is
 *  visible to every other process on the machine through the process list. */
function putSecret(name, value) {
  return new Promise((ok, no) => {
    // The .cmd shim by name rather than shell:true — with a shell, arguments
    // are concatenated into a command line rather than passed as arguments,
    // and this process is handling a password.
    const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const child = spawn(npx, ['--no-install', 'wrangler', 'secret', 'put', name], {
      cwd: REPO, shell: false, stdio: ['pipe', 'pipe', 'pipe']
    });
    let err = '';
    child.stderr.on('data', (d) => { err += d; });
    child.stdout.on('data', () => {});
    child.on('error', no);
    child.on('close', (code) => (code === 0 ? ok() : no(new Error(err.trim() || `exit ${code}`))));
    child.stdin.end(value);          // no trailing newline: it would be part of the secret
  });
}

const PAGE = (message = '') => `<!doctype html><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>KAIRO 1980 — set the admin login</title>
<style>
 body{font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#faf7f2;
      color:#1c1409;margin:0;padding:24px}
 .box{max-width:380px;margin:6vh auto;background:#fff;border:1px solid #e6dcc9;padding:22px}
 h1{font-size:16px;margin:0 0 4px}
 p.sub{color:#7a6030;font-size:13px;margin:0 0 18px}
 label{display:block;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#7a6030;
       margin:0 0 6px}
 input{width:100%;padding:11px;font-size:16px;border:1px solid #d8cbb0;background:#fffdf9;
       margin-bottom:14px;box-sizing:border-box}
 button{width:100%;padding:12px;font-size:15px;font-weight:600;border:0;background:#1c1409;
        color:#f5e8cc;cursor:pointer}
 .msg{padding:10px 12px;background:#fdf0e0;border:1px solid #e8c9a0;color:#a04a00;font-size:13.5px;
      margin-bottom:16px}
 .ok{background:#eef6ea;border-color:#bcd8b0;color:#31601f}
 code{background:#f2ece0;padding:1px 5px}
</style>
<div class="box">
<h1>Set the admin login</h1>
<p class="sub">Saved straight to Cloudflare as a secret. Nothing here is
logged anywhere.</p>
${message}
<form method="post" action="/${KEY}">
  <label for="u">Username</label>
  <input id="u" name="username" autocomplete="username" autocapitalize="none"
         autocorrect="off" spellcheck="false" required>
  <label for="p">Password</label>
  <input id="p" name="password" type="password" autocomplete="new-password" required>
  <button type="submit">Save</button>
</form>
</div>`;

const DONE = `<!doctype html><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Saved</title>
<style>body{font:15px/1.6 -apple-system,sans-serif;background:#faf7f2;color:#1c1409;margin:0;padding:24px}
 .box{max-width:380px;margin:6vh auto;background:#fff;border:1px solid #e6dcc9;padding:22px}
 h1{font-size:16px;margin:0 0 8px} a{color:#8a6a2a}</style>
<div class="box">
<h1>Saved.</h1>
<p>ADMIN_USER and ADMIN_PASSWORD are set. Live immediately — no deploy needed.</p>
<p><a href="https://kairo1980.de/admin">kairo1980.de/admin</a> — sign in there and
let the browser save it.</p>
<p>You can close this window.</p>
</div>`;

const server = createServer(async (req, res) => {
  const send = (status, body) => {
    res.writeHead(status, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    res.end(body);
  };

  if (req.method === 'GET' && req.url === `/${KEY}`) return send(200, PAGE());

  if (req.method === 'POST' && req.url === `/${KEY}`) {
    let body = '';
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 4096) { req.destroy(); return; }
    }
    const form = new URLSearchParams(body);
    const username = form.get('username') || '';
    const password = form.get('password') || '';

    if (!username.trim() || !password) {
      return send(400, PAGE('<p class="msg">Both fields are needed.</p>'));
    }
    if (password.length < 12) {
      return send(400, PAGE('<p class="msg">At least 12 characters, please. Length is the only' +
        ' thing really protecting this page — best to let a password manager' +
        ' generate it.</p>'));
    }

    try {
      await putSecret('ADMIN_USER', username.trim());
      await putSecret('ADMIN_PASSWORD', password);
    } catch (err) {
      // err carries wrangler's message, which never contains the value.
      return send(500, PAGE(`<p class="msg">Cloudflare refused: ${
        String(err.message).replace(/[<&]/g, '')}</p>`));
    }

    send(200, DONE);
    console.log('\n  Set: ADMIN_USER, ADMIN_PASSWORD');
    console.log('  Now sign in at https://kairo1980.de/admin\n');
    setTimeout(() => server.close(() => process.exit(0)), 500);
    return;
  }

  send(404, 'Not here.');
});

server.listen(PORT, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${PORT}/${KEY}`;
  console.log('\n  Open this and fill in the form:\n');
  console.log('    ' + url + '\n');
  const open = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
    : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try { spawn(open[0], open[1], { stdio: 'ignore', detached: true }).unref(); } catch { /* paste it */ }
});
