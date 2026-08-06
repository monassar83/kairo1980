-- Devices that have asked to be told when something happens.
--
-- A subscription is issued by the browser's own push service (Google's, for
-- Chrome on Android) and is useless to anyone else: it names an endpoint that
-- only accepts messages signed by our VAPID key. So this table holds no
-- secret, and a row here cannot be used to send anything without the private
-- key, which lives in Cloudflare and never in the database.
--
-- Rows are deleted the moment a push service says the subscription is gone
-- (404 or 410). A dead subscription retried for ever is how a notification
-- system quietly becomes a source of errors nobody reads.

CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint   TEXT PRIMARY KEY,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  label      TEXT,                         -- "Sherif's phone", so a stale one can be found
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_ok_at TEXT
);
