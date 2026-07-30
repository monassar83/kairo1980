/* ---------------------------------------------------------------------------
   KAIRO 1980 — opening hours renderer + basket with WhatsApp handover
   ---------------------------------------------------------------------------
   Everything configurable lives in config.js. This file only reads it.

   Why a basket that hands over to WhatsApp instead of plain WhatsApp links:
   a free-text chat order arrives incomplete (no quantities, no address, no
   total) and costs a phone call to repair. A basket that composes the message
   for the guest keeps the conversion in WhatsApp — where this restaurant
   already answers — while guaranteeing a structured, priced order. It needs no
   backend, no cookies and no third-party script: nothing leaves the browser
   until the guest presses "send", which also keeps the site GDPR-clean.

   The basket has no hardcoded menu. It reads every `.mitem[data-item]` out of
   the page, so adding a dish to the HTML is enough to make it orderable.
--------------------------------------------------------------------------- */

(function () {
  'use strict';

  var CFG = window.KAIRO_CONFIG;
  if (!CFG) return;

  // v2 stores { savedAt, items } instead of a bare id -> qty map, so a basket
  // can expire. v1 keys are removed on sight rather than migrated: they carry
  // no timestamp, so there is no way to tell a five-minute-old basket from a
  // five-week-old one.
  var STORAGE_KEY = 'kairo.cart.v2';
  var LEGACY_STORAGE_KEYS = ['kairo.cart.v1'];
  var DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  var SCHEMA_DAY = {
    mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday',
    fri: 'Friday', sat: 'Saturday', sun: 'Sunday'
  };

  var T = {
    de: {
      days: { mon: 'Montag', tue: 'Dienstag', wed: 'Mittwoch', thu: 'Donnerstag', fri: 'Freitag', sat: 'Samstag', sun: 'Sonntag' },
      lunch: 'Mittag', evening: 'Abend', closed: 'Geschlossen',
      pickupOnly: 'nur Abholung',
      lunchSoon: 'Neu ab {date}: Mittagsservice {windows}.',
      lunchNow: 'Mittagsservice: {windows}.',
      lunchPickupOnly: 'Mittags ausschließlich zur Abholung — Lieferungen ab {evening} Uhr.',
      lunchWithDelivery: 'Mittags liefern wir und Sie können abholen.',
      lunchClause: 'Bitte beachten: Mittags ist nur Abholung möglich, Lieferungen ab {evening} Uhr.',
      lunchByArrangement: 'Firmenbestellungen zu anderen Zeiten nach Absprache.',
      businessByArrangement: 'Liefertermine für Firmenbestellungen nach Absprache — sagen Sie uns einfach, wann Sie es brauchen.',
      cartLunchPickup: 'Mittags ({windows}) bieten wir ausschließlich Abholung an. Für eine Lieferung wählen Sie unter „Wunschtermin" bitte eine Zeit ab {evening} Uhr.',
      warnLunchSoon: 'Der Mittagsservice startet erst am {date}. Bis dahin sind wir abends ab {evening} Uhr für Sie da — senden Sie die Bestellung gern trotzdem, wir antworten im Chat.',
      openNow: 'Jetzt geöffnet', closedNow: 'Zurzeit geschlossen',
      until: 'bis', opensAgain: 'öffnet wieder',
      today: 'Heute',
      add: 'Hinzufügen', remove: 'Entfernen',
      cartOpen: 'Bestellung öffnen', itemsOne: 'Gericht', itemsMany: 'Gerichte',
      cart: 'Bestellung', cartEmpty: 'Ihr Warenkorb ist noch leer.',
      cartEmptyHint: 'Tippen Sie in der Speisekarte auf „+", um Gerichte hinzuzufügen.',
      subtotal: 'Zwischensumme', discount: 'Direktbestellung', total: 'Gesamt',
      type: 'Lieferung oder Abholung', delivery: 'Lieferung', pickup: 'Abholung',
      name: 'Name', phone: 'Telefon', address: 'Straße & Hausnummer',
      addressPh: 'z. B. Rostocker Straße 20a',
      postcode: 'Postleitzahl', postcodePh: '68766',
      deliveryFee: 'Lieferung',
      zoneOk: 'Wir liefern nach {city}.',
      zoneFee: 'Lieferung nach {city}: {fee}.',
      zoneBelowMin: 'Noch {missing} bis zum Mindestbestellwert in {city} ({min} €).',
      zoneUnknown: 'Diese Postleitzahl liegt außerhalb unseres Liefergebiets. Sie können uns trotzdem eine unverbindliche Anfrage senden — das ist noch keine Bestellung. Wir prüfen, ob wir zu Ihnen liefern können, und antworten direkt im Chat.',
      when: 'Wunschtermin', asap: 'So schnell wie möglich', scheduled: 'Für später planen',
      dateLabel: 'Datum', timeLabel: 'Uhrzeit',
      closedNote: 'Wir haben gerade geschlossen. Sie können trotzdem vorbestellen — wählen Sie einen Wunschtermin, wir bestätigen ihn im Chat.',
      warnClosedAsap: 'Wir sind gerade geschlossen, „so schnell wie möglich" heißt daher: zur nächsten Öffnung ({next}).',
      warnOutsideHours: 'Zu diesem Termin haben wir geschlossen. Senden Sie die Bestellung trotzdem — wir schlagen im Chat eine passende Zeit vor.',
      warnLeadTime: 'Für Firmenbestellungen brauchen wir mindestens {h} Stunden Vorlauf. Wir prüfen den Termin und bestätigen ihn im Chat.',
      warnPastTime: 'Dieser Termin liegt in der Vergangenheit.',
      notes: 'Anmerkung', notesPh: 'Allergien, Klingel, Etage …',
      company: 'Firma / Rechnungsadresse',
      isBusiness: 'Firmenbestellung',
      leadTime: 'Größere Bestellungen bitte mindestens {h} Std. im Voraus.',
      send: 'Per WhatsApp senden', sendRequest: 'Unverbindliche Anfrage senden',
      sending: 'WhatsApp wird geöffnet …',
      sentTitleRequest: 'Anfrage vorbereitet',
      sentTextRequest: 'Bitte senden Sie die Nachricht ab. Es handelt sich um eine Anfrage, nicht um eine bestätigte Bestellung — wir melden uns im Chat, ob wir zu Ihnen liefern können.',
      msgTitleRequest: 'ANFRAGE (keine Bestellung) über kairo1980.de',
      privacy: 'Ihre Angaben werden ausschließlich in die WhatsApp-Nachricht übernommen — wir speichern nichts auf dieser Seite.',
      required: 'Bitte ausfüllen.',
      sentTitle: 'WhatsApp geöffnet',
      sentText: 'Bitte senden Sie die vorbereitete Nachricht ab — wir bestätigen Ihre Bestellung direkt im Chat.',
      payNow: 'Jetzt per PayPal bezahlen', payHint: 'Optional — Sie können auch vor Ort bezahlen.',
      or: 'oder',
      pay: { cash: 'Bargeld', giro: 'EC-/Girocard', card: 'Kreditkarte' },
      payOnSite: 'Zahlung bei {type}: {methods}.',
      payOnline: 'Oder direkt online per PayPal — den Zahlungslink erhalten Sie sofort nach dem Absenden der Bestellung.',
      payInvoice: 'Rechnung (Firmenkunden)',
      // Lower case in English, where "Payment on Pickup" reads like a title.
      // German keeps the capitals: they are nouns.
      atPickup: 'Abholung', atDelivery: 'Lieferung',
      payMethod: 'Zahlungsart',
      payOptionOnline: 'Online per PayPal',
      payOptionOnSite: 'Bei Erhalt bezahlen',
      payOnlineHint: 'Direkt nach dem Absenden öffnet sich PayPal mit dem exakten Betrag von {total}. Verbindlich wird Ihre Bestellung, sobald wir im Chat bestätigen — Sie können auch erst danach bezahlen.',
      mPayment: 'Zahlung',
      mPayOnline: 'Online per PayPal (bitte Zahlungseingang prüfen)',
      mPayOnSite: 'Vor Ort bei {type} ({methods})',
      newOrder: 'Neue Bestellung', close: 'Schließen',
      msgTitle: 'Neue Bestellung über kairo1980.de',
      msgBusiness: 'FIRMENBESTELLUNG',
      mLead: 'Vorlauf', mHours: 'Std.',
      mType: 'Art', mName: 'Name', mPhone: 'Telefon', mAddress: 'Adresse',
      mTime: 'Wunschtermin', mNotes: 'Anmerkung', mCompany: 'Firma',
      mPreorder: 'VORBESTELLUNG — ausserhalb der Öffnungszeiten aufgegeben',
      mCheckTime: 'Wunschtermin ausserhalb der Öffnungszeiten — bitte prüfen',
      mCheckLead: 'Weniger als {h} Std. Vorlauf — bitte prüfen',
      mSubtotal: 'Zwischensumme', mDiscount: 'Rabatt', mTotal: 'Gesamt', mPaypal: 'PayPal',
      mOutsideArea: 'PLZ ausserhalb des Liefergebiets — Anfrage zur Prüfung',
      mUnderMin: 'Unter dem Mindestbestellwert ({min} €)'
    },
    en: {
      days: { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' },
      lunch: 'Lunch', evening: 'Evening', closed: 'Closed',
      pickupOnly: 'pickup only',
      lunchSoon: 'New from {date}: lunch service {windows}.',
      lunchNow: 'Lunch service: {windows}.',
      lunchPickupOnly: 'Lunch is for pickup only — deliveries from {evening}.',
      lunchWithDelivery: 'At lunchtime we deliver and you can collect.',
      lunchClause: 'Please note: lunchtime is pickup only, deliveries from {evening}.',
      lunchByArrangement: 'Corporate orders outside these times by arrangement.',
      businessByArrangement: 'Delivery times for corporate orders by arrangement — just tell us when you need it.',
      cartLunchPickup: 'At lunchtime ({windows}) we offer pickup only. For a delivery, pick a time from {evening} under "Preferred time".',
      warnLunchSoon: 'The lunch service only starts on {date}. Until then we are open in the evening from {evening} — do send the order anyway and we will reply in the chat.',
      openNow: 'Open now', closedNow: 'Currently closed',
      until: 'until', opensAgain: 'opens again',
      today: 'Today',
      add: 'Add', remove: 'Remove',
      cartOpen: 'Open your order', itemsOne: 'dish', itemsMany: 'dishes',
      cart: 'Your order', cartEmpty: 'Your basket is still empty.',
      cartEmptyHint: 'Tap "+" next to a dish in the menu to add it.',
      subtotal: 'Subtotal', discount: 'Direct order', total: 'Total',
      type: 'Delivery or pickup', delivery: 'Delivery', pickup: 'Pickup',
      name: 'Name', phone: 'Phone', address: 'Street & number',
      addressPh: 'e.g. Rostocker Straße 20a',
      postcode: 'Postcode', postcodePh: '68766',
      deliveryFee: 'Delivery',
      zoneOk: 'We deliver to {city}.',
      zoneFee: 'Delivery to {city}: {fee}.',
      zoneBelowMin: '{missing} to go until the minimum order in {city} (€{min}).',
      zoneUnknown: 'This postcode is outside our delivery area. You can still send us a non-binding enquiry — this is not an order yet. We will check whether we can deliver to you and reply in the chat.',
      when: 'Preferred time', asap: 'As soon as possible', scheduled: 'Schedule for later',
      dateLabel: 'Date', timeLabel: 'Time',
      closedNote: 'We are closed right now. You can still pre-order — pick a preferred time and we will confirm it in the chat.',
      warnClosedAsap: 'We are currently closed, so "as soon as possible" means at our next opening ({next}).',
      warnOutsideHours: 'We are closed at that time. Send the order anyway — we will suggest a suitable time in the chat.',
      warnLeadTime: 'Corporate orders need at least {h} hours lead time. We will check the time and confirm it in the chat.',
      warnPastTime: 'That time is in the past.',
      notes: 'Note', notesPh: 'Allergies, doorbell, floor …',
      company: 'Company / billing address',
      isBusiness: 'Corporate order',
      leadTime: 'Please place larger orders at least {h} hours in advance.',
      send: 'Send via WhatsApp', sendRequest: 'Send a non-binding enquiry',
      sending: 'Opening WhatsApp …',
      sentTitleRequest: 'Enquiry prepared',
      sentTextRequest: 'Please send the message. This is an enquiry, not a confirmed order — we will let you know in the chat whether we can deliver to you.',
      msgTitleRequest: 'ENQUIRY (not an order) via kairo1980.de',
      privacy: 'Your details are only copied into the WhatsApp message — nothing is stored on this site.',
      required: 'Please fill this in.',
      sentTitle: 'WhatsApp opened',
      sentText: 'Please send the prepared message — we confirm your order right in the chat.',
      payNow: 'Pay now with PayPal', payHint: 'Optional — you can also pay in person.',
      or: 'or',
      pay: { cash: 'cash', giro: 'girocard', card: 'credit card' },
      payOnSite: 'Payment on {type}: {methods}.',
      payOnline: 'Or pay online with PayPal — you receive the payment link the moment you send the order.',
      payInvoice: 'Invoice (business customers)',
      atPickup: 'pickup', atDelivery: 'delivery',
      payMethod: 'Payment',
      payOptionOnline: 'Online with PayPal',
      payOptionOnSite: 'Pay on arrival',
      payOnlineHint: 'Right after you send, PayPal opens with the exact amount of {total}. Your order becomes binding when we confirm it in the chat — you can also pay after that.',
      mPayment: 'Payment',
      mPayOnline: 'Online via PayPal (please check it arrived)',
      mPayOnSite: 'In person on {type} ({methods})',
      newOrder: 'New order', close: 'Close',
      msgTitle: 'New order via kairo1980.de',
      msgBusiness: 'CORPORATE ORDER',
      mLead: 'Lead time', mHours: 'hrs',
      mType: 'Type', mName: 'Name', mPhone: 'Phone', mAddress: 'Address',
      mTime: 'Preferred time', mNotes: 'Note', mCompany: 'Company',
      mPreorder: 'PRE-ORDER — placed outside opening hours',
      mCheckTime: 'Preferred time is outside opening hours — please check',
      mCheckLead: 'Less than {h} hrs lead time — please check',
      mSubtotal: 'Subtotal', mDiscount: 'Discount', mTotal: 'Total', mPaypal: 'PayPal',
      mOutsideArea: 'Postcode outside the delivery area — request to be checked',
      mUnderMin: 'Below the minimum order (€{min})'
    }
  };

  function lang() {
    return document.documentElement.lang === 'en' ? 'en' : 'de';
  }
  function t() {
    return T[lang()];
  }

  var money = function (value) {
    return new Intl.NumberFormat(CFG.order.locale || 'de-DE', {
      minimumFractionDigits: 2, maximumFractionDigits: 2
    }).format(value) + ' ' + (CFG.order.currency || '€');
  };

  /* =========================================================================
     Opening hours
     ========================================================================= */

  function hhmm(value) {
    var bits = String(value).split(':');
    return (+bits[0]) * 60 + (+bits[1] || 0);
  }

  // The guest may sit in any timezone; the restaurant does not. Always judge
  // "open now" against Europe/Berlin.
  function berlinNow() {
    try {
      var parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Berlin', weekday: 'short',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false
      }).formatToParts(new Date());
      var get = function (type) {
        var hit = parts.filter(function (p) { return p.type === type; })[0];
        return hit ? hit.value : '';
      };
      var map = { Mon: 'mon', Tue: 'tue', Wed: 'wed', Thu: 'thu', Fri: 'fri', Sat: 'sat', Sun: 'sun' };
      var day = map[get('weekday').slice(0, 3)];
      if (!day) return null;
      return {
        day: day,
        minutes: ((+get('hour')) % 24) * 60 + (+get('minute')),
        iso: get('year') + '-' + get('month') + '-' + get('day')
      };
    } catch (e) {
      return null;
    }
  }

  /* --- the lunch service --------------------------------------------------
     Three questions, always in this order, because each only matters if the
     one before it is true:

       lunchPublished()  is lunch mentioned on the site at all?
       lunchRunning()    has its start date arrived — can it be ordered yet?
       lunchDelivers()   does it deliver, or is it collection only?

     A service that is advertised but has not started is deliberately NOT an
     opening hour: it is absent from the hours table, from the "open now" badge
     and from the hours Google indexes, while the marketing copy names the day
     it begins. Nobody has to flip anything on launch day — the date does it.
  ------------------------------------------------------------------------- */

  function lunchCfg() {
    return (CFG.hours && CFG.hours.lunch) || {};
  }
  function lunchPublished() {
    return !!lunchCfg().enabled;
  }
  function lunchStartsOn() {
    var iso = String(lunchCfg().startsOn || '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : '';
  }
  // Berlin's date, with the device's own as a fallback: a start date is only
  // ever compared against a calendar day, never against a clock time.
  function todayISO() {
    var now = berlinNow();
    if (now) return now.iso;
    var d = new Date();
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function lunchRunning() {
    if (!lunchPublished()) return false;
    var starts = lunchStartsOn();
    return !starts || todayISO() >= starts;   // ISO dates compare as strings
  }
  function lunchDelivers() {
    return lunchCfg().delivery === true;
  }

  // Every service window of one day, lunch first, honouring the master switch.
  function slotsFor(dayKey) {
    var day = (CFG.hours.days || {})[dayKey];
    if (!day || day.closed) return [];
    var out = [];
    if (lunchRunning() && day.lunch) {
      out.push({ kind: 'lunch', from: day.lunch[0], to: day.lunch[1],
                 pickupOnly: !lunchDelivers() });
    }
    if (day.evening) {
      out.push({ kind: 'evening', from: day.evening[0], to: day.evening[1] });
    }
    return out;
  }

  // The evening opening every open day shares — the time copy points a guest
  // to when they wanted a lunch delivery. The earliest one wins if they differ.
  function eveningStart() {
    var best = null;
    DAY_KEYS.forEach(function (key) {
      var day = (CFG.hours.days || {})[key];
      if (!day || day.closed || !day.evening) return;
      if (best === null || hhmm(day.evening[0]) < hhmm(best)) best = day.evening[0];
    });
    return best;
  }

  /* --- scheduling ---------------------------------------------------------
     The guest may order at 02:00 for tomorrow lunch. None of these checks
     block: they set expectations and flag the message, the same contract the
     postcode check uses.
  ------------------------------------------------------------------------- */

  // 'YYYY-MM-DD' -> config day key, without touching the local timezone.
  function dayKeyFromISO(iso) {
    var p = String(iso).split('-');
    if (p.length !== 3) return null;
    var date = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
    if (isNaN(date.getTime())) return null;
    return DAY_KEYS[(date.getUTCDay() + 6) % 7];
  }

  // Comparable ordinal for a wall-clock moment; both sides are Berlin time.
  function stamp(iso, minutes) {
    var p = String(iso).split('-');
    return Date.UTC(+p[0], +p[1] - 1, +p[2]) / 60000 + minutes;
  }

  // The service window covering a moment, or null. Which window it is decides
  // more than "are we open": a lunch window may be collection only.
  function slotAt(iso, minutes) {
    var key = dayKeyFromISO(iso);
    if (!key) return null;
    var hit = null;
    slotsFor(key).forEach(function (s) {
      if (minutes >= hhmm(s.from) && minutes <= hhmm(s.to)) hit = s;
    });
    return hit;
  }

  function openAt(iso, minutes) {
    return !!slotAt(iso, minutes);
  }

  // A lunch time chosen before the service starts. Not the same as "we are
  // closed": the service exists, it just has not begun — so say when it does.
  function pendingLunchAt(iso, minutes) {
    if (!lunchPublished() || lunchRunning()) return false;
    var key = dayKeyFromISO(iso);
    var day = key && (CFG.hours.days || {})[key];
    if (!day || day.closed || !day.lunch) return false;
    return minutes >= hhmm(day.lunch[0]) && minutes <= hhmm(day.lunch[1]);
  }

  function isOpenNow() {
    var now = berlinNow();
    return !!now && openAt(now.iso, now.minutes);
  }

  // First service window at or after "now", searched a week ahead.
  function nextOpening() {
    var now = berlinNow();
    if (!now) return null;
    var L = t();
    for (var i = 0; i < 8; i++) {
      var key = DAY_KEYS[(DAY_KEYS.indexOf(now.day) + i) % 7];
      var slots = slotsFor(key);
      for (var j = 0; j < slots.length; j++) {
        if (i > 0 || hhmm(slots[j].from) > now.minutes) {
          return { day: key, from: slots[j].from, sameDay: i === 0, slot: slots[j],
                   label: (i === 0 ? '' : L.days[key] + ' ') + slots[j].from };
        }
      }
    }
    return null;
  }

  function renderHours() {
    var host = document.getElementById('hoursTable');
    if (!host) return;

    var L = t();
    var now = berlinNow();
    var labelled = lunchRunning();
    var html = '';

    DAY_KEYS.forEach(function (key) {
      var slots = slotsFor(key);
      var isToday = now && now.day === key;
      var cells;

      if (!slots.length) {
        cells = '<span class="hclosed">' + L.closed + '</span>';
      } else {
        cells = '<span class="hslots">' + slots.map(function (s) {
          return '<span class="hslot">' +
            (labelled ? '<span class="hslot-label">' + L[s.kind] + '</span>' : '') +
            '<span class="hslot-time">' + s.from + ' – ' + s.to + '</span>' +
            // A window we are open for but do not drive out of has to say so
            // where the times are read, not only in the notice below them.
            (s.pickupOnly ? '<span class="hslot-note">' + L.pickupOnly + '</span>' : '') +
            '</span>';
        }).join('') + '</span>';
      }

      html += '<div class="hrow' + (isToday ? ' today' : '') + '">' +
        '<span class="day">' + L.days[key] + (isToday ? ' <em>· ' + L.today + '</em>' : '') + '</span>' +
        cells + '</div>';
    });

    host.innerHTML = html;
    renderStatus(now);
    updateSchemaHours();
  }

  function renderStatus(now) {
    var host = document.getElementById('hoursStatus');
    if (!host) return;
    if (!now) { host.innerHTML = ''; return; }

    var L = t();
    var open = null;
    slotsFor(now.day).forEach(function (s) {
      if (now.minutes >= hhmm(s.from) && now.minutes < hhmm(s.to)) open = s;
    });

    if (open) {
      host.className = 'hours-status is-open';
      host.innerHTML = '<span class="hours-dot"></span>' + L.openNow +
        ' <span class="hours-status-sub">· ' + L.until + ' ' + open.to + '</span>';
      return;
    }

    // Next window: the rest of today first, then the following days.
    var next = null;
    for (var i = 0; i < 8 && !next; i++) {
      var key = DAY_KEYS[(DAY_KEYS.indexOf(now.day) + i) % 7];
      var slots = slotsFor(key);
      for (var j = 0; j < slots.length; j++) {
        if (i > 0 || hhmm(slots[j].from) > now.minutes) {
          next = { day: key, slot: slots[j], sameDay: i === 0 };
          break;
        }
      }
    }

    host.className = 'hours-status is-closed';
    host.innerHTML = '<span class="hours-dot"></span>' + L.closedNow +
      (next ? ' <span class="hours-status-sub">· ' + L.opensAgain + ' ' +
        (next.sameDay ? '' : L.days[next.day] + ' ') + next.slot.from + '</span>' : '');
  }

  // Keep schema.org in step with the page. Google renders this page, so the
  // rewritten JSON-LD is what gets indexed; the static block in the HTML stays
  // as a valid fallback for crawlers that do not execute scripts.
  var schemaRating = null;

  function updateSchemaHours() {
    var node = document.getElementById('restaurantSchema');
    if (!node) return;
    try {
      var data = JSON.parse(node.textContent);

      var spec = [];
      DAY_KEYS.forEach(function (key) {
        slotsFor(key).forEach(function (s) {
          spec.push({
            '@type': 'OpeningHoursSpecification',
            dayOfWeek: SCHEMA_DAY[key],
            opens: s.from,
            closes: s.to
          });
        });
      });
      if (spec.length) data.openingHoursSpecification = spec;

      // Every town we deliver to, as a named place rather than a bare string.
      var zones = (CFG.delivery && CFG.delivery.zones) || [];
      if (zones.length) {
        var seen = {};
        data.areaServed = zones.map(function (row) {
          return String(row[1]).replace(/\s*\(.*\)$/, '').split(' / ')[0];
        }).filter(function (city) {
          if (seen[city]) return false;
          seen[city] = true;
          return true;
        }).map(function (city) {
          return { '@type': 'City', name: city };
        });
      }

      // The menu, read from the page so it cannot drift from what guests see.
      var menu = buildMenuSchema();
      if (menu) data.hasMenu = menu;

      // Payment methods from config rather than from this file's own literal:
      // PayPal must not appear here before it appears in the basket.
      var accepted = paymentAccepted();
      if (accepted) data.paymentAccepted = accepted;

      // Only ever the real Google figures, and only while they are on screen.
      if (schemaRating && schemaRating.count > 0) {
        data.aggregateRating = {
          '@type': 'AggregateRating',
          ratingValue: schemaRating.value,
          reviewCount: schemaRating.count,
          bestRating: 5,
          worstRating: 1
        };
      }

      node.textContent = JSON.stringify(data, null, 2);
    } catch (e) { /* malformed JSON-LD — leave the original untouched */ }
  }

  function buildMenuSchema() {
    var heads = document.querySelectorAll('.menu-section .cat-head');
    if (!heads.length) return null;

    var sections = [];
    [].forEach.call(heads, function (head) {
      var name = head.querySelector('.cat-name');
      var dishes = [];
      var node = head.nextElementSibling;
      while (node && !node.classList.contains('cat-head')) {
        if (node.classList.contains('mitem')) {
          var title = node.querySelector('.mname');
          var price = node.getAttribute('data-price');
          if (title) {
            var dish = { '@type': 'MenuItem', name: title.textContent.trim() };
            var desc = node.querySelector('.mdesc');
            if (desc) dish.description = desc.textContent.trim();
            if (price) {
              dish.offers = { '@type': 'Offer', price: price, priceCurrency: 'EUR' };
            }
            var tag = node.querySelector('.tag');
            if (tag) dish.suitableForDiet = /vegan/i.test(tag.textContent)
              ? 'https://schema.org/VeganDiet'
              : 'https://schema.org/VegetarianDiet';
            dishes.push(dish);
          }
        }
        node = node.nextElementSibling;
      }
      if (name && dishes.length) {
        sections.push({
          '@type': 'MenuSection',
          name: name.textContent.trim(),
          hasMenuItem: dishes
        });
      }
    });

    if (!sections.length) return null;
    return {
      '@type': 'Menu',
      name: lang() === 'en' ? 'Menu' : 'Speisekarte',
      url: 'https://kairo1980.de/#speisekarte',
      hasMenuSection: sections
    };
  }

  /* =========================================================================
     Basket
     ========================================================================= */

  var items = {};   // id -> { el, price, node }
  var cart = {};    // id -> qty

  /* --- basket persistence -------------------------------------------------
     A basket is a short-lived intention, not a saved document. Remembering it
     forever is the behaviour a guest reads as a bug: they close the tab, come
     back next week and find an order they no longer want — priced at whatever
     the menu said back then. Remembering it for nothing is just as bad, since
     a reload, a phone call or a detour to the delivery-area list would empty
     it. So it is kept on a sliding window, set in config.js, and the clock
     restarts on every change.
  ------------------------------------------------------------------------- */

  function cartLifetimeMs() {
    var minutes = CFG.order.cartLifetimeMinutes;
    if (minutes === 0) return 0;                       // never remembered
    return (minutes > 0 ? minutes : 120) * 60000;      // unset -> 2 hours
  }

  function clearStoredCart() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* private mode */ }
  }

  function loadCart() {
    LEGACY_STORAGE_KEYS.forEach(function (key) {
      try { localStorage.removeItem(key); } catch (e) { /* private mode */ }
    });

    var lifetime = cartLifetimeMs();
    if (!lifetime) { clearStoredCart(); return; }

    try {
      var raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!raw || typeof raw !== 'object' || !raw.items) { clearStoredCart(); return; }

      // A negative age means the device clock moved backwards; that basket is
      // no more trustworthy than an expired one.
      var age = Date.now() - raw.savedAt;
      if (!(raw.savedAt > 0) || age < 0 || age > lifetime) { clearStoredCart(); return; }

      Object.keys(raw.items).forEach(function (id) {
        var qty = parseInt(raw.items[id], 10);
        if (items[id] && qty > 0) cart[id] = Math.min(qty, 99);
      });
    } catch (e) { clearStoredCart(); }
  }

  function saveCart() {
    if (!cartLifetimeMs() || !count()) { clearStoredCart(); return; }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        savedAt: Date.now(), items: cart
      }));
    } catch (e) { /* private mode */ }
  }

  function itemName(id) {
    var node = items[id] && items[id].node;
    return node ? node.textContent.trim() : id;
  }

  // Postcode -> zone. Advisory only: an unknown postcode is reported, never
  // used to refuse an order (see the rationale in config.js).
  function zoneFor(postcode) {
    var code = String(postcode || '').replace(/\D/g, '');
    if (code.length !== 5) return null;
    var rows = (CFG.delivery && CFG.delivery.zones) || [];
    for (var i = 0; i < rows.length; i++) {
      if (rows[i][0] === code) {
        return { plz: rows[i][0], city: rows[i][1], km: rows[i][2], minOrder: rows[i][3], fee: rows[i][4] };
      }
    }
    return null;
  }

  function totals() {
    var subtotal = 0;
    Object.keys(cart).forEach(function (id) {
      if (items[id]) subtotal += items[id].price * cart[id];
    });
    // Company + collected in person earns the better rate; everything else
    // gets the standard direct-order discount.
    var pct = (form.business && form.type === 'pickup' &&
               CFG.order.businessPickupDiscountPercent != null)
      ? CFG.order.businessPickupDiscountPercent
      : (CFG.order.directDiscountPercent || 0);
    var discount = Math.round(subtotal * pct) / 100;

    // The delivery fee sits OUTSIDE the discount: the 10 % is a discount on
    // food, not on driving. It is waived once the food subtotal reaches the
    // threshold — optionally only for corporate orders, see config. An unknown
    // zone charges nothing here; that fee is agreed in the chat rather than
    // guessed by the page.
    var zone = form.type === 'delivery' ? zoneFor(draft.fPlz) : null;
    var b = CFG.business || {};
    var threshold = b.freeDeliveryFrom || Infinity;
    var qualifies = subtotal >= threshold && (!b.freeDeliveryBusinessOnly || form.business);
    var fee = (zone && !qualifies) ? zone.fee : 0;

    return {
      subtotal: subtotal,
      discount: discount,
      discountPercent: pct,
      fee: fee,
      zone: zone,
      total: subtotal - discount + fee
    };
  }

  function count() {
    return Object.keys(cart).reduce(function (n, id) { return n + cart[id]; }, 0);
  }

  function setQty(id, qty) {
    if (qty <= 0) delete cart[id];
    else cart[id] = Math.min(qty, 99);
    saveCart();
    paint();
    bumpFab();
  }

  // The steam rises once whenever the basket changes: on a long menu the
  // button sits far from the dish that was just tapped, and a change with no
  // acknowledgement reads as a tap that did not register.
  var bumpTimer = null;
  function bumpFab() {
    if (!els.fab || els.fab.hidden) return;
    els.fab.classList.remove('is-bumped');
    void els.fab.offsetWidth;                 // restart the animation
    els.fab.classList.add('is-bumped');
    clearTimeout(bumpTimer);
    bumpTimer = setTimeout(function () {
      if (els.fab) els.fab.classList.remove('is-bumped');
    }, 1200);
  }

  /* --- menu wiring ------------------------------------------------------- */

  function collectItems() {
    [].forEach.call(document.querySelectorAll('.mitem[data-item]'), function (el) {
      var id = el.getAttribute('data-item');
      var price = parseFloat(el.getAttribute('data-price'));
      var name = el.querySelector('.mname');
      if (!id || isNaN(price) || !name) return;
      items[id] = { el: el, price: price, node: name };

      // The buy control is injected rather than written into the markup, so a
      // new dish only needs its data attributes to become orderable.
      var priceEl = el.querySelector('.mprice');
      if (!priceEl) return;
      var buy = document.createElement('div');
      buy.className = 'mbuy';
      priceEl.parentNode.insertBefore(buy, priceEl);
      buy.appendChild(priceEl);

      var stepper = document.createElement('div');
      stepper.className = 'qty';
      stepper.setAttribute('data-for', id);
      buy.appendChild(stepper);
    });
  }

  function paintMenu() {
    var L = t();
    Object.keys(items).forEach(function (id) {
      var box = items[id].el.querySelector('.qty[data-for="' + id + '"]');
      if (!box) return;
      var qty = cart[id] || 0;
      if (qty > 0) {
        box.className = 'qty has-qty';
        box.innerHTML =
          '<button type="button" class="qty-btn" data-act="dec" data-id="' + id + '" aria-label="−">−</button>' +
          '<span class="qty-num">' + qty + '</span>' +
          '<button type="button" class="qty-btn" data-act="inc" data-id="' + id + '" aria-label="+">+</button>';
      } else {
        box.className = 'qty';
        box.innerHTML = '<button type="button" class="qty-add" data-act="inc" data-id="' + id + '" ' +
          'aria-label="' + L.add + ': ' + itemName(id) + '">+</button>';
      }
    });
  }

  /* --- panel ------------------------------------------------------------- */

  // A supermarket trolley is the wrong metaphor for a restaurant: nobody
  // wheels a trolley through a kitchen. This is a cloche — the domed cover a
  // plate travels under — drawn in the same hairline weight as the rest of the
  // page, with three wisps of steam that rise every time the basket changes.
  //
  // The dome alone read as a notification bell, which is the shape it shares.
  // What separates them is the plate: the platter runs WIDER than the dome on
  // both sides and closes underneath with a shallow curve, so the silhouette
  // is a covered dish seen from the side. A bell has neither the overhang nor
  // the base — it flares open at the bottom. The knob sits directly on the
  // dome rather than on a stem, which is the other half of the difference: a
  // bell hangs from a loop above it.
  var CART_ICON =
    '<svg class="cart-icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">' +
      '<g fill="none" stroke="currentColor" stroke-width="1.4" ' +
         'stroke-linecap="round" stroke-linejoin="round">' +
        '<g class="cart-icon-steam">' +
          '<path d="M8.7 7.4c1-.9.3-2.1 0-2.8"/>' +
          '<path d="M12 6.6c1-.9.3-2.1 0-2.8"/>' +
          '<path d="M15.3 7.4c1-.9.3-2.1 0-2.8"/>' +
        '</g>' +
        // The lid is its own group so it can lift off the plate when a dish is
        // added. The plate below stays put, which is what makes the movement
        // read as a lid rather than as the whole icon jiggling.
        '<g class="cart-icon-lid">' +
          '<circle cx="12" cy="10.55" r="0.85"/>' +
          '<path d="M5 18.4a7 7 0 0 1 14 0"/>' +
        '</g>' +
        '<path d="M2.4 18.4h19.2"/>' +
        '<path d="M4.6 18.4c.5 1.8 3.4 2.9 7.4 2.9s6.9-1.1 7.4-2.9"/>' +
      '</g>' +
    '</svg>';

  var els = {};

  function buildPanel() {
    var wrap = document.createElement('div');
    wrap.innerHTML =
      '<button type="button" class="cart-fab" id="cartFab" hidden>' +
        '<span class="cart-fab-icon">' + CART_ICON + '</span>' +
        '<span class="cart-fab-count" id="cartFabCount">0</span>' +
        '<span class="cart-fab-total" id="cartFabTotal"></span>' +
      '</button>' +
      '<div class="cart-backdrop" id="cartBackdrop" hidden></div>' +
      '<aside class="cart-panel" id="cartPanel" role="dialog" aria-modal="true" aria-labelledby="cartHeading" hidden>' +
        '<header class="cart-head">' +
          '<h2 class="cart-heading" id="cartHeading"></h2>' +
          '<button type="button" class="cart-close" id="cartClose" aria-label="×">×</button>' +
        '</header>' +
        '<div class="cart-body" id="cartBody"></div>' +
      '</aside>';
    while (wrap.firstChild) document.body.appendChild(wrap.firstChild);

    els.fab = document.getElementById('cartFab');
    els.fabCount = document.getElementById('cartFabCount');
    els.fabTotal = document.getElementById('cartFabTotal');
    els.backdrop = document.getElementById('cartBackdrop');
    els.panel = document.getElementById('cartPanel');
    els.heading = document.getElementById('cartHeading');
    els.body = document.getElementById('cartBody');

    // Populated up front: an empty heading would otherwise sit in the
    // document outline that crawlers and screen readers walk.
    els.heading.textContent = t().cart;

    els.fab.addEventListener('click', function () { openPanel(); });
    els.backdrop.addEventListener('click', closePanel);
    document.getElementById('cartClose').addEventListener('click', closePanel);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !els.panel.hidden) closePanel();
      trapFocus(e);
    });
  }

  var lastFocused = null;

  function openPanel() {
    // Outside opening hours "as soon as possible" is meaningless, so the panel
    // opens on the scheduling tab. Only ever pre-selected, never forced.
    if (!isOpenNow() && !draft.fDate && form.when === 'asap') form.when = 'scheduled';
    lastFocused = document.activeElement;
    els.panel.hidden = false;
    els.backdrop.hidden = false;
    document.body.classList.add('cart-open');
    paintPanel();
    var first = els.panel.querySelector('input, button');
    if (first) first.focus({ preventScroll: true });
  }

  function closePanel() {
    els.panel.hidden = true;
    els.backdrop.hidden = true;
    document.body.classList.remove('cart-open');
    // Send focus back where it came from, so a keyboard user is not dropped
    // at the top of the document after closing the drawer.
    if (lastFocused && document.contains(lastFocused)) {
      lastFocused.focus({ preventScroll: true });
    }
    lastFocused = null;
  }

  // The panel is aria-modal, so focus must not escape it while it is open.
  function trapFocus(e) {
    if (e.key !== 'Tab' || els.panel.hidden) return;
    var focusable = els.panel.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])');
    var open = [].filter.call(focusable, function (el) {
      return el.offsetParent !== null || el === document.activeElement;
    });
    if (!open.length) return;
    var first = open[0], last = open[open.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function field(id, label, type, placeholder, required) {
    return '<label class="cart-field">' +
      '<span class="cart-label">' + label + (required ? ' *' : '') + '</span>' +
      (type === 'textarea'
        ? '<textarea id="' + id + '" rows="2" placeholder="' + placeholder + '"></textarea>'
        : '<input id="' + id + '" type="' + type + '" placeholder="' + placeholder + '"' +
          (required ? ' required' : '') + '>') +
      '</label>';
  }

  // `when` starts as 'asap', but the panel switches it to 'scheduled' the
  // first time it opens while the kitchen is closed — a 2 a.m. "as soon as
  // possible" is never what the guest means.
  // `pay` starts at 'onsite': cash is the one method that is always possible,
  // so a guest who ignores the choice cannot end up with an order that expects
  // a payment they never made.
  var form = { type: 'delivery', business: false, when: 'asap', pay: 'onsite' };

  /* --- delivery or pickup -------------------------------------------------
     The window an order will actually be served in decides whether delivery
     is on offer at all. Midday is collection only while there is no driver
     (config.js -> hours.lunch.delivery), so the basket has to know which
     window the guest has aimed at, not merely that we are open then.
  ----------------------------------------------------------------------- */

  // The window this order lands in, or null when it cannot be known — a time
  // outside every window is settled in the chat, and nothing is assumed here.
  function targetSlot() {
    if (form.when === 'scheduled') {
      if (!draft.fDate || !draft.fTime) return null;
      return slotAt(draft.fDate, hhmm(draft.fTime));
    }
    // "As soon as possible" means now if we are open, and the next opening if
    // we are not — the same promise warnClosedAsap makes to the guest.
    var now = berlinNow();
    if (!now) return null;
    var open = slotAt(now.iso, now.minutes);
    if (open) return open;
    var next = nextOpening();
    return next ? next.slot : null;
  }

  // The single exception to "validation never blocks": it withholds an OPTION,
  // never the order. Pickup at midday and delivery in the evening are both one
  // tap away, and the note under the buttons says which — nobody is left
  // guessing why the button is dim, and nobody can order a driver we cannot
  // send. Promising a lunchtime delivery we then have to cancel by phone costs
  // far more than a clearly labelled disabled button.
  function deliveryBlocked() {
    var slot = targetSlot();
    return !!(slot && slot.kind === 'lunch' && slot.pickupOnly);
  }

  function fill(template, values) {
    return String(template).replace(/\{(\w+)\}/g, function (whole, key) {
      return values[key] !== undefined ? values[key] : whole;
    });
  }

  // Structured pick-a-time control. Native date/time inputs give every phone
  // its own familiar picker for free — no library, and no free-text "asap-ish"
  // strings that have to be deciphered in the chat.
  function whenHtml() {
    var L = t();
    var now = berlinNow();
    var scheduled = form.when === 'scheduled';
    return '<fieldset class="cart-when">' +
      '<legend class="cart-label">' + L.when + '</legend>' +
      '<div class="cart-types">' +
        '<button type="button" class="cart-type' + (scheduled ? '' : ' active') +
          '" data-when="asap">' + L.asap + '</button>' +
        '<button type="button" class="cart-type' + (scheduled ? ' active' : '') +
          '" data-when="scheduled">' + L.scheduled + '</button>' +
      '</div>' +
      '<div class="cart-when-fields" id="fWhenFields"' + (scheduled ? '' : ' hidden') + '>' +
        '<label class="cart-field"><span class="cart-label">' + L.dateLabel + '</span>' +
          '<input id="fDate" type="date"' + (now ? ' min="' + now.iso + '"' : '') + '></label>' +
        '<label class="cart-field"><span class="cart-label">' + L.timeLabel + '</span>' +
          '<input id="fTime" type="time" step="300"></label>' +
      '</div>' +
      '<div class="cart-zone" id="cartWhenHint"></div>' +
      '</fieldset>';
  }

  // Everything wrong with the chosen moment, in the guest's language. Advisory.
  function whenWarnings() {
    var L = t();
    var out = [];
    var now = berlinNow();
    if (!now) return out;

    if (form.when !== 'scheduled') {
      if (!isOpenNow()) {
        var next = nextOpening();
        out.push({ kind: 'closed', text: fill(L.warnClosedAsap, { next: next ? next.label : '—' }) });
      }
      return out;
    }

    var iso = draft.fDate, time = draft.fTime;
    if (!iso || !time) return out;

    var minutes = hhmm(time);
    var target = stamp(iso, minutes);
    var current = stamp(now.iso, now.minutes);

    if (target < current) {
      out.push({ kind: 'past', text: L.warnPastTime });
      return out;
    }
    if (!openAt(iso, minutes)) {
      // A lunch time picked before the service starts is not "we are closed";
      // the guest has seen it advertised, so name the day it begins instead.
      out.push({ kind: 'hours', text: pendingLunchAt(iso, minutes)
        ? fill(L.warnLunchSoon, {
            date: firstLunchDate() ? longDate(firstLunchDate()) : lunchStartsOn(),
            evening: eveningStart() || '18:00'
          })
        : L.warnOutsideHours });
    }
    var lead = (CFG.business && CFG.business.leadTimeHours) || 0;
    if (form.business && lead && target - current < lead * 60) {
      out.push({ kind: 'lead', text: fill(L.warnLeadTime, { h: lead }) });
    }
    return out;
  }

  function paintWhen() {
    var host = document.getElementById('cartWhenHint');
    if (!host) return;
    var warnings = whenWarnings();
    host.className = 'cart-zone' + (warnings.length ? ' is-below-min' : '');
    host.textContent = warnings.map(function (w) { return w.text; }).join(' ');
  }

  // Human-readable version of the chosen moment, for the WhatsApp message.
  function whenText() {
    var L = t();
    if (form.when !== 'scheduled' || !draft.fDate || !draft.fTime) return L.asap;
    var p = String(draft.fDate).split('-');
    return p[2] + '.' + p[1] + '.' + p[0] + ', ' + draft.fTime;
  }

  function sumsHtml(sums) {
    var L = t();
    return '<div class="cart-sum"><span>' + L.subtotal + '</span><span>' + money(sums.subtotal) + '</span></div>' +
      (sums.discount > 0
        ? '<div class="cart-sum is-discount"><span>' + L.discount + ' −' + sums.discountPercent +
          ' %</span><span>−' + money(sums.discount) + '</span></div>'
        : '') +
      (form.type === 'delivery' && sums.zone
        ? '<div class="cart-sum"><span>' + L.deliveryFee + '</span><span>' + money(sums.fee) + '</span></div>'
        : '') +
      '<div class="cart-sum is-total"><span>' + L.total + '</span><span>' + money(sums.total) + '</span></div>';
  }

  // Live feedback while the postcode is typed. Never disables the send button:
  // the guest is informed, the restaurant decides.
  // True once a full postcode has been typed that we do not deliver to. The
  // whole flow then relabels itself as an enquiry, so nobody can believe they
  // placed an order we never agreed to.
  function isOutsideArea() {
    if (form.type !== 'delivery') return false;
    var typed = String(draft.fPlz || '').replace(/\D/g, '');
    return typed.length === 5 && !zoneFor(typed);
  }

  function paintSendButton() {
    var btn = document.getElementById('cartSend');
    if (!btn) return;
    var outside = isOutsideArea();
    btn.textContent = outside ? t().sendRequest : t().send;
    btn.classList.toggle('is-request', outside);
  }

  function paintZone() {
    var host = document.getElementById('cartZoneHint');
    paintSendButton();
    if (!host) return;
    var L = t();
    var sums = totals();
    var zone = sums.zone;
    var typed = String(draft.fPlz || '').replace(/\D/g, '');

    if (typed.length < 5) { host.className = 'cart-zone'; host.textContent = ''; return; }

    if (!zone) {
      host.className = 'cart-zone is-unknown';
      host.textContent = L.zoneUnknown;
      return;
    }

    // Deliberately says nothing about free delivery: that benefit is a
    // business-catering term and is advertised only in the Firmen section.
    var parts = [];
    parts.push(sums.fee > 0
      ? fill(L.zoneFee, { city: zone.city, fee: money(sums.fee) })
      : fill(L.zoneOk, { city: zone.city }));

    if (sums.subtotal < zone.minOrder) {
      parts.push(fill(L.zoneBelowMin, {
        missing: money(zone.minOrder - sums.subtotal), city: zone.city, min: zone.minOrder
      }));
      host.className = 'cart-zone is-below-min';
    } else {
      host.className = 'cart-zone is-ok';
    }
    host.textContent = parts.join(' ');
  }

  function paintSums() {
    var box = document.getElementById('cartSums');
    if (box) box.innerHTML = sumsHtml(totals());
    paintZone();
  }

  // A form still saying "delivery" while delivery is impossible would put the
  // wrong word in the WhatsApp message and a delivery fee in the total, so the
  // choice is corrected in one place, before anything is calculated from it.
  function syncType() {
    if (form.type === 'delivery' && deliveryBlocked()) form.type = 'pickup';
  }

  function typesHtml() {
    var L = t();
    syncType();
    var blocked = deliveryBlocked();

    return '<div class="cart-types" role="group" aria-label="' + L.type + '">' +
      '<button type="button" class="cart-type' +
        (form.type === 'delivery' ? ' active' : '') + (blocked ? ' is-off' : '') + '"' +
        (blocked ? ' disabled aria-describedby="cartTypeNote"' : '') +
        ' data-type="delivery">' + L.delivery + '</button>' +
      '<button type="button" class="cart-type' + (form.type === 'pickup' ? ' active' : '') +
        '" data-type="pickup">' + L.pickup + '</button>' +
      '</div>' +
      '<p class="cart-note is-pickup-only" id="cartTypeNote"' + (blocked ? '' : ' hidden') + '>' +
        (blocked ? escapeHtml(fill(L.cartLunchPickup, {
          windows: lunchWindows(), evening: eveningStart() || '18:00'
        })) : '') +
      '</p>' +
      payHtml();
  }

  /* --- paying -------------------------------------------------------------
     The choice is made in the basket, not after it: "can I pay by card?"
     decides whether a guest orders at all, and the answer has to travel with
     the order so the kitchen knows whether to expect a PayPal payment, get the
     terminal ready, or send the driver out for cash.

     PayPal is a link to paypal.com carrying the exact amount — no card data,
     no third-party script and no cookie ever touches this site, which is what
     keeps the strict CSP and the consent-free privacy policy intact. What it
     cannot do is tell the page whether the money arrived: the amount in a
     PayPal.Me link is editable by the payer, so the total received must be
     checked in the PayPal app against the WhatsApp order before the food goes
     out. That check is the reason the confirmation screen calls the payment
     optional rather than final.
  ------------------------------------------------------------------------- */

  // There are exactly two decisions a guest can make on this website: pay now,
  // online, or pay when they get the food. Card and girocard are NOT on this
  // list — they are what the terminal in the shop accepts, not something this
  // page can offer, so they are stated as information under the buttons. A
  // button for a method the website cannot process would be a promise made by
  // the wrong party.
  function payChoosable() {
    return !!paypalHandle();
  }

  // Only 'paypal' is ever stored; anything else means "in person".
  function syncPay() {
    if (form.pay === 'paypal' && !paypalHandle()) form.pay = 'onsite';
  }

  function payChosenText() {
    var L = t();
    if (form.pay === 'paypal') {
      return fill(L.payOnlineHint, { total: money(totals().total) });
    }
    return payOnSiteText(form.type);
  }

  function payHtml() {
    var L = t();
    syncPay();

    // Without PayPal there is no choice to make, only a fact to state.
    if (!payChoosable()) {
      return '<p class="cart-pay">' + escapeHtml(payOnSiteText(form.type)) + '</p>';
    }

    return '<fieldset class="cart-pay-pick">' +
      '<legend class="cart-label">' + L.payMethod + '</legend>' +
      '<div class="cart-types" role="group" aria-label="' + L.payMethod + '">' +
        '<button type="button" class="cart-type' + (form.pay === 'paypal' ? ' active' : '') +
          '" data-pay="paypal">' + L.payOptionOnline + '</button>' +
        '<button type="button" class="cart-type' + (form.pay === 'paypal' ? '' : ' active') +
          '" data-pay="onsite">' + L.payOptionOnSite + '</button>' +
      '</div>' +
      '<p class="cart-pay">' + escapeHtml(payChosenText()) + '</p>' +
      '</fieldset>';
  }

  // Repaints only the delivery/pickup control. The chosen time turns delivery
  // on and off, and a full repaint while the guest is inside the time picker
  // would take the focus with it.
  function paintTypes() {
    var box = document.getElementById('cartTypeBox');
    if (!box) return;
    box.innerHTML = typesHtml();
    var addr = document.getElementById('fAddressWrap');
    if (addr) addr.hidden = form.type !== 'delivery';
    paintSums();
  }

  function paintPanel() {
    if (!els.body || els.panel.hidden) return;
    var L = t();
    els.heading.textContent = L.cart;

    var ids = Object.keys(cart);
    if (!ids.length) {
      els.body.innerHTML = '<div class="cart-empty"><span class="cart-empty-icon">' +
        CART_ICON + '</span><p>' + L.cartEmpty + '</p><p class="cart-empty-hint">' +
        L.cartEmptyHint + '</p></div>';
      return;
    }

    syncType();
    var sums = totals();
    var lines = ids.map(function (id) {
      return '<li class="cart-line">' +
        '<span class="cart-line-name">' + escapeHtml(itemName(id)) + '</span>' +
        '<span class="qty has-qty cart-line-qty">' +
          '<button type="button" class="qty-btn" data-act="dec" data-id="' + id + '" aria-label="−">−</button>' +
          '<span class="qty-num">' + cart[id] + '</span>' +
          '<button type="button" class="qty-btn" data-act="inc" data-id="' + id + '" aria-label="+">+</button>' +
        '</span>' +
        '<span class="cart-line-price">' + money(items[id].price * cart[id]) + '</span>' +
        '</li>';
    }).join('');

    var leadNote = (CFG.business && CFG.business.enabled)
      ? '<p class="cart-note" id="cartLeadNote"' + (form.business ? '' : ' hidden') + '>' +
        L.leadTime.replace('{h}', CFG.business.leadTimeHours) + '</p>'
      : '';

    els.body.innerHTML =
      (isOpenNow() ? '' : '<p class="cart-note is-closed">' + L.closedNote + '</p>') +
      '<ul class="cart-lines">' + lines + '</ul>' +
      '<div class="cart-sums" id="cartSums">' + sumsHtml(sums) + '</div>' +
      '<div id="cartTypeBox">' + typesHtml() + '</div>' +
      '<form class="cart-form" id="cartForm" novalidate>' +
        field('fName', L.name, 'text', '', true) +
        field('fPhone', L.phone, 'tel', '', true) +
        '<div id="fAddressWrap"' + (form.type === 'delivery' ? '' : ' hidden') + '>' +
          field('fAddress', L.address, 'text', L.addressPh, true) +
          field('fPlz', L.postcode, 'text', L.postcodePh, true) +
          '<div class="cart-zone" id="cartZoneHint"></div>' +
        '</div>' +
        whenHtml() +
        (CFG.business && CFG.business.enabled
          ? '<label class="cart-check"><input type="checkbox" id="fBusiness"' +
            (form.business ? ' checked' : '') + '><span>' + L.isBusiness + '</span></label>' +
            '<div id="fCompanyWrap"' + (form.business ? '' : ' hidden') + '>' +
              field('fCompany', L.company, 'text', '', false) + '</div>'
          : '') +
        field('fNotes', L.notes, 'textarea', L.notesPh, false) +
        leadNote +
        '<button type="submit" class="cart-send" id="cartSend">' + L.send + '</button>' +
        '<p class="cart-privacy">' + L.privacy + '</p>' +
      '</form>';

    restoreForm();
    paintZone();
  }

  // Repainting the panel (language switch, quantity change) rebuilds its DOM,
  // so anything the guest already typed has to be carried across.
  var draft = {};
  var DRAFT_FIELDS = ['fName', 'fPhone', 'fAddress', 'fPlz', 'fDate', 'fTime', 'fCompany', 'fNotes'];
  function rememberForm() {
    DRAFT_FIELDS.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) draft[id] = el.value;
    });
  }
  function restoreForm() {
    Object.keys(draft).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.value = draft[id];
    });
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  // The count and the total are the only text in the button, and neither says
  // what pressing it does — so the accessible name has to.
  function paint() {
    paintMenu();
    var n = count();
    if (els.fab) {
      var L = t();
      els.fab.hidden = n === 0;
      els.fabCount.textContent = n;
      els.fabTotal.textContent = money(totals().total);
      els.fab.setAttribute('aria-label', L.cartOpen + ' — ' + n + ' ' +
        (n === 1 ? L.itemsOne : L.itemsMany) + ', ' + money(totals().total));
    }
    // The panel stays open when the last line is removed — it shows the empty
    // state, which is clearer than the drawer vanishing under the guest.
    if (els.panel && !els.panel.hidden) { rememberForm(); paintPanel(); }
  }

  /* --- how the guest pays -------------------------------------------------
     Two ways, and the site says both in every place it says either: online
     with PayPal while ordering, or in person on collection or delivery. Which
     methods exist in person comes from config.payment.onSite, so the FAQ, the
     basket, the confirmation screen and the methods Google indexes cannot
     drift apart — and cannot outlive a card terminal.
  ------------------------------------------------------------------------- */

  // PayPal needs a handle AND the switch: either one missing and no PayPal
  // word, link or paragraph appears anywhere.
  function paypalHandle() {
    var p = CFG.payment || {};
    if (!p.prepayOnline) return '';
    return String(p.paypalMe || '').replace(/^@/, '').trim();
  }

  function paypalLink(amount) {
    var handle = paypalHandle();
    if (!handle) return '';
    return 'https://www.paypal.com/paypalme/' + encodeURIComponent(handle) + '/' +
      amount.toFixed(2) + 'EUR';
  }

  function joinList(parts) {
    if (parts.length < 2) return parts.join('');
    return parts.slice(0, -1).join(', ') + ' ' + t().or + ' ' + parts[parts.length - 1];
  }

  function onSiteMethods(type) {
    var L = t();
    var keys = ((CFG.payment && CFG.payment.onSite) || {})[type] || [];
    return keys.map(function (key) { return L.pay[key]; }).filter(Boolean);
  }

  function payOnSiteText(type) {
    var L = t();
    var list = onSiteMethods(type);
    if (!list.length) return '';
    return fill(L.payOnSite, {
      type: type === 'pickup' ? L.atPickup : L.atDelivery,
      methods: joinList(list)
    });
  }

  // Both order types plus PayPal and the invoice, for schema.org. Only ever
  // what is actually on offer: a payment method Google shows and the shop does
  // not take is a wasted trip for the guest.
  function paymentAccepted() {
    var L = t();
    var seen = {};
    var out = [];
    ['pickup', 'delivery'].forEach(function (type) {
      onSiteMethods(type).forEach(function (label) {
        if (!seen[label]) { seen[label] = true; out.push(label); }
      });
    });
    if (paypalHandle()) out.push('PayPal');
    if (CFG.payment && CFG.payment.invoiceForBusiness) out.push(L.payInvoice);
    return out.join(', ');
  }

  function renderPaymentNote() {
    var text = [payOnSiteText('pickup'), payOnSiteText('delivery')];
    if (paypalHandle()) text.push(t().payOnline);
    [].forEach.call(document.querySelectorAll('.payment-note'), function (el) {
      el.textContent = text.filter(Boolean).join(' ');
    });
  }

  /* --- WhatsApp handover -------------------------------------------------- */

  function buildMessage(data) {
    var L = t();
    var sums = totals();
    var outside = isOutsideArea();
    var out = ['*' + (outside ? L.msgTitleRequest : L.msgTitle) + '*'];

    if (data.business) out.push('*' + L.msgBusiness + '*');
    out.push('');

    Object.keys(cart).forEach(function (id) {
      out.push(cart[id] + '× ' + itemName(id) + ' — ' + money(items[id].price * cart[id]));
    });

    out.push('');
    out.push(L.mSubtotal + ': ' + money(sums.subtotal));
    if (sums.discount > 0) {
      out.push(L.mDiscount + ' ' + sums.discountPercent + ' %: −' + money(sums.discount));
    }
    if (data.type === 'delivery' && sums.zone) {
      out.push(L.deliveryFee + ': ' + (sums.fee > 0 ? money(sums.fee) : money(0)));
    }
    out.push('*' + L.mTotal + ': ' + money(sums.total) + '*');
    out.push('');
    out.push(L.mType + ': ' + (data.type === 'delivery' ? L.delivery : L.pickup));
    // Whoever answers the chat has to know whether to watch for a PayPal
    // payment, take the terminal to the counter or send the driver for cash.
    out.push(L.mPayment + ': ' + (data.pay === 'paypal'
      ? L.mPayOnline
      : fill(L.mPayOnSite, {
          methods: joinList(onSiteMethods(data.type)),
          type: data.type === 'pickup' ? L.atPickup : L.atDelivery
        })));
    out.push(L.mName + ': ' + data.name);
    out.push(L.mPhone + ': ' + data.phone);
    if (data.type === 'delivery') {
      out.push(L.mAddress + ': ' + data.address + ', ' + data.plz +
        (sums.zone ? ' ' + sums.zone.city : ''));

      // Flags the restaurant acts on. Neither one blocked the guest.
      if (!sums.zone) out.push('⚠ ' + L.mOutsideArea);
      else if (sums.subtotal < sums.zone.minOrder) {
        out.push('⚠ ' + fill(L.mUnderMin, { min: sums.zone.minOrder }));
      }
    }
    out.push(L.mTime + ': ' + data.time);
    if (data.company) out.push(L.mCompany + ': ' + data.company);
    if (data.notes) out.push(L.mNotes + ': ' + data.notes);
    if (data.business && CFG.business) {
      out.push(L.mLead + ': ≥ ' + CFG.business.leadTimeHours + ' ' + L.mHours);
    }

    // Anything the guest was warned about is repeated here, so the same facts
    // reach whoever answers the chat.
    whenWarnings().forEach(function (warning) {
      if (warning.kind === 'hours' || warning.kind === 'past') out.push('⚠ ' + L.mCheckTime);
      if (warning.kind === 'lead') {
        out.push('⚠ ' + fill(L.mCheckLead, { h: CFG.business.leadTimeHours }));
      }
    });
    if (!isOpenNow()) out.push('⚠ ' + L.mPreorder);

    return out.join('\n');
  }

  function submitOrder(e) {
    e.preventDefault();
    var L = t();
    syncType();
    syncPay();
    var data = {
      type: form.type,
      pay: form.pay,
      business: !!document.getElementById('fBusiness') && document.getElementById('fBusiness').checked,
      name: val('fName'), phone: val('fPhone'), address: val('fAddress'),
      plz: val('fPlz'), time: whenText(), company: val('fCompany'), notes: val('fNotes')
    };

    var required = ['fName', 'fPhone'];
    if (data.type === 'delivery') required.push('fAddress', 'fPlz');
    var bad = null;
    required.forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      var empty = !el.value.trim();
      el.classList.toggle('is-invalid', empty);
      if (empty && !bad) bad = el;
    });
    if (bad) { bad.focus(); return; }

    var total = totals().total;
    var outside = isOutsideArea();
    var url = 'https://wa.me/' + CFG.whatsapp.number + '?text=' + encodeURIComponent(buildMessage(data));
    window.open(url, '_blank', 'noopener');

    // Only the guest who chose to pay online gets a payment button, and only
    // once there is something to pay for: nothing is payable until we have
    // accepted an out-of-area enquiry, so that path never shows it.
    var pay = (outside || data.pay !== 'paypal') ? '' : paypalLink(total);
    els.body.innerHTML =
      '<div class="cart-sent' + (outside ? ' is-request' : '') + '">' +
        '<div class="cart-sent-mark" aria-hidden="true">' + (outside ? '!' : '✓') + '</div>' +
        '<h3>' + (outside ? L.sentTitleRequest : L.sentTitle) + '</h3>' +
        '<p>' + (outside ? L.sentTextRequest : L.sentText) + '</p>' +
        (pay
          ? '<a class="cart-paypal" href="' + pay + '" target="_blank" rel="noopener">' + L.payNow +
            ' · ' + money(total) + '</a><p class="cart-empty-hint">' + L.payHint + ' ' +
            escapeHtml(payOnSiteText(data.type)) + '</p>'
          // An out-of-area enquiry has no agreed price yet, so it says nothing
          // about paying; everyone else is reminded how they chose to.
          : (outside ? '' : '<p class="cart-empty-hint">' + escapeHtml(payChosenText()) + '</p>')) +
        '<button type="button" class="cart-reset" id="cartReset">' + L.newOrder + '</button>' +
      '</div>';

    cart = {};
    draft = {};
    saveCart();
    paintMenu();
    if (els.fab) els.fab.hidden = true;

    var reset = document.getElementById('cartReset');
    if (reset) reset.addEventListener('click', closePanel);
  }

  function val(id) {
    var el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  /* --- events ------------------------------------------------------------- */

  function wireEvents() {
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-act]');
      if (btn) {
        var id = btn.getAttribute('data-id');
        if (!items[id]) return;
        setQty(id, (cart[id] || 0) + (btn.getAttribute('data-act') === 'inc' ? 1 : -1));
        return;
      }
      var type = e.target.closest('[data-type]');
      if (type) {
        form.type = type.getAttribute('data-type');
        rememberForm();
        paintPanel();
        return;
      }

      var pay = e.target.closest('[data-pay]');
      if (pay) {
        form.pay = pay.getAttribute('data-pay');
        rememberForm();
        paintPanel();
        return;
      }

      var when = e.target.closest('[data-when]');
      if (when) {
        form.when = when.getAttribute('data-when');
        rememberForm();
        paintPanel();
      }
    });

    document.addEventListener('change', function (e) {
      if (e.target.id === 'fBusiness') {
        form.business = e.target.checked;
        var wrap = document.getElementById('fCompanyWrap');
        var note = document.getElementById('cartLeadNote');
        if (wrap) wrap.hidden = !form.business;
        if (note) note.hidden = !form.business;
        // Ticking the box can waive the delivery fee, so the total moves.
        paintSums();
      }
    });

    document.addEventListener('submit', function (e) {
      if (e.target.id === 'cartForm') submitOrder(e);
    });

    document.addEventListener('input', function (e) {
      if (!e.target.id || DRAFT_FIELDS.indexOf(e.target.id) === -1) return;
      draft[e.target.id] = e.target.value;
      if (e.target.classList.contains('is-invalid') && e.target.value.trim()) {
        e.target.classList.remove('is-invalid');
      }
      // The postcode changes the fee and therefore the total, so the summary
      // is repainted in place — a full repaint would steal the caret.
      if (e.target.id === 'fPlz') paintSums();
      // A new time can move the order into or out of the collection-only lunch
      // window, so the delivery/pickup control is repainted with the hint.
      if (e.target.id === 'fDate' || e.target.id === 'fTime') { paintWhen(); paintTypes(); }
    });

    // Deep link used by the business section and the "order now" buttons.
    document.addEventListener('click', function (e) {
      var open = e.target.closest('[data-open-cart]');
      if (open) { e.preventDefault(); openPanel(); }
    });
  }

  /* =========================================================================
     Config-driven page content
     ========================================================================= */

  function applyConfig() {
    var b = CFG.business || {};

    // Sections that config can switch off entirely.
    if (!b.enabled) {
      [].forEach.call(document.querySelectorAll('[data-requires="business"]'), function (el) {
        el.hidden = true;
      });
    }

    // Numbers written once in config, shown in many places.
    var values = {
      freeDeliveryFrom: b.freeDeliveryFrom,
      leadTimeHours: b.leadTimeHours,
      discount: CFG.order.directDiscountPercent,
      businessPickupDiscount: CFG.order.businessPickupDiscountPercent,
      // Empty while lunch delivers or has not started, so copy that promises
      // delivery can carry the midday exception without ever inventing one.
      // Filled here rather than left to the pass below: a value substituted
      // into copy is not rescanned for placeholders of its own.
      lunchClause: (lunchRunning() && !lunchDelivers())
        ? fill(t().lunchClause, { evening: eveningStart() || '18:00' })
        : ''
    };

    [].forEach.call(document.querySelectorAll('[data-cfg]'), function (el) {
      var value = values[el.getAttribute('data-cfg')];
      if (value !== undefined && value !== null) el.textContent = value;
    });

    // Translated copy carries {placeholders} instead of literal numbers, so a
    // changed threshold updates the German and the English wording at once.
    // The markup keeps the current numbers as its no-JavaScript fallback.
    [].forEach.call(document.querySelectorAll('.t[data-de]'), function (el) {
      var tpl = el.getAttribute('data-' + lang());
      if (!tpl || tpl.indexOf('{') === -1) return;
      el.textContent = tpl.replace(/\{(\w+)\}/g, function (whole, key) {
        return values[key] !== undefined && values[key] !== null ? values[key] : whole;
      });
    });

    renderLunchNotice();
    renderPaymentNote();
    renderBusinessHours();
    renderAreas();
    renderFaqHours();
    updateFaqSchema();

    // Corporate enquiry links carry a prefilled, structured template.
    [].forEach.call(document.querySelectorAll('[data-wa-template]'), function (el) {
      el.setAttribute('href', 'https://wa.me/' + CFG.whatsapp.number + '?text=' +
        encodeURIComponent(businessTemplate(el.getAttribute('data-wa-template'))));
    });

    // PayPal is only advertised once a handle exists and the switch is on.
    var hasPaypal = !!paypalHandle();
    [].forEach.call(document.querySelectorAll('[data-requires="paypal"]'), function (el) {
      el.hidden = !hasPaypal;
    });

    if (!CFG.order.cartEnabled) {
      document.body.classList.add('no-cart');
    }
  }

  // Consecutive days sharing a window collapse into "Mo – Fr 11:30 – 14:30".
  function groupWindows(pick) {
    var short = { de: ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'], en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] }[lang()];
    var runs = [];
    DAY_KEYS.forEach(function (key, i) {
      var day = (CFG.hours.days || {})[key];
      var win = (!day || day.closed) ? null : pick(day);
      var text = win ? win[0] + ' – ' + win[1] : null;
      var last = runs[runs.length - 1];
      if (last && last.text === text) last.to = i;
      else runs.push({ from: i, to: i, text: text });
    });
    return runs.filter(function (r) { return r.text; }).map(function (r) {
      return (r.from === r.to ? short[r.from] : short[r.from] + ' – ' + short[r.to]) + ' ' + r.text;
    });
  }

  /* --- what the page says about lunch -------------------------------------
     One sentence, built from config, printed everywhere lunch is mentioned:
     the corporate section, under the opening hours, in the delivery area and
     in the FAQ. Three places that each described the service in their own
     words is how a site ends up promising delivery in one paragraph and
     collection in the next.
  ------------------------------------------------------------------------- */

  function lunchWindows() {
    return groupWindows(function (d) { return d.lunch; }).join(' · ');
  }

  // The first day lunch actually happens: the start date, or the next day
  // after it that has a lunch window. Announcing "from Monday" when Monday is
  // one of our closed days is exactly the kind of small lie a guest notices.
  function firstLunchDate() {
    var starts = lunchStartsOn();
    if (!starts) return null;
    var p = starts.split('-');
    var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
    if (isNaN(d.getTime())) return null;
    for (var i = 0; i < 14; i++) {
      var day = (CFG.hours.days || {})[DAY_KEYS[(d.getUTCDay() + 6) % 7]];
      if (day && !day.closed && day.lunch) return d;
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return null;
  }

  // "Mittwoch, 5. August" / "Wednesday, 5 August" — formatted in UTC because
  // the date carries no time of day and must not shift across a timezone.
  function longDate(date) {
    try {
      return new Intl.DateTimeFormat(lang() === 'en' ? 'en-GB' : 'de-DE', {
        weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC'
      }).format(date);
    } catch (e) {
      return date.toISOString().slice(0, 10);
    }
  }

  function lunchNotice() {
    if (!lunchPublished()) return '';
    var L = t();
    var windows = lunchWindows();
    if (!windows) return '';
    var evening = eveningStart() || '18:00';
    var head = lunchRunning()
      ? fill(L.lunchNow, { windows: windows })
      : fill(L.lunchSoon, {
          windows: windows,
          date: firstLunchDate() ? longDate(firstLunchDate()) : lunchStartsOn()
        });
    return head + ' ' + (lunchDelivers()
      ? L.lunchWithDelivery
      : fill(L.lunchPickupOnly, { evening: evening }));
  }

  // `.lunch-note` carries the sentence; `[data-requires="lunch"]` is the
  // container that disappears entirely when there is nothing to say — an FAQ
  // entry with an empty answer would otherwise sit there looking broken, and
  // would be picked up by the FAQ structured data.
  function renderLunchNotice() {
    var text = lunchNotice();
    [].forEach.call(document.querySelectorAll('.lunch-note'), function (el) {
      el.textContent = text;
    });
    [].forEach.call(document.querySelectorAll('[data-requires="lunch"]'), function (el) {
      el.hidden = !text;
    });
  }

  // Visible delivery-area list. Same data as the basket, so a price change in
  // the spreadsheet updates the marketing copy and the checkout together.
  //
  // Grouped by minimum order rather than listed in one long table: the zones
  // already fall into natural price tiers, a reader only cares which tier they
  // are in, and it lets each town sit on one line instead of a three-column
  // grid breaking "Oberhausen-Rheinhausen" across three.
  //
  // The delivery fee is stated per town, not per tier, because it varies
  // inside a tier — three towns with the same €50 minimum are charged €3, €4
  // and €8. Publishing it here is the same figure the basket charges, from the
  // same row of the spreadsheet, so the page cannot promise one price and
  // invoice another.
  function renderAreas() {
    var host = document.getElementById('areasList');
    if (!host) return;
    var rows = (CFG.delivery && CFG.delivery.zones) || [];
    if (!rows.length) { host.innerHTML = ''; return; }

    var en = lang() === 'en';
    var tiers = [];
    var byMin = {};

    rows.forEach(function (row) {
      var min = row[3];
      if (!byMin[min]) { byMin[min] = []; tiers.push(min); }
      byMin[min].push(row);
    });
    tiers.sort(function (a, b) { return a - b; });

    host.innerHTML = tiers.map(function (min) {
      var towns = byMin[min].slice().sort(function (a, b) {
        return String(a[1]).localeCompare(String(b[1]), 'de');
      }).map(function (row) {
        var fee = Number(row[4]) || 0;
        return '<li class="area">' +
          '<span class="area-city">' + escapeHtml(row[1]) + '</span>' +
          '<span class="area-plz">' + escapeHtml(row[0]) + '</span>' +
          '<span class="area-fee' + (fee > 0 ? '' : ' is-free') + '">' +
            (fee > 0 ? money(fee) : (en ? 'free' : 'frei')) +
          '</span>' +
          '</li>';
      }).join('');

      return '<div class="area-tier">' +
        '<h3 class="area-tier-title">' +
          (en ? 'Minimum order €' + min : 'Mindestbestellwert ' + min + ' €') +
        '</h3>' +
        '<ul class="area-towns">' + towns + '</ul>' +
        '</div>';
    }).join('');
  }

  // The opening-hours answer is written from config, never typed by hand, so
  // it can never contradict the table above it.
  function renderFaqHours() {
    var host = document.querySelector('.faq-hours');
    if (!host) return;
    var L = t();
    var en = lang() === 'en';

    var labelled = lunchRunning();
    var lines = DAY_KEYS.map(function (key) {
      var slots = slotsFor(key);
      return L.days[key] + ': ' + (slots.length
        ? slots.map(function (s) {
            return (labelled ? L[s.kind] + ' ' : '') + s.from + '–' + s.to +
              (s.pickupOnly ? ' (' + L.pickupOnly + ')' : '');
          }).join(', ')
        : L.closed);
    });

    host.textContent = (en
      ? 'Our current opening hours are: '
      : 'Unsere aktuellen Öffnungszeiten: ') + lines.join(' · ') + '. ' +
      (lunchNotice() ? lunchNotice() + ' ' : '') + (en
      ? 'The live status at the top of the contact section always shows whether we are open right now. Orders placed outside these hours reach us as a pre-order for a time you choose.'
      : 'Der Status im Kontaktbereich zeigt jederzeit an, ob wir gerade geöffnet haben. Bestellungen außerhalb dieser Zeiten erreichen uns als Vorbestellung für Ihren Wunschtermin.');
  }

  // FAQPage built from the rendered <details>, so an edited answer updates the
  // structured data automatically and the two can never disagree.
  function buildFaqSchema() {
    var items = document.querySelectorAll('#faq .faq-item');
    if (!items.length) return null;
    var entities = [];
    [].forEach.call(items, function (item) {
      if (item.hidden) return;
      var q = item.querySelector('summary');
      var a = item.querySelector('.faq-answer');
      if (!q || !a) return;
      var answer = a.textContent.replace(/\s+/g, ' ').trim();
      if (!answer) return;
      entities.push({
        '@type': 'Question',
        name: q.textContent.replace(/\s+/g, ' ').trim(),
        acceptedAnswer: { '@type': 'Answer', text: answer }
      });
    });
    if (!entities.length) return null;
    return { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: entities };
  }

  function updateFaqSchema() {
    var node = document.getElementById('faqSchema');
    if (!node) return;
    var data = buildFaqSchema();
    node.textContent = data ? JSON.stringify(data, null, 2) : '';
  }

  // The lunch windows themselves are stated by the notice at the top of the
  // section, so this line only adds what the notice does not: that anything
  // outside those windows is still possible, by arrangement.
  function renderBusinessHours() {
    var host = document.getElementById('businessHours');
    if (!host) return;
    var L = t();
    host.textContent = lunchNotice() ? L.lunchByArrangement : L.businessByArrangement;
  }

  // The template asks for what actually decides the order — budget and time —
  // and no longer for a head count, which told us nothing we could cook from.
  function businessTemplate(kind) {
    if (lang() === 'en') {
      return kind === 'business'
        ? 'Hello KAIRO 1980, I would like a quote for a corporate order.\n\n' +
          'Company: \nApprox. order value: \nDate & time it is needed: \n' +
          'Delivery or pickup: \nDelivery address: \nNotes (allergies, etc.): '
        : "Hello KAIRO 1980! I'd like to place an order.";
    }
    return kind === 'business'
      ? 'Hallo KAIRO 1980, ich möchte ein Angebot für eine Firmenbestellung.\n\n' +
        'Firma: \nUngefährer Bestellwert: \nDatum & Uhrzeit: \n' +
        'Lieferung oder Abholung: \nLieferadresse: \nAnmerkung (Allergien o. Ä.): '
      : 'Hallo KAIRO 1980! Ich möchte gerne bestellen.';
  }

  /* =========================================================================
     Boot
     ========================================================================= */

  function init() {
    applyConfig();
    renderHours();

    if (CFG.order.cartEnabled) {
      collectItems();
      loadCart();
      buildPanel();
      wireEvents();
      paint();
    }

    // Language switch repaints everything that carries generated text.
    document.addEventListener('kairo:lang', function () {
      renderHours();
      applyConfig();
      if (CFG.order.cartEnabled) paint();
    });

    // Keep "open now" honest on a tab left open across closing time.
    setInterval(function () { renderStatus(berlinNow()); }, 60000);
  }

  // Registered at module level, not inside init(): app.js fetches reviews.json
  // and a cached response could resolve before DOMContentLoaded, which would
  // lose the rating. aggregateRating is only ever emitted for figures actually
  // rendered on the page — inventing them is a structured-data violation.
  document.addEventListener('kairo:reviews', function (e) {
    var detail = e.detail || {};
    if (!detail.rating || !detail.total) return;
    schemaRating = { value: detail.rating, count: detail.total };
    updateSchemaHours();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
