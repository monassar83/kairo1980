/* config.js and zones.js are browser files: they assign to `window`, and
   zones.js is generated and must never be hand-edited. Rather than keep a
   second copy of the prices and postcodes on the server — the one thing this
   codebase exists to prevent — the Worker imports those very files and gives
   them the `window` they expect.

   This module must be evaluated BEFORE either of them. That is what the import
   order in site-data.js is for: ES modules evaluate their dependencies
   depth-first in source order, so importing this first is a guarantee, not a
   hope. */

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;

export {};
