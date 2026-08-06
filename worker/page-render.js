/* Putting what is true right now into the page, before it is sent.
   ---------------------------------------------------------------------------
   The hours and the ordering switch live in the database, and the pages that
   state them are static files. Three readers need the answer and only one of
   them runs JavaScript:

     a guest      — who must not watch last week's hours repaint into this
                    week's a moment after the page appears;
     Googlebot    — which does render, eventually, on its own schedule;
     Applebot,
     Bingbot      — which largely do not, and which feed the Apple Maps and
                    Bing place cards where most of this restaurant's local
                    searches actually land.

   So the answer is written into the markup on the way out. Nothing here is a
   second copy of a business fact: every value comes from `settings`, and the
   page is rewritten from it rather than agreeing with it.

   Done with string surgery rather than HTMLRewriter, deliberately. Every edit
   is anchored to a marker that exists in the markup for this purpose — an id,
   or a pair of comments that say what they are for — and none of it depends on
   a runtime global, so the whole thing runs under `node --test` and is covered
   by tests that would otherwise have to be taken on trust. The site already
   reads its own menu out of index.html the same way (worker/site-data.js).

   Every edit is independent and every one is optional: a page without an
   `#hoursTable` simply does not get that one. A marker that has been renamed
   leaves the page exactly as it was found, which is the correct failure — a
   page stating last week's hours beats a page with its markup torn open. */

const DAYS = [
  ['mon', 'Montag', 'Monday', 'الاثنين'],
  ['tue', 'Dienstag', 'Tuesday', 'الثلاثاء'],
  ['wed', 'Mittwoch', 'Wednesday', 'الأربعاء'],
  ['thu', 'Donnerstag', 'Thursday', 'الخميس'],
  ['fri', 'Freitag', 'Friday', 'الجمعة'],
  ['sat', 'Samstag', 'Saturday', 'السبت'],
  ['sun', 'Sonntag', 'Sunday', 'الأحد']
];

const SCHEMA_DAY = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday',
  fri: 'Friday', sat: 'Saturday', sun: 'Sunday'
};

const LABEL = {
  closed: ['Geschlossen', 'Closed', 'مغلق'],
  // The rows are labelled by SERVICE, not by time of day. A kitchen open
  // straight through has no "Mittag" and no "Abend" to point at, but it always
  // has an opening and a delivery shift, and those are the two things a guest
  // is actually trying to tell apart.
  pickup: ['Abholung', 'Pickup', 'الاستلام'],
  delivery: ['Lieferung', 'Delivery', 'التوصيل']
};

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ESC[c]);

/** The opening windows of one day. Mirrors slotsFor() in order.js and reads the
 *  same config values by the same names, so the table the Worker draws and the
 *  table the browser draws cannot disagree.
 *
 *  Two windows that TOUCH are one window. 11:00–18:00 followed by 18:00–23:00
 *  is not an afternoon break, it is a day the restaurant typed in two boxes
 *  because the form has two boxes — and printing it as two rows tells a guest
 *  something closes at 18:00 when nothing does. */
export function slotsFor(hours, key) {
  const day = (hours.days || {})[key];
  if (!day || day.closed) return [];
  const out = [];
  for (const win of [day.lunch, day.evening]) {
    if (!win) continue;
    const last = out[out.length - 1];
    if (last && last.to === win[0]) last.to = win[1];
    else out.push({ from: win[0], to: win[1] });
  }
  return out;
}

/** The windows a driver actually goes out in: the opening, clipped to start no
 *  earlier than `deliveryFrom`. A window that ends before the shift starts
 *  drops out entirely — that is the collection-only part of the day. */
export function deliveryFor(hours, key) {
  const from = hours.deliveryFrom || '';
  return slotsFor(hours, key)
    .filter((s) => !from || from < s.to)
    .map((s) => ({ from: from && from > s.from ? from : s.from, to: s.to }));
}

function schemaHours(hours) {
  const spec = [];
  for (const [key] of DAYS) {
    for (const slot of slotsFor(hours, key)) {
      spec.push({
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: SCHEMA_DAY[key],
        opens: slot.from,
        closes: slot.to
      });
    }
  }
  return spec;
}

