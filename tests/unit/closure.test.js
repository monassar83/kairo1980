/* The ordering switch, examined one edge at a time.
   ---------------------------------------------------------------------------
   This switch decides whether a restaurant can take money, and it is made
   almost entirely of clocks: a closure that ends by itself, a moment chosen by
   a guest, and a comparison between the two — across midnight, across a date
   boundary, and across the two nights a year when Germany's clocks move.

   Every case below is one somebody actually meets. The ones that would cost
   money are marked as such. */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { dayOf, timeOf, nextMidnight, nextTimeOfDay, instantOf } from '../../worker/berlin.js';
import { freshDatabase } from '../helpers/d1.js';
import { normaliseHours } from '../../worker/settings.js';
import { wantedAfterClosure } from '../../worker/index.js';

const BERLIN = 'Europe/Berlin';
const berlin = (ms) => new Date(ms).toLocaleString('sv-SE', { timeZone: BERLIN });

/* --- the clock the restaurant actually stands next to --------------------- */

test('a Berlin day is Berlin\'s, not the server\'s', () => {
  // 22:30 UTC on 5 August is already the 6th in Hockenheim. A server reasoning
  // in UTC files that evening's orders under the wrong day.
  const late = Date.parse('2026-08-05T22:30:00Z');
  assert.equal(dayOf(late), '2026-08-06');
  assert.equal(timeOf(late), '00:30');
});

test('midnight tonight is tonight, in summer and in winter', () => {
  // CEST: Berlin is UTC+2, so midnight is 22:00 UTC the evening before.
  const summer = nextMidnight(Date.parse('2026-08-05T12:00:00Z'));
  assert.equal(berlin(summer), '2026-08-06 00:00:00');

  // CET: UTC+1.
  const winter = nextMidnight(Date.parse('2026-01-15T12:00:00Z'));
  assert.equal(berlin(winter), '2026-01-16 00:00:00');
});

test('midnight is still midnight on the two nights the clocks move', () => {
  /* The failure this catches is not theoretical: resolving a wall clock with
     the offset that applies BEFORE the change puts the answer an hour out, and
     an hour out at midnight is a shop that reopens on the wrong day. */

  // Clocks go forward 02:00 -> 03:00 on the last Sunday in March 2026 (29th).
  const spring = nextMidnight(Date.parse('2026-03-28T20:00:00Z'));
  assert.equal(berlin(spring), '2026-03-29 00:00:00');

  // Clocks go back 03:00 -> 02:00 on the last Sunday in October 2026 (25th).
  const autumn = nextMidnight(Date.parse('2026-10-24T20:00:00Z'));
  assert.equal(berlin(autumn), '2026-10-25 00:00:00');
});

test('"back at 20:30" means today if it is still ahead, tomorrow if it is not', () => {
  const noon = Date.parse('2026-08-05T10:00:00Z');          // 12:00 Berlin
  assert.equal(berlin(nextTimeOfDay('20:30', noon)), '2026-08-05 20:30:00');

  const lateEvening = Date.parse('2026-08-05T20:00:00Z');   // 22:00 Berlin
  assert.equal(berlin(nextTimeOfDay('20:30', lateEvening)), '2026-08-06 20:30:00',
    'a time already past today can only mean tomorrow');
});

test('a chosen date resolves to the start of that day in Hockenheim', () => {
  assert.equal(berlin(instantOf('2026-08-15')), '2026-08-15 00:00:00');
  assert.equal(berlin(instantOf('2026-08-15', '18:30')), '2026-08-15 18:30:00');
  // And in winter, where the offset differs.
  assert.equal(berlin(instantOf('2026-12-24', '15:00')), '2026-12-24 15:00:00');
});

/* --- whether a guest's chosen moment falls inside a closure ---------------
   The rule the basket and the server both apply, tested here on the server's
   copy. A closure withholds a MOMENT; an order for after we reopen is an
   ordinary order and must go through. */

const RESUMES = '2026-08-06T18:00:00.000Z';        // 20:00 Berlin on the 6th
const at = (date, time) => wantedAfterClosure(RESUMES, { date, time });

test('a moment before we reopen is inside the closure', () => {
  assert.equal(at('2026-08-06', '19:59'), false, 'a minute early is early');
  assert.equal(at('2026-08-06', '00:00'), false, 'earlier the same day');
  assert.equal(at('2026-08-05', '23:59'), false, 'the day before');
});

test('a moment at or after we reopen is an ordinary order', () => {
  assert.equal(at('2026-08-06', '20:00'), true, 'the minute itself counts');
  assert.equal(at('2026-08-06', '20:01'), true);
  assert.equal(at('2026-08-07', '00:00'), true, 'past midnight, next day');
  assert.equal(at('2026-09-01', '12:00'), true, 'weeks later');
});

