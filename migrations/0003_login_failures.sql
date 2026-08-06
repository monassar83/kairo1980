-- Failed sign-ins at /admin, so that guessing can be slowed down.
--
-- A table of its own rather than a row in `payment_events`: that log is the
-- answer when a figure in the books is questioned months later, and putting
-- authentication noise in it would make it something else.
--
-- Rows are worth nothing after the lockout window and are deleted on the next
-- failure, so this stays a handful of rows and never needs sweeping.

CREATE TABLE IF NOT EXISTS login_failures (
  ip         TEXT NOT NULL,
  at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_login_failures ON login_failures (ip, at);