/* One row per day, exactly as renderHours() in order.js lays them out, so the
   fallback and the rendered table are the same table. Every visible word
   carries all three languages: this is the markup a reader without JavaScript
   is left with, and the language switch is JavaScript. */
const span = (wins) => wins.map((w) => `${w.from} – ${w.to}`).join(' & ');

/* One labelled line — "Abholung 11:00 – 23:00". The label is omitted entirely
   when there is nothing to distinguish, because a single row reading "Abholung"
   on a day that also delivers throughout is a label that asks a question it
   then does not answer. */
function line(labelKey, wins) {
  const label = labelKey ? LABEL[labelKey] : null;
  return '<span class="hslot">' +
    (label ? `<span class="hslot-label t" data-de="${esc(label[0])}" data-en="${esc(label[1])}" data-ar="${esc(label[2])}">${esc(label[0])}</span>` : '') +
    `<span class="hslot-time">${esc(span(wins))}</span></span>`;
}

function hoursTable(hours) {
  return DAYS.map(([key, de, en, ar]) => {
    const open = slotsFor(hours, key);
    const del = deliveryFor(hours, key);
    // Labelled only when the driver's day is genuinely shorter than the shop's.
    const split = open.length && span(del) !== span(open);

    const cells = open.length
      ? `<span class="hslots">${
          split
            ? line('pickup', open) + (del.length ? line('delivery', del) : '')
            : line(null, open)
        }</span>`
      : `<span class="hclosed t" data-de="${LABEL.closed[0]}" data-en="${LABEL.closed[1]}" data-ar="${LABEL.closed[2]}">${LABEL.closed[0]}</span>`;

    return `<div class="hrow"><span class="day t" data-de="${esc(de)}" data-en="${esc(en)}" data-ar="${esc(ar)}">${esc(de)}</span>${cells}</div>`;
  }).join('');
}

/* --- the edits ------------------------------------------------------------ */

const HOURS_BLOCK = /(<!--hours:start-->)[\s\S]*?(<!--hours:end-->)/;
const SCHEMA_BLOCK = /(<script id="restaurantSchema"[^>]*>)([\s\S]*?)(<\/script>)/;

/**
 * @param {string} html the page as published
 * @param {object} settings from readSettings()
 */
export function withLiveData(html, settings) {
  const { hours, ordering } = settings;
  let out = html;

  /* Read by order.js at boot, synchronously — no fetch, so no moment in which
     the page shows one thing and then another. type="application/json" is a
     data block, not a script: nothing executes it, so the strict script-src
     stands untouched. The escape keeps a "</script>" inside a value from
     ending the element early. */
  const island = `<script type="application/json" id="kairoLive">${
    JSON.stringify({ hours, ordering }).replace(/</g, '\\u003c')
  }</script>\n`;
  if (out.includes('</head>')) out = out.replace('</head>', island + '</head>');

  // Lets CSS dim the order buttons before a line of script has run.
  if (!ordering.open) {
    out = out.replace(/<html(\s|>)/, '<html data-ordering="off"$1');
  }

  if (SCHEMA_BLOCK.test(out)) {
    out = out.replace(SCHEMA_BLOCK, (whole, open, body, close) => {
      try {
        const data = JSON.parse(body);
        data.openingHoursSpecification = schemaHours(hours);
        return open + JSON.stringify(data) + close;
      } catch {
        // Unparseable markup is left as found: a page still stating last
        // week's hours beats a page whose structured data is broken.
        return whole;
      }
    });
  }

  if (HOURS_BLOCK.test(out)) {
    out = out.replace(HOURS_BLOCK, (whole, start, end) => start + hoursTable(hours) + end);
  }

  return out;
}

/** An ETag that changes when what the page SAYS changes, not only when the
 *  file behind it does. Without this, `must-revalidate` faithfully revalidates
 *  its way back to a cached copy stating last month's hours, because the asset
 *  it was built from never moved. */
export function liveETag(assetETag, settings) {
  const base = (assetETag || 'none').replace(/^W\//, '').replace(/"/g, '');
  const state = settings.ordering.open ? 'open' : `off:${settings.ordering.resumesAt}`;
  return `W/"${base}~${settings.hoursVersion}~${state}"`;
}
