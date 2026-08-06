/* What the restaurant can change without a developer.
   ---------------------------------------------------------------------------
   Everything else on this site follows one rule: a business fact lives in
   exactly one place, and that place is a file in the repository. These two
   facts are the exception, and it is worth being precise about why.

   ORDERING is not a business fact at all. It is the state of one evening —
   the kitchen is swamped, the fryer is out, the driver has not turned up. It
   was never in config.js and never should be: a fact that changes twice a
   month and must change in ten seconds cannot live behind a git push.

   HOURS are a business fact, and moving them here does move the source of
   truth out of config.js. That is a real cost, paid deliberately: opening
   hours change, the restaurant is who changes them, and asking a developer
   to deploy a new closing time is how a website ends up lying about its
   hours for a fortnight. So:

     - config.js -> hours is the DEFAULT. It is what the site launched with,
       what "reset" restores, and what the browser publishes if this server
       cannot be reached.
     - A row in `settings` OVERRIDES it, entirely, and is what the site
       publishes from the moment it is saved.

   Exactly one of the two is in effect at any moment and the admin page says
   which. What must never happen is a third copy: nothing anywhere may retype
   a closing time it could have asked for. */

import { CONFIG } from './site-data.js';
import { nextMidnight, nextTimeOfDay, instantOf } from './berlin.js';

const ORDERING = 'ordering';
const HOURS = 'hours';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/* Read every setting once per request at most, and at most once every few
   seconds per isolate. The emergency switch is read on every page load, and a
   database round trip for a value that changes twice a month is waste — but
   the window has to stay short enough that "stop taking orders" means now. */
/* Keyed on the database binding rather than held in one module-level variable.
   In production that is a distinction without a difference — one isolate has
   one database — but it means a test can hand in a fresh database and get a
   fresh answer, instead of reading the previous test's settings for five
   seconds. A cache that survives its own data is not a cache, it is a bug that
   only appears under load. */
const CACHE_MS = 5000;
const cache = new WeakMap();

export function forgetCache(env) {
  if (env && env.DB) cache.delete(env.DB);
}

export async function readSettings(env) {
  const held = cache.get(env.DB);
  if (held && held.until > Date.now()) return held.value;

  let rows = [];
  try {
    const result = await env.DB.prepare('SELECT key, value, updated_at FROM settings').all();
    rows = result.results || [];
  } catch (err) {
    // A settings table that cannot be read must never take the site down: the
    // published defaults are a complete, correct answer.
    console.error('settings unreadable', err && err.message);
  }

  const raw = {};
  for (const row of rows) {
    try { raw[row.key] = JSON.parse(row.value); } catch { /* ignore a bad row */ }
  }

  const custom = normaliseHours(raw[HOURS]);
  const value = {
    ordering: normaliseOrdering(raw[ORDERING]),
    hours: custom || defaultHours(),
    // So the admin page can say which of the two is in effect without guessing.
    hoursAreCustom: !!custom,
    /* When the hours last changed. The pages that state opening hours in their
       markup carry this in their ETag, so a saved change makes every cached
       copy stale at once — and an unchanged one still answers 304. Without it,
       `must-revalidate` would keep revalidating its way to the same stale
       body, because the asset behind it never changed. */
    hoursVersion: (rows.find((r) => r.key === HOURS) || {}).updated_at || '0'
  };

  cache.set(env.DB, { value, until: Date.now() + CACHE_MS });
  return value;
}

/* --- the emergency switch ------------------------------------------------
   Off is always temporary. Closing has an end on it from the moment it is
   thrown — by default the end of the day — and the switch returns to on by
   itself when that moment passes.

   That default is the important part. The failure this guards against is not
   a shop that stays open when it should not; it is a Tuesday lunchtime spent
   wondering why nobody is ordering, because somebody closed it on Saturday
   night and went home. Nothing has to run for it to expire: the expiry is read
   against the clock, so it happens whether or not anyone visits. */

/* Why we stopped decides what the guest is told, so the reason is a value with
   a fixed set of members rather than free text. Three reasons, because a
   sentence typed into a phone at the till would be German only — and every
   visible string on this site exists in German, English and Egyptian Arabic or
   it does not ship. Adding a fourth is a line here and three lines in the T
   table in order.js, which is the correct amount of work for a new sentence in
   three languages. */
const REASONS = ['demand', 'emergency', 'holiday'];

function normaliseOrdering(value, now = Date.now()) {
  if (!value || value.open !== false) return { open: true, reason: null, resumesAt: null };

  const resumesAt = Date.parse(String(value.resumesAt || ''));
  // A closure with no end, or with one already past, is over. Nothing has to
  // run for that to happen: it is read against the clock, not swept.
  if (!Number.isFinite(resumesAt) || resumesAt <= now) {
    return { open: true, reason: null, resumesAt: null };
  }

  return {
    open: false,
    // No reason is a valid choice, and the common one: the guest is simply
    // told we are not taking orders. A reason is added when it helps them
    // decide what to do — not to explain ourselves.
    reason: REASONS.includes(value.reason) ? value.reason : null,
    resumesAt: new Date(resumesAt).toISOString(),
    /* Whether the restaurant named the moment or let it default. A closure
       running to tonight's midnight is "back later"; one running to a date
       somebody chose is "back on Monday the 17th". The difference is not
       derivable from the timestamp — midnight tonight and a date chosen as
       tomorrow are the same instant — so it is recorded. */
    namedEnd: value.namedEnd === true
  };
}

