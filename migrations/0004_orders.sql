-- Orders, once the restaurant takes them itself.
--
-- Today an order exists only as a message in the guest's own WhatsApp, which
-- is why there can be no order screen, no live notification and no count. A
-- row here is what makes all three possible: everything else reads it.
--
-- Deliberately separate from `payments`. An order may be paid online before it
-- is placed, paid on arrival, or never paid at all; a payment may exist for an
-- order that was never sent. They are joined by `reference`, the short code
-- printed in both, and neither owns the other.
--
-- See docs/whatsapp-cloud-api.md. Nothing writes here until WHATSAPP_ENABLED
-- is set, and it is not.

CREATE TABLE IF NOT EXISTS orders (
  id            TEXT PRIMARY KEY,          -- uuid, ours
  reference     TEXT NOT NULL,             -- the short code, shared with `payments`
  status        TEXT NOT NULL,             -- received|confirmed|ready|completed|cancelled

  -- What was ordered, and what the SERVER decided it costs. Never a figure
  -- from a request body: the same rule the payments route lives by.
  lines         TEXT NOT NULL,             -- JSON [{ id, qty, name, unit, amount }]
  subtotal      INTEGER NOT NULL,          -- cents
  discount      INTEGER NOT NULL DEFAULT 0,
  fee           INTEGER NOT NULL DEFAULT 0,
  total         INTEGER NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'EUR',

  order_type    TEXT NOT NULL,             -- pickup|delivery
  business      INTEGER NOT NULL DEFAULT 0,
  wanted_at     TEXT,                      -- Berlin wall clock 'YYYY-MM-DD HH:MM', or NULL for asap

  -- The part this server has never held before. Kept because we are placing
  -- the order rather than composing a message, and because a driver needs an
  -- address. Retention is a rule that still has to be written and enforced:
  -- the order is a business record, the contact details are not.
  guest_name    TEXT,
  guest_phone   TEXT,
  guest_address TEXT,
  postcode      TEXT,
  note          TEXT,

  -- Who we are talking to on WhatsApp, when there is a conversation.
  wa_contact    TEXT,                      -- E.164, no '+'
  wa_message_id TEXT,                      -- the id of our own last message

  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_orders_created ON orders (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status  ON orders (status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_reference ON orders (reference);

-- Everything that ever happened to an order, append-only, exactly as
-- `payment_events` is for a payment. The `event_key` is what makes a replayed
-- webhook harmless.
CREATE TABLE IF NOT EXISTS order_events (
  id         TEXT PRIMARY KEY,
  order_id   TEXT,
  event_key  TEXT UNIQUE,
  event_type TEXT NOT NULL,
  source     TEXT NOT NULL,               -- client|whatsapp|admin
  payload    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_order_events ON order_events (order_id, created_at);
