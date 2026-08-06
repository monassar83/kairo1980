/* Generate the VAPID keypair and hand it to Cloudflare.
   ---------------------------------------------------------------------------
   Run once:

     node tools/setup-push.mjs

   VAPID is how a push service knows a notification came from us. The keypair
   is this application's identity, not a person's password — but the private
   half still only ever exists in Cloudflare, so it is generated here, piped
   straight to `wrangler secret put`, and never written to disk or printed.

   The PUBLIC key is printed, because the browser needs it to subscribe and it
   is public by definition.

   Changing these keys invalidates every existing subscription: a push service
   will refuse a notification signed by a key it has not seen for that
   endpoint. Every device would have to enable notifications again. */

import { spawn } from 'node:child_process';
import { webcrypto as crypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SUBJECT = 'mailto:info@kairo1980.de';

const b64url = (buf) => Buffer.from(buf).toString('base64url');

function putSecret(name, value) {
  return new Promise((ok, no) => {
    const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const child = spawn(npx, ['--no-install', 'wrangler', 'secret', 'put', name],
      { cwd: REPO, shell: false, stdio: ['pipe', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', no);
    child.on('close', (code) => (code === 0 ? ok() : no(new Error(err.trim() || `exit ${code}`))));
    child.stdin.end(value);
  });
}

const pair = await crypto.subtle.generateKey(
  { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']
);

// The public key goes to the browser as the raw uncompressed point; the
// private key as PKCS#8, which is what crypto.subtle can import back.
const publicKey = b64url(await crypto.subtle.exportKey('raw', pair.publicKey));
const privateKey = b64url(await crypto.subtle.exportKey('pkcs8', pair.privateKey));

console.log('\n  Generating a VAPID keypair and storing it in Cloudflare…\n');
await putSecret('VAPID_PUBLIC_KEY', publicKey);
await putSecret('VAPID_PRIVATE_KEY', privateKey);
await putSecret('VAPID_SUBJECT', SUBJECT);

console.log('  Set: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT');
console.log('  Public key (safe to share, the browser needs it):\n');
console.log('    ' + publicKey + '\n');
console.log('  The private key was never printed and never written to disk.\n');