/** Close ordering.
 *
 *  `untilDate` ('YYYY-MM-DD') and `untilTime` ('HH:MM') are both optional and
 *  compose:
 *    both      -> back at that time on that date
 *    date only -> back at the start of that date
 *    time only -> back at that time, today if it is still ahead, else tomorrow
 *    neither   -> back at midnight tonight
 *
 *  That last line is the one that matters. A closure with no end is how a shop
 *  spends a Tuesday lunchtime wondering why nobody is ordering, because
 *  somebody stopped the till on Saturday and went home. The default is not
 *  "forever"; it is "today". */
export async function closeOrdering(env, { reason, untilDate, untilTime, minutes } = {}) {
  const date = DATE.test(String(untilDate || '')) ? String(untilDate) : null;
  const time = TIME.test(String(untilTime || '')) ? String(untilTime) : null;

  /* "For the next hour" is the commonest closure there is — the kitchen is
     buried and wants to catch up — and it is the one nobody should have to
     type a clock time for at the till. Capped at a week: a slip of the finger
     on a number field must not be able to close the shop until Christmas. */
  const forMinutes = Math.min(Math.max(Number(minutes) || 0, 0), 7 * 24 * 60);

  const resumesAt = forMinutes ? Date.now() + forMinutes * 60000
    : date ? instantOf(date, time || '00:00')
      : time ? nextTimeOfDay(time)
        : nextMidnight();

  const value = {
    open: false,
    reason: REASONS.includes(reason) ? reason : null,
    resumesAt: new Date(resumesAt).toISOString(),
    namedEnd: !!(date || time || forMinutes)
  };
  await put(env, ORDERING, value);
  return normaliseOrdering(value);
}

export async function openOrdering(env) {
  const value = { open: true, reason: null, resumesAt: null };
  await put(env, ORDERING, value);
  return value;
}

/* --- the opening hours --------------------------------------------------- */

function defaultHours() {
  const h = (CONFIG && CONFIG.hours) || {};
  return {
    lunch: {
      enabled: !!(h.lunch && h.lunch.enabled),
      startsOn: (h.lunch && h.lunch.startsOn) || '',
      delivery: !!(h.lunch && h.lunch.delivery)
    },
    days: DAYS.reduce((out, key) => {
      const day = (h.days && h.days[key]) || {};
      const lunch = window2(day.lunch);
      const evening = window2(day.evening);
      out[key] = {
        closed: day.closed !== false,
        // config.js is trusted, but a bad literal there should read as "no
        // window" rather than propagate a `false` into the published hours.
        lunch: lunch || null,
        evening: evening || null
      };
      return out;
    }, {})
  };
}

/* Three answers, not two, and the difference matters more than it looks.
     null   — nothing was entered. That day simply has no such window.
     false  — something was entered and it is not a window.
     [a, b] — a window.

   Collapsing `false` into `null` is a bug with teeth: a closing time fat-
   fingered as "0900" would quietly become "no evening service", and a day with
   no windows is a day the site publishes as CLOSED. A typo would shut the
   restaurant, in the structured data Google reads, and nothing would say so.
   So an entered-but-invalid window refuses the whole save. */
function window2(value) {
  if (value == null) return null;
  if (!Array.isArray(value) || value.length !== 2) return false;

  const [from, to] = value.map((v) => String(v == null ? '' : v).trim());
  if (!from && !to) return null;                       // both boxes left empty
  if (!TIME.test(from) || !TIME.test(to)) return false;
  // A window that ends before it starts is not a window.
  if (to <= from) return false;
  return [from, to];
}

/** Anything that is not a complete, valid week is not hours. Returns null
 *  rather than a half-repaired object: a partly-understood opening time is
 *  worse than the default, because nobody can tell it is wrong by reading it. */
export function normaliseHours(value) {
  if (!value || typeof value !== 'object' || !value.days) return null;

  const days = {};
  for (const key of DAYS) {
    const day = value.days[key];
    if (!day || typeof day !== 'object') return null;

    const lunch = window2(day.lunch);
    const evening = window2(day.evening);
    // A time that was typed and is not a time refuses the save outright. See
    // window2: silently reading it as "closed" is how a typo shuts the shop.
    if (lunch === false || evening === false) return null;

    const closed = day.closed === true || (!lunch && !evening);
    days[key] = { closed, lunch: closed ? null : lunch, evening: closed ? null : evening };
  }

  const lunch = value.lunch || {};
  const fallback = (CONFIG && CONFIG.hours && CONFIG.hours.lunch) || {};
  return {
    days,
    lunch: {
      enabled: lunch.enabled !== false,
      // Never editable from the admin page: it is the launch-announcement
      // mechanism, it is spent, and re-arming it by accident would put "new
      // from …" back on a page that has been serving lunch for months.
      startsOn: fallback.startsOn || '',
      delivery: lunch.delivery === true
    }
  };
}

export async function writeHours(env, value) {
  const hours = normaliseHours(value);
  if (!hours) return null;
  await put(env, HOURS, hours);
  return hours;
}

/** Back to what config.js says, by deleting the row rather than copying the
 *  defaults into it — a copy would go stale the day config.js changes. */
export async function resetHours(env) {
  await env.DB.prepare('DELETE FROM settings WHERE key = ?1').bind(HOURS).run();
  forgetCache(env);
}

async function put(env, key, value) {
  await env.DB.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).bind(key, JSON.stringify(value)).run();
  forgetCache(env);
}
