-- Payment provenance for kairo1980.de.
--
-- Two tables, and the split matters: `payments` is the current state of one
-- attempt to pay for one order, `payment_events` is the append-only record of
-- everything the provider ever told us about it. State can be corrected; the
-- event log never changes. When a figure in the books is questioned months
-- later, the log is the answer.

CREATE TABLE IF NOT EXISTS payments (
  id                TEXT PRIMARY KEY,          -- ours (uuid), the idempotency key
  reference         TEXT NOT NULL,             -- short human code, also in the WhatsApp order
  provider          TEXT NOT NULL,             -- 'paypal' today; the column is why it can be more tomorrow
  provider_order_id TEXT,                      -- PayPal order id
  status            TEXT NOT NULL,             -- created|approved|captured|failed|cancelled|refunded|partially_refunded

  amount            INTEGER NOT NULL,          -- cents, server-computed, never client-supplied
  currency          TEXT NOT NULL DEFAULT 'EUR',
  subtotal          INTEGER NOT NULL,
  discount          INTEGER NOT NULL DEFAULT 0,
  fee               INTEGER NOT NULL DEFAULT 0,
  refunded_amount   INTEGER NOT NULL DEFAULT 0,

  order_type        TEXT NOT NULL,             -- delivery|pickup
  business          INTEGER NOT NULL DEFAULT 0,
  postcode          TEXT,
  lines             TEXT NOT NULL,             -- JSON: what was priced, at what unit price

  -- No name, no phone, no address. The guest's details travel to the
  -- restaurant in the WhatsApp message and nowhere else; what ties a payment
  -- to an order here is `reference`, which is printed in both. The payer
  -- fields below are what PayPal reports about its own account holder — we
  -- never collect them, we are told them.
  payer_email       TEXT,
  payer_id          TEXT,

  authorization_id  TEXT,
  capture_id        TEXT,
  payment_source    TEXT,                      -- paypal|card|apple_pay|google_pay, as used

  failure_code      TEXT,
  failure_message   TEXT,

  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  captured_at       TEXT
);

CREATE INDEX IF NOT EXISTS idx_payments_reference    ON payments (reference);
CREATE INDEX IF NOT EXISTS idx_payments_provider_ord ON payments (provider, provider_order_id);
CREATE INDEX IF NOT EXISTS idx_payments_status       ON payments (status);
CREATE INDEX IF NOT EXISTS idx_payments_created      ON payments (created_at);

-- Append-only. `event_key` is UNIQUE, and that single constraint is what makes
-- a replayed webhook, a double-clicked capture and a provider retry all
-- harmless: the second insert fails and the handler stops.
CREATE TABLE IF NOT EXISTS payment_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  payment_id  TEXT,
  provider    TEXT NOT NULL,
  event_key   TEXT NOT NULL UNIQUE,
  event_type  TEXT NOT NULL,
  source      TEXT NOT NULL,                   -- webhook|api|client
  status_from TEXT,
  status_to   TEXT,
  amount      INTEGER,
  payload     TEXT,                            -- the provider's own words, verbatim
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_payment ON payment_events (payment_id, id);
CREATE INDEX IF NOT EXISTS idx_events_created ON payment_events (created_at);

-- Settlement view: one row per euro actually taken, net of refunds. This is
-- the figure that belongs in the books — not the number of attempts, and not
-- the gross before refunds.
CREATE VIEW IF NOT EXISTS payments_settled AS
SELECT
  substr(captured_at, 1, 10)                    AS day,
  provider,
  currency,
  order_type,
  COUNT(*)                                      AS orders,
  SUM(amount)                                   AS gross,
  SUM(refunded_amount)                          AS refunded,
  SUM(amount - refunded_amount)                 AS net
FROM payments
WHERE captured_at IS NOT NULL
GROUP BY day, provider, currency, order_type;
