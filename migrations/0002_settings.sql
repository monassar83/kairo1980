-- Settings the restaurant changes itself, without a developer and without a
-- deploy.
--
-- Two things live here and they are different in kind:
--
--   'ordering'  the emergency switch. Temporary by nature — thrown when the
--               kitchen is swamped or something has gone wrong, and thrown
--               back the same evening.
--
--   'hours'     the real opening hours. Permanent by nature. Once a row
--               exists it is what the site publishes; config.js keeps the
--               values the site launched with, and is what a reset returns to
--               and what the browser falls back on if this server cannot be
--               reached.
--
-- One row per key, holding JSON. A schema per setting would need a migration
-- every time a switch is added, which is exactly the deploy this table exists
-- to avoid.

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
