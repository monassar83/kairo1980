#!/usr/bin/env node
/* One-time payment setup.
   ---------------------------------------------------------------------------
   Reads the two keys you pasted into .dev.vars, then does everything else
   itself:

     - registers the PayPal webhook and reads its id back
     - generates REPORT_TOKEN
     - writes both into .dev.vars

   Nothing has to be copied out of a dashboard by hand, which is where these
   setups usually go wrong: a signing secret pasted one character short fails
   only later, and fails silently, as a webhook that never verifies.

   Run it again any time — it is idempotent.

     node tools/setup-payments.mjs [--url https://kairo1980.de]
*/

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import * as paypal from '../worker/payments/paypal.js';

const FILE = '.dev.vars';
const DEFAULT_URL = 'https://kairo1980.de';

const args = process.argv.slice(2);
const urlArg = args.indexOf('--url');
const baseUrl = (urlArg !== -1 ? args[urlArg + 1] : DEFAULT_URL).replace(/\/+$/, '');

if (!existsSync(FILE)) {
  fail(`${FILE} not found. Run:  cp .dev.vars.example .dev.vars`);
}

const raw = readFileSync(FILE, 'utf8');
const env = parse(raw);
const updates = {};

console.log(`\nSetting up payments for ${baseUrl}\n`);

/* --- PayPal --------------------------------------------------------------- */

if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) {
  console.log('· PayPal      SKIPPED — client id or secret is empty');
} else if (env.PAYPAL_WEBHOOK_ID) {
  console.log('· PayPal      already set up (PAYPAL_WEBHOOK_ID present)');
} else {
  try {
    const hook = await paypal.registerWebhook(env, `${baseUrl}/api/webhooks/paypal`);
    updates.PAYPAL_WEBHOOK_ID = hook.id;
    console.log(`· PayPal      webhook ${hook.reused ? 'reused' : 'registered'}    (${hook.id})`);
  } catch (err) {
    fail(`PayPal rejected the credentials: ${err.message}`);
  }
}

/* --- the reporting token -------------------------------------------------- */

if (!env.REPORT_TOKEN) {
  updates.REPORT_TOKEN = randomBytes(32).toString('base64url');
  console.log('· Report      token generated');
}

/* --- write it back -------------------------------------------------------- */

if (!Object.keys(updates).length) {
  console.log('\nNothing to do — everything is already configured.\n');
} else {
  writeFileSync(FILE, apply(raw, updates), 'utf8');
  console.log(`\nWrote ${Object.keys(updates).length} value(s) into ${FILE}.`);
  console.log('\nNext:  npm run secrets:push    (copies them to Cloudflare)\n');
}

/* --- plumbing ------------------------------------------------------------- */

function parse(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (match) out[match[1]] = match[2].trim();
  }
  // PayPal's sandbox and live hosts are chosen by this, and the setup script
  // must talk to the same one the Worker will.
  out.PAYPAL_ENV = out.PAYPAL_ENV || (out.PAYPAL_CLIENT_ID?.startsWith('A') && out.PAYPAL_LIVE === 'true' ? 'live' : 'sandbox');
  return out;
}

/** Replaces values in place, keeping every comment and blank line. */
function apply(text, values) {
  let out = text;
  for (const [key, value] of Object.entries(values)) {
    const line = new RegExp(`^(\\s*${key}\\s*=).*$`, 'm');
    out = line.test(out) ? out.replace(line, `$1${value}`) : `${out.trimEnd()}\n${key}=${value}\n`;
  }
  return out;
}

function fail(message) {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}