test('the comparison holds across a date boundary, not just a clock one', () => {
  /* 23:59 on the 5th is BEFORE 00:00 on the 6th. Compared as clock times
     alone, 23:59 > 00:00 and a guest ordering the night before we close would
     sail through. The date has to be part of the comparison, and this is the
     test that says so. */
  const midnight = wantedAfterClosure('2026-08-06T22:00:00.000Z', // 00:00 on the 7th
    { date: '2026-08-06', time: '23:59' });
  assert.equal(midnight, false);
});

test('no moment named means "as soon as possible", which is exactly what is closed', () => {
  assert.equal(wantedAfterClosure(RESUMES, null), false);
  assert.equal(wantedAfterClosure(RESUMES, undefined), false);
  assert.equal(wantedAfterClosure(RESUMES, {}), false);
  assert.equal(wantedAfterClosure(RESUMES, 'tomorrow'), false);
});

test('a malformed moment is refused, never parsed into something plausible', () => {
  /* A hand-made request naming "9999-99-99" must not walk past a closure on
     the strength of sorting late. Every field is validated before it is
     compared. */
  for (const when of [
    { date: '9999-99-99', time: '99:99' },
    { date: '2026-8-6', time: '20:00' },
    { date: '2026-08-06', time: '8:00' },
    { date: '2026-08-06', time: '24:00' },
    { date: '2026-08-06' },
    { time: '20:00' },
    { date: 2026, time: 20 }
  ]) {
    assert.equal(wantedAfterClosure(RESUMES, when), false, JSON.stringify(when));
  }
});

test('with no closure to compare against, nothing is withheld', () => {
  assert.equal(wantedAfterClosure(null, null), true);
  assert.equal(wantedAfterClosure('', null), true);
  assert.equal(wantedAfterClosure('not a date', null), true);
});

/* --- hours: what is refused, and what is quietly accepted ----------------- */

const WEEK = (over = {}) => ({
  lunch: { enabled: true, delivery: false },
  days: {
    mon: { closed: true },
    tue: { closed: true },
    wed: { closed: false, evening: ['18:00', '23:00'] },
    thu: { closed: false, evening: ['18:00', '23:00'] },
    fri: { closed: false, evening: ['18:00', '23:00'] },
    sat: { closed: false, evening: ['18:00', '23:00'] },
    sun: { closed: false, evening: ['18:00', '23:00'] },
    ...over
  }
});

test('a complete, ordinary week is accepted as given', () => {
  const hours = normaliseHours(WEEK());
  assert.equal(hours.days.mon.closed, true);
  // One window is stored as the day's first, whichever box it was typed into.
  assert.deepEqual(hours.days.wed.lunch, ['18:00', '23:00']);
  assert.equal(hours.days.wed.evening, null);
});

test('a time that is not a time refuses the whole save', () => {
  /* THE ONE THAT COSTS MONEY. Read as "no evening window", a fat-fingered
     closing time makes that day CLOSED — in the table, in the basket, and in
     the opening hours Google publishes. A typo would shut the restaurant and
     nothing would say so. */
  for (const bad of [['18:00', '0900'], ['1800', '23:00'], ['18:00', 'abc'],
                     ['25:00', '26:00'], ['18:00', '18:00'], ['23:00', '18:00']]) {
    assert.equal(normaliseHours(WEEK({ wed: { closed: false, evening: bad } })), null,
      `refused: ${bad.join('-')}`);
  }
});

test('an empty pair is "no window", which is not the same as a bad one', () => {
  const hours = normaliseHours(WEEK({ wed: { closed: false, evening: ['', ''] } }));
  assert.notEqual(hours, null, 'leaving the boxes empty is allowed');
  assert.equal(hours.days.wed.closed, true, 'and a day with no windows is closed');
});

test('"closed all day" wins over any times left in the boxes', () => {
  const hours = normaliseHours(WEEK({
    wed: { closed: true, lunch: ['11:00', '14:30'], evening: ['18:00', '23:00'] }
  }));
  assert.equal(hours.days.wed.closed, true);
  assert.equal(hours.days.wed.evening, null, 'no window survives a closed day');
});

test('a week missing a day is not a week', () => {
  const partial = WEEK();
  delete partial.days.sun;
  assert.equal(normaliseHours(partial), null);
  assert.equal(normaliseHours({ days: {} }), null);
  assert.equal(normaliseHours(null), null);
  assert.equal(normaliseHours({}), null);
  assert.equal(normaliseHours('every day'), null);
});

test('a window that runs past midnight is refused rather than reversed', () => {
  // "18:00 – 03:00" is a real thing to want and this schema cannot express it.
  // Refusing says so; accepting it as 03:00–18:00 would publish the opposite
  // of what was meant.
  assert.equal(normaliseHours(WEEK({ wed: { closed: false, evening: ['18:00', '03:00'] } })), null);
});

