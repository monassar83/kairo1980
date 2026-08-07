-- The order itself, for the first time.
--
-- Until now the money was on this server and the ORDER was not: what to cook
-- and where to drive it existed only in the guest's own WhatsApp message. That
-- worked exactly as well as the guest's memory. A customer paid on 6 August
-- 2026, never pressed send, and the kitchen learned nothing.
--
-- So the order is recorded here as well. The WhatsApp handover is unchanged and
-- still happens; it simply stops being the only copy.
--
-- TWO KINDS OF COLUMN, and the split is the whole design. Everything above
-- `customer_name` describes the ORDER and is kept. The four fields below it
-- describe the PERSON and are nulled by the nightly sweep once the limitation
-- period for claims has run — three years from the END of the year the order
-- was placed (§§ 195, 199 BGB), so an order from 2026 is scrubbed on
-- 1 January 2030. The row survives without them.
--
-- There is no statutory MAXIMUM to reach for here: Art. 5(1)(e) DSGVO sets a
-- necessity test, not a ceiling. The limitation period is the longest honest
-- answer to "how long could this still be needed", which is why it is the one
-- used. See worker/retention.js and docs/data-retention.md.
--
-- The details never travel: they are read at /admin, behind the login, and are
-- never put in a notification. That is what keeps a customer's address out of
-- Telegram, whose company sits outside the EU with no adequacy decision.

CREATE TABLE IF NOT EXISTS orders (
  id             TEXT PRIMARY KEY,          -- uuid, ours
  reference      TEXT NOT NULL,             -- the short code printed in the chat
  payment_id     TEXT,                      -- set when the order was paid online

  order_type     TEXT NOT NULL,             -- delivery|pickup
  business       INTEGER NOT NULL DEFAULT 0,
  pay_method     TEXT NOT NULL,             -- onsite|online
  postcode       TEXT,

  -- Priced by worker/pricing.js from the published menu, never from the body.
  lines          TEXT NOT NULL,             -- JSON: what was ordered, at what price
  subtotal       INTEGER NOT NULL,
  discount       INTEGER NOT NULL DEFAULT 0,
  fee            INTEGER NOT NULL DEFAULT 0,
  total          INTEGER NOT NULL,
  currency       TEXT NOT NULL DEFAULT 'EUR',

  requested_time TEXT,                      -- "so bald wie möglich" or a chosen slot

  -- ---- personal data, deleted after 90 days -------------------------------
  -- `notes` is free text the guest writes. It is where an allergy is
  -- mentioned, which can make it health data under Art. 9 DSGVO — a further
  -- reason it is kept behind the login, never notified, and purged early.
  customer_name    TEXT,
  customer_phone   TEXT,
  customer_address TEXT,
  customer_company TEXT,
  notes            TEXT,
  details_purged_at TEXT,                   -- set when the four above were nulled

  created_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_reference ON orders (reference);
CREATE INDEX IF NOT EXISTS idx_orders_created   ON orders (created_at);
CREATE INDEX IF NOT EXISTS idx_orders_payment   ON orders (payment_id);

-- Announcing an order costs nothing, because there is no payment to make it
-- cost something. Without a throttle the route is a free way to make the
-- restaurant's phone buzz all night. Same shape as login_failures: rows are
-- counted inside a window and the write pays for the cleanup, so nothing grows
-- and nothing has to be swept.
CREATE TABLE IF NOT EXISTS order_rate (
  ip TEXT NOT NULL,
  at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_order_rate ON order_rate (ip, at);
