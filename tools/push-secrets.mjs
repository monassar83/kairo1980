#!/usr/bin/env node
/* Copies the secrets from .dev.vars into Cloudflare.
   ---------------------------------------------------------------------------
   Values are piped to `wrangler secret put` on stdin, never passed as an
   argument and never printed: a secret on a command line ends up in the shell
   history and in the process list. Only the names are shown.
*/

import { readFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';

const FILE = '.dev.vars';

// PAYPAL_ENV is a plain var in wrangler.jsonc, not a secret. The client id is
// public too, but it travels with the rest rather than being a special case
// somebody has to remember to set by hand.
const SECRETS = [
  'PAYPAL_CLIENT_ID',
  'PAYPAL_CLIENT_SECRET',
  'PAYPAL_WEBHOOK_ID',
  'REPORT_TOKEN'
];

if (!existsSync(FILE)) {
  console.error(`\n  ${FILE} not found. Run:  cp .dev.vars.example .dev.vars\n`);
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(FILE, 'utf8').split(/\r?\n/)
    .map((line) => line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].trim()])
);

const present = SECRETS.filter((name) => env[name]);
const missing = SECRETS.filter((name) => !env[name]);

if (!present.length) {
  console.error('\n  Nothing to push — every value in .dev.vars is empty.\n');
  process.exit(1);
}

console.log(`\nPushing ${present.length} secret(s) to Cloudflare:\n`);

for (const name of present) {
  await put(name, env[name]);
  console.log(`  ✓ ${name}`);
}

if (missing.length) {
  console.log(`\nNot set (skipped): ${missing.join(', ')}`);
}
console.log('\nDone. Deploy with:  npx wrangler deploy\n');

function put(name, value) {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['wrangler', 'secret', 'put', name], {
      stdio: ['pipe', 'ignore', 'inherit'],
      shell: process.platform === 'win32'
    });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${name} failed (exit ${code})`))));
    child.stdin.write(value);
    child.stdin.end();
  });
}
