-- An order the restaurant never took.
--
-- It happened on 14 August 2026. Ordering was switched off for the evening and an
-- order arrived anyway, from a guest whose page had been open since before the
-- switch was thrown. The kitchen never cooked it. There was nothing anywhere to
-- say so: the row sat in /admin looking exactly like every order that was cooked,
-- and it travelled onward into the books as a real sale.
--
-- (The hole that let it in is closed — /api/orders/announce now refuses during a
-- closure, as /api/payments always did. This is for the other cases, which do not
-- close: the guest who rings up to cancel, the address nobody can reach, the
-- duplicate somebody pressed twice.)
--
-- The order is NOT deleted. It happened, the guest may ring about it, and money
-- may have moved — a deleted row cannot answer any of that. It is marked, and the
-- mark travels: the reporting endpoint carries it, so the bookkeeping system knows
-- the order does not count without anyone re-deciding it there.
--
-- `cancelled_at` is when the restaurant said so, and `cancelled_reason` is why in
-- their own words, because "why" is the question a month later. Both null on an
-- ordinary order, and nulling them again is how a cancellation is undone.

ALTER TABLE orders ADD COLUMN cancelled_at TEXT;
ALTER TABLE orders ADD COLUMN cancelled_reason TEXT;

-- The reports ask "which orders in this window were cancelled", and /admin asks it
-- for one day at a time.
CREATE INDEX IF NOT EXISTS idx_orders_cancelled ON orders (cancelled_at);
