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

  var STORAGE_KEY = 'kairo.cart.v1';
  var DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  var SCHEMA_DAY = {
    mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday',
    fri: 'Friday', sat: 'Saturday', sun: 'Sunday'
  };

  var T = {
    de: {
      days: { mon: 'Montag', tue: 'Dienstag', wed: 'Mittwoch', thu: 'Donnerstag', fri: 'Freitag', sat: 'Samstag', sun: 'Sonntag' },
      lunch: 'Mittag', evening: 'Abend', closed: 'Geschlossen',
      openNow: 'Jetzt geöffnet', closedNow: 'Zurzeit geschlossen',
      until: 'bis', opensAgain: 'öffnet wieder',
      today: 'Heute',
      add: 'Hinzufügen', remove: 'Entfernen',
      cart: 'Bestellung', cartEmpty: 'Ihr Warenkorb ist noch leer.',
      cartEmptyHint: 'Tippen Sie in der Speisekarte auf „+", um Gerichte hinzuzufügen.',
      subtotal: 'Zwischensumme', discount: 'Direktbestellung', total: 'Gesamt',
      type: 'Lieferung oder Abholung', delivery: 'Lieferung', pickup: 'Abholung',
      name: 'Name', phone: 'Telefon', address: 'Straße & Hausnummer',
      addressPh: 'z. B. Rostocker Straße 20a',
      postcode: 'Postleitzahl', postcodePh: '68766',
      deliveryFee: 'Lieferung', deliveryFree: 'inklusive',
      zoneOk: 'Wir liefern nach {city}.',
      zoneFee: 'Lieferung nach {city}: {fee}.',
      zoneFreeAt: 'Ab {n} € liefern wir kostenfrei.',
      zoneMin: 'Mindestbestellwert in {city}: {min} €.',
      zoneBelowMin: 'Noch {missing} bis zum Mindestbestellwert in {city} ({min} €).',
      zoneUnknown: 'Diese Postleitzahl liegt außerhalb unseres Liefergebiets. Sie können uns trotzdem eine unverbindliche Anfrage senden — das ist noch keine Bestellung. Wir prüfen, ob wir zu Ihnen liefern können, und antworten direkt im Chat.',
      time: 'Wunschzeit', timePh: 'z. B. 19:30 oder „so schnell wie möglich"',
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
      payNow: 'Jetzt per PayPal bezahlen', payHint: 'Optional — Sie können auch bei Lieferung bezahlen.',
      newOrder: 'Neue Bestellung', close: 'Schließen',
      msgTitle: 'Neue Bestellung über kairo1980.de',
      msgBusiness: 'FIRMENBESTELLUNG',
      mLead: 'Vorlauf', mHours: 'Std.',
      mType: 'Art', mName: 'Name', mPhone: 'Telefon', mAddress: 'Adresse',
      mTime: 'Wunschzeit', mNotes: 'Anmerkung', mCompany: 'Firma',
      mSubtotal: 'Zwischensumme', mDiscount: 'Rabatt', mTotal: 'Gesamt', mPaypal: 'PayPal',
      mOutsideArea: 'PLZ ausserhalb des Liefergebiets — Anfrage zur Prüfung',
      mUnderMin: 'Unter dem Mindestbestellwert ({min} €)'
    },
    en: {
      days: { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' },
      lunch: 'Lunch', evening: 'Evening', closed: 'Closed',
      openNow: 'Open now', closedNow: 'Currently closed',
      until: 'until', opensAgain: 'opens again',
      today: 'Today',
      add: 'Add', remove: 'Remove',
      cart: 'Your order', cartEmpty: 'Your basket is still empty.',
      cartEmptyHint: 'Tap "+" next to a dish in the menu to add it.',
      subtotal: 'Subtotal', discount: 'Direct order', total: 'Total',
      type: 'Delivery or pickup', delivery: 'Delivery', pickup: 'Pickup',
      name: 'Name', phone: 'Phone', address: 'Street & number',
      addressPh: 'e.g. Rostocker Straße 20a',
      postcode: 'Postcode', postcodePh: '68766',
      deliveryFee: 'Delivery', deliveryFree: 'included',
      zoneOk: 'We deliver to {city}.',
      zoneFee: 'Delivery to {city}: {fee}.',
      zoneFreeAt: 'Free delivery from €{n}.',
      zoneMin: 'Minimum order in {city}: €{min}.',
      zoneBelowMin: '{missing} to go until the minimum order in {city} (€{min}).',
      zoneUnknown: 'This postcode is outside our delivery area. You can still send us a non-binding enquiry — this is not an order yet. We will check whether we can deliver to you and reply in the chat.',
      time: 'Preferred time', timePh: 'e.g. 7:30 pm or "as soon as possible"',
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
      payNow: 'Pay now with PayPal', payHint: 'Optional — you can also pay on delivery.',
      newOrder: 'New order', close: 'Close',
      msgTitle: 'New order via kairo1980.de',
      msgBusiness: 'CORPORATE ORDER',
      mLead: 'Lead time', mHours: 'hrs',
      mType: 'Type', mName: 'Name', mPhone: 'Phone', mAddress: 'Address',
      mTime: 'Preferred time', mNotes: 'Note', mCompany: 'Company',
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
        hour: '2-digit', minute: '2-digit', hour12: false
      }).formatToParts(new Date());
      var get = function (type) {
        var hit = parts.filter(function (p) { return p.type === type; })[0];
        return hit ? hit.value : '';
      };
      var map = { Mon: 'mon', Tue: 'tue', Wed: 'wed', Thu: 'thu', Fri: 'fri', Sat: 'sat', Sun: 'sun' };
      var day = map[get('weekday').slice(0, 3)];
      if (!day) return null;
      return { day: day, minutes: ((+get('hour')) % 24) * 60 + (+get('minute')) };
    } catch (e) {
      return null;
    }
  }

  // Every service window of one day, lunch first, honouring the master switch.
  function slotsFor(dayKey) {
    var day = (CFG.hours.days || {})[dayKey];
    if (!day || day.closed) return [];
    var out = [];
    if (CFG.hours.lunch && CFG.hours.lunch.enabled && day.lunch) {
      out.push({ kind: 'lunch', from: day.lunch[0], to: day.lunch[1] });
    }
    if (day.evening) {
      out.push({ kind: 'evening', from: day.evening[0], to: day.evening[1] });
    }
    return out;
  }

  function renderHours() {
    var host = document.getElementById('hoursTable');
    if (!host) return;

    var L = t();
    var now = berlinNow();
    var labelled = !!(CFG.hours.lunch && CFG.hours.lunch.enabled);
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

  // Keep schema.org in step with the table. Google renders this page, so the
  // rewritten JSON-LD is what gets indexed; the static block in the HTML stays
  // as a valid fallback for crawlers that do not execute scripts.
  function updateSchemaHours() {
    var node = document.querySelector('script[type="application/ld+json"]');
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
      if (!spec.length) return;
      data.openingHoursSpecification = spec;
      node.textContent = JSON.stringify(data, null, 2);
    } catch (e) { /* malformed JSON-LD — leave the original untouched */ }
  }

  /* =========================================================================
     Basket
     ========================================================================= */

  var items = {};   // id -> { el, price, node }
  var cart = {};    // id -> qty

  function loadCart() {
    try {
      var raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      Object.keys(raw).forEach(function (id) {
        var qty = parseInt(raw[id], 10);
        if (items[id] && qty > 0) cart[id] = Math.min(qty, 99);
      });
    } catch (e) { /* ignore corrupted storage */ }
  }

  function saveCart() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cart)); } catch (e) { /* private mode */ }
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
    var pct = CFG.order.directDiscountPercent || 0;
    var discount = Math.round(subtotal * pct) / 100;

    // Delivery is free from the corporate threshold upwards; below it the
    // zone's own fee applies. An unknown zone charges nothing here — the fee
    // is agreed in the chat instead of guessed by the page.
    var zone = form.type === 'delivery' ? zoneFor(draft.fPlz) : null;
    var threshold = (CFG.business && CFG.business.freeDeliveryFrom) || Infinity;
    var fee = (zone && subtotal < threshold) ? zone.fee : 0;

    return {
      subtotal: subtotal,
      discount: discount,
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

  var els = {};

  function buildPanel() {
    var wrap = document.createElement('div');
    wrap.innerHTML =
      '<button type="button" class="cart-fab" id="cartFab" hidden>' +
        '<span class="cart-fab-icon" aria-hidden="true">🛒</span>' +
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

    els.fab.addEventListener('click', function () { openPanel(); });
    els.backdrop.addEventListener('click', closePanel);
    document.getElementById('cartClose').addEventListener('click', closePanel);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !els.panel.hidden) closePanel();
    });
  }

  function openPanel() {
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

  var form = { type: 'delivery', business: false };

  function fill(template, values) {
    return String(template).replace(/\{(\w+)\}/g, function (whole, key) {
      return values[key] !== undefined ? values[key] : whole;
    });
  }

  function sumsHtml(sums) {
    var L = t();
    return '<div class="cart-sum"><span>' + L.subtotal + '</span><span>' + money(sums.subtotal) + '</span></div>' +
      (sums.discount > 0
        ? '<div class="cart-sum is-discount"><span>' + L.discount + ' −' + CFG.order.directDiscountPercent +
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

    var parts = [];
    parts.push(sums.fee > 0
      ? fill(L.zoneFee, { city: zone.city, fee: money(sums.fee) })
      : fill(L.zoneOk, { city: zone.city }));

    if (zone.fee > 0 && sums.subtotal < (CFG.business.freeDeliveryFrom || Infinity)) {
      parts.push(fill(L.zoneFreeAt, { n: CFG.business.freeDeliveryFrom }));
    }
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

  function paintPanel() {
    if (!els.body || els.panel.hidden) return;
    var L = t();
    els.heading.textContent = L.cart;

    var ids = Object.keys(cart);
    if (!ids.length) {
      els.body.innerHTML = '<div class="cart-empty"><p>' + L.cartEmpty + '</p><p class="cart-empty-hint">' +
        L.cartEmptyHint + '</p></div>';
      return;
    }

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
      '<ul class="cart-lines">' + lines + '</ul>' +
      '<div class="cart-sums" id="cartSums">' + sumsHtml(sums) + '</div>' +
      '<div class="cart-types" role="group" aria-label="' + L.type + '">' +
        '<button type="button" class="cart-type' + (form.type === 'delivery' ? ' active' : '') +
          '" data-type="delivery">' + L.delivery + '</button>' +
        '<button type="button" class="cart-type' + (form.type === 'pickup' ? ' active' : '') +
          '" data-type="pickup">' + L.pickup + '</button>' +
      '</div>' +
      '<form class="cart-form" id="cartForm" novalidate>' +
        field('fName', L.name, 'text', '', true) +
        field('fPhone', L.phone, 'tel', '', true) +
        '<div id="fAddressWrap"' + (form.type === 'delivery' ? '' : ' hidden') + '>' +
          field('fAddress', L.address, 'text', L.addressPh, true) +
          field('fPlz', L.postcode, 'text', L.postcodePh, true) +
          '<div class="cart-zone" id="cartZoneHint"></div>' +
        '</div>' +
        field('fTime', L.time, 'text', L.timePh, false) +
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
  var DRAFT_FIELDS = ['fName', 'fPhone', 'fAddress', 'fPlz', 'fTime', 'fCompany', 'fNotes'];
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

  function paint() {
    paintMenu();
    var n = count();
    if (els.fab) {
      els.fab.hidden = n === 0;
      els.fabCount.textContent = n;
      els.fabTotal.textContent = money(totals().total);
    }
    // The panel stays open when the last line is removed — it shows the empty
    // state, which is clearer than the drawer vanishing under the guest.
    if (els.panel && !els.panel.hidden) { rememberForm(); paintPanel(); }
  }

  /* --- WhatsApp handover -------------------------------------------------- */

  function paypalLink(amount) {
    var handle = (CFG.payment && CFG.payment.paypalMe || '').replace(/^@/, '').trim();
    if (!handle) return '';
    return 'https://www.paypal.com/paypalme/' + encodeURIComponent(handle) + '/' +
      amount.toFixed(2) + 'EUR';
  }

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
      out.push(L.mDiscount + ' ' + CFG.order.directDiscountPercent + ' %: −' + money(sums.discount));
    }
    if (data.type === 'delivery' && sums.zone) {
      out.push(L.deliveryFee + ': ' + (sums.fee > 0 ? money(sums.fee) : money(0)));
    }
    out.push('*' + L.mTotal + ': ' + money(sums.total) + '*');
    out.push('');
    out.push(L.mType + ': ' + (data.type === 'delivery' ? L.delivery : L.pickup));
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
    if (data.time) out.push(L.mTime + ': ' + data.time);
    if (data.company) out.push(L.mCompany + ': ' + data.company);
    if (data.notes) out.push(L.mNotes + ': ' + data.notes);
    if (data.business && CFG.business) {
      out.push(L.mLead + ': ≥ ' + CFG.business.leadTimeHours + ' ' + L.mHours);
    }

    return out.join('\n');
  }

  function submitOrder(e) {
    e.preventDefault();
    var L = t();
    var data = {
      type: form.type,
      business: !!document.getElementById('fBusiness') && document.getElementById('fBusiness').checked,
      name: val('fName'), phone: val('fPhone'), address: val('fAddress'),
      plz: val('fPlz'), time: val('fTime'), company: val('fCompany'), notes: val('fNotes')
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

    // Nothing is payable until we have accepted an out-of-area enquiry, so the
    // PayPal button is withheld on that path.
    var pay = outside ? '' : paypalLink(total);
    els.body.innerHTML =
      '<div class="cart-sent' + (outside ? ' is-request' : '') + '">' +
        '<div class="cart-sent-mark" aria-hidden="true">' + (outside ? '!' : '✓') + '</div>' +
        '<h3>' + (outside ? L.sentTitleRequest : L.sentTitle) + '</h3>' +
        '<p>' + (outside ? L.sentTextRequest : L.sentText) + '</p>' +
        (pay
          ? '<a class="cart-paypal" href="' + pay + '" target="_blank" rel="noopener">' + L.payNow +
            ' · ' + money(total) + '</a><p class="cart-empty-hint">' + L.payHint + '</p>'
          : '') +
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
      }
    });

    document.addEventListener('change', function (e) {
      if (e.target.id === 'fBusiness') {
        form.business = e.target.checked;
        var wrap = document.getElementById('fCompanyWrap');
        var note = document.getElementById('cartLeadNote');
        if (wrap) wrap.hidden = !form.business;
        if (note) note.hidden = !form.business;
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
      fromPersons: b.fromPersons,
      discount: CFG.order.directDiscountPercent
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

    renderBusinessHours();

    // Corporate enquiry links carry a prefilled, structured template.
    [].forEach.call(document.querySelectorAll('[data-wa-template]'), function (el) {
      el.setAttribute('href', 'https://wa.me/' + CFG.whatsapp.number + '?text=' +
        encodeURIComponent(businessTemplate(el.getAttribute('data-wa-template'))));
    });

    // PayPal is only advertised once a handle exists.
    var hasPaypal = !!(CFG.payment && CFG.payment.paypalMe);
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

  function renderBusinessHours() {
    var host = document.getElementById('businessHours');
    if (!host) return;
    var lunchOn = !!(CFG.hours.lunch && CFG.hours.lunch.enabled);
    var windows = lunchOn ? groupWindows(function (d) { return d.lunch; }) : [];

    if (windows.length) {
      host.textContent = (lang() === 'en' ? 'Lunch service: ' : 'Mittagsservice: ') +
        windows.join(' · ') + (lang() === 'en'
          ? '. Corporate orders outside these times by arrangement.'
          : '. Firmenbestellungen zu anderen Zeiten nach Absprache.');
    } else {
      host.textContent = lang() === 'en'
        ? 'Delivery times for corporate orders by arrangement — just tell us when you need it.'
        : 'Liefertermine für Firmenbestellungen nach Absprache — sagen Sie uns einfach, wann Sie es brauchen.';
    }
  }

  function businessTemplate(kind) {
    var b = CFG.business || {};
    if (lang() === 'en') {
      return kind === 'business'
        ? 'Hello KAIRO 1980, I would like a quote for a corporate order.\n\n' +
          'Company: \nNumber of people: \nDate & time: \nDelivery address: \nNotes: '
        : "Hello KAIRO 1980! I'd like to place an order.";
    }
    return kind === 'business'
      ? 'Hallo KAIRO 1980, ich möchte ein Angebot für eine Firmenbestellung.\n\n' +
        'Firma: \nPersonenzahl: \nDatum & Uhrzeit: \nLieferadresse: \nAnmerkung: '
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
