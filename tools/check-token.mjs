#!/usr/bin/env node
/* Does this API token have what the deploy needs?
   ---------------------------------------------------------------------------
   Reads a token from a file so it never appears on a command line, in shell
   history, or in a chat transcript. Prints only what the token CAN do — never
   the token.

     1. put the token value in  token.txt   (gitignored)
     2. node tools/check-token.mjs

   Delete token.txt afterwards.
*/

import { readFileSync, existsSync } from 'node:fs';

const FILE = process.argv[2] || 'token.txt';
const DB_ID = '771d18e5-b826-42f6-ac07-42e38a9dda8a';

if (!existsSync(FILE)) {
  console.error(`\n  ${FILE} not found. Paste the token into it, then run this again.\n`);
  process.exit(1);
}

const token = readFileSync(FILE, 'utf8').trim();
if (!token) { console.error('\n  That file is empty.\n'); process.exit(1); }

const auth = { Authorization: `Bearer ${token}` };
const api = (path) => fetch('https://api.cloudflare.com/client/v4' + path, { headers: auth });

console.log('\nChecking what this token can do:\n');

// 1. Is it a valid token at all?
const verify = await (await api('/user/tokens/verify')).json();
if (!verify.success) {
  console.error('  ✘ the token is not valid at all —', verify.errors?.[0]?.message || 'unknown');
  process.exit(1);
}
console.log('  ✓ valid token, status:', verify.result.status);

// 2. Which accounts can it see?
const accounts = await (await api('/accounts')).json();
if (!accounts.success || !accounts.result?.length) {
  console.log('  ✘ cannot list accounts — it has no Account:Read');
  process.exit(1);
}
for (const a of accounts.result) console.log('  ✓ sees account:', a.name);

// 3. The one that matters: can it query the payments database?
let ok = false;
for (const a of accounts.result) {
  const res = await api(`/accounts/${a.id}/d1/database/${DB_ID}`);
  const body = await res.json();
  if (body.success) {
    console.log(`  ✓ can read the payments database in "${a.name}"`);
    ok = true;
  } else {
    const err = body.errors?.[0];
    console.log(`  ✘ D1 in "${a.name}": ${err?.message || res.status}${err?.code ? ` [code ${err.code}]` : ''}`);
  }
}

console.log(ok
  ? '\nThis token has D1 access. If CI still fails, CI is holding a DIFFERENT token.\n'
  : '\nThis token is missing Account · D1 · Edit. Add it, or CI cannot apply migrations.\n');