test('the delivery shift can be set and cleared without touching a day', () => {
  const later = normaliseHours({ ...WEEK(), deliveryFrom: '18:00' });
  assert.equal(later.deliveryFrom, '18:00');
  // WEEK() gives each day a lone window, which normalises into the first slot.
  assert.equal(later.days.wed.lunch[0], '18:00', 'the opening is untouched');

  // Empty is a real answer — "a driver is out whenever we are open" — and is
  // the one word to change the day a midday driver exists.
  const allDay = normaliseHours({ ...WEEK(), deliveryFrom: '' });
  assert.equal(allDay.deliveryFrom, '');
});

test('a delivery time that is not a time refuses the whole save', () => {
  /* Reading a mistyped "1800" as "delivers all day" would promise a midday
     driver that does not exist — the same silent publication the window checks
     exist to prevent, so it is refused the same way. */
  assert.equal(normaliseHours({ ...WEEK(), deliveryFrom: '1800' }), null);
  assert.equal(normaliseHours({ ...WEEK(), deliveryFrom: '25:00' }), null);
});

test('two opening windows that overlap are refused', () => {
  /* Saved cleanly before this check existed, and published two overlapping
     OpeningHoursSpecification entries to the crawlers that feed the place
     cards, while the table printed two rows contradicting each other. Each
     window is valid alone, which is exactly why they have to be compared. */
  assert.equal(normaliseHours(WEEK({
    wed: { closed: false, lunch: ['11:00', '23:00'], evening: ['18:00', '23:00'] }
  })), null);

  // Touching is not overlapping: 11:00-18:00 then 18:00-23:00 is one opening
  // typed into two boxes, and stays perfectly legal.
  const touching = normaliseHours(WEEK({
    wed: { closed: false, lunch: ['11:00', '18:00'], evening: ['18:00', '23:00'] }
  }));
  assert.ok(touching, 'adjacent windows are a normal week');
});

test('a day with only a second window is stored as having one', () => {
  /* The form has two boxes because an afternoon break needs two, and filling
     only the lower pair reads naturally as "we open in the evening". It saved
     and worked, but left the same shape stored two different ways — which is
     how the Saturday and Sunday rows came to look broken next to Wednesday's. */
  const hours = normaliseHours(WEEK({
    sat: { closed: false, lunch: null, evening: ['18:00', '23:00'] }
  }));
  assert.deepEqual(hours.days.sat.lunch, ['18:00', '23:00'], 'promoted to the first window');
  assert.equal(hours.days.sat.evening, null, 'and nothing left dangling');
  assert.equal(hours.days.sat.closed, false, 'the day is still open');
});

test('a genuine afternoon break still keeps both windows', () => {
  const hours = normaliseHours(WEEK({
    wed: { closed: false, lunch: ['11:00', '14:30'], evening: ['18:00', '23:00'] }
  }));
  assert.deepEqual(hours.days.wed.lunch, ['11:00', '14:30']);
  assert.deepEqual(hours.days.wed.evening, ['18:00', '23:00']);
});

/* --- staying open later than the hours say --------------------------------
   The opposite of the closure and deliberately the same shape. The thing worth
   holding down is that it can never become a published opening hour: the table
   and the JSON-LD say what happens every week, Google caches that for the place
   card, and a Saturday that ran late is not a new Saturday. */

test('an extension that has already passed is the same as none', async () => {
  const { extendHours, readSettings } = await import('../../worker/settings.js');
  const db = freshDatabase();
  const env = { DB: db };

  // Nothing set at all.
  assert.equal((await readSettings(env)).extension, null);

  // A time already gone is refused rather than stored as expired.
  assert.equal(await extendHours(env, Date.now() - 60000), null);
});

test('an extension is capped, so a slip cannot leave the shop open for a week', async () => {
  const { extendHours } = await import('../../worker/settings.js');
  const env = { DB: freshDatabase() };

  const far = Date.now() + 30 * 24 * 3600 * 1000;     // a month
  const got = await extendHours(env, far);
  const hours = (Date.parse(got.until) - Date.now()) / 3600000;
  assert.ok(hours <= 8.01, `capped to 8 hours, got ${hours.toFixed(1)}`);
});

test('an extension is readable, and clearing it puts the hours back', async () => {
  const { extendHours, clearExtension, readSettings, forgetCache } =
    await import('../../worker/settings.js');
  const env = { DB: freshDatabase() };

  await extendHours(env, Date.now() + 45 * 60000);
  forgetCache(env);
  const on = await readSettings(env);
  assert.ok(on.extension, 'the extension is in effect');
  assert.ok(Date.parse(on.extension.until) > Date.now());
  assert.ok(Date.parse(on.extension.from) <= Date.now(), 'and knows when it started');

  await clearExtension(env);
  forgetCache(env);
  assert.equal((await readSettings(env)).extension, null);
});
