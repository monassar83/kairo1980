/* ---------------------------------------------------------------------------
   KAIRO 1980 — page behaviour: language switching, scroll reveal, reviews
   ---------------------------------------------------------------------------
   Extracted from index.html so the page carries no inline script and no
   inline event handler. That lets the site ship a strict Content-Security-
   Policy (script-src 'self') instead of having to allow 'unsafe-inline',
   and keeps index.html readable as pure markup.

   Ordering, opening hours and everything driven by config.js live in
   order.js. This file is only the presentational behaviour of the page.
--------------------------------------------------------------------------- */

(function () {
  'use strict';


  // Language detection, memory, direction and the switch itself live in
  // lang.js, which every page loads. This file only reacts to the event.
  var currentLang = (window.KairoLang && window.KairoLang.current) || 'de';

  const MORE = { de: 'Mehr lesen', en: 'Read more', ar: 'اقرأ المزيد' };
  const LESS = { de: 'Weniger lesen', en: 'Read less', ar: 'عرض أقل' };

  // A label that depends on state cannot be a fixed attribute: the button
  // carries whichever pair applies, and lang.js paints it from those.
  function setToggleLabels(el, labels) {
    if (!el) return;
    el.setAttribute('data-de', labels.de);
    el.setAttribute('data-en', labels.en);
    el.setAttribute('data-ar', labels.ar);
    el.textContent = labels[currentLang] || labels.de;
  }

  function toggleMehrLesen() {
    const content = document.getElementById('mehrLesenContent');
    const btn = document.getElementById('mehrLesenBtn');
    const isOpen = content.classList.toggle('open');
    btn.setAttribute('aria-expanded', String(isOpen));
    setToggleLabels(btn.querySelector('.t'), isOpen ? LESS : MORE);
  }

  /* --- reveal on scroll ---------------------------------------------------
     `threshold` is a fraction of THE ELEMENT, not of the screen, and that is
     the trap this code fell into. `#speisekarte` is the whole menu and on a
     phone it is many times taller than the viewport — so a screenful of it was
     about 9% of the section, the 0.12 threshold could never be met, the
     callback never fired, and the menu sat at `opacity: 0` for ever. A guest
     reported a blank menu; "Desktop site" appeared to cure it only because the
     wider layout makes the section short enough for 12% to be reachable, which
     is what made it look like a browser bug rather than an arithmetic one. It
     was reproduced on both Brave and Chrome, because it is neither.

     A threshold of 0 fires as soon as any part of the element is visible, so
     the reveal can no longer depend on how tall the section happens to be. The
     rootMargin is what keeps the effect: the element must come 40px into view
     rather than trigger on its first pixel.

     NEVER express this as a fraction of the element again. Any section here
     can grow past a phone's height with one more dish. */
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(el => {
        if (el.isIntersecting) {
          el.target.classList.add('visible');
          observer.unobserve(el.target);
        }
      });
    }, { threshold: 0, rootMargin: '0px 0px -40px 0px' });

    document.querySelectorAll('.fade-in').forEach(el => observer.observe(el));
  } else {
    /* No observer, no reveal — so nothing may be left hidden. The animation is
       an enhancement; the menu is the page. */
    document.querySelectorAll('.fade-in').forEach(el => el.classList.add('visible'));
  }

  // Reviews carousel
  let currentReview = 0;
  let reviews = [];
  let reviewTimer = null;

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));

  // Google returns review text with real newlines; keep the author's paragraphs.
  const formatReviewText = (text) => escapeHtml(text)
    .split(/\n\s*\n/)
    .map(p => p.trim().replace(/\n/g, '<br>'))
    .filter(Boolean)
    .join('</p><p class="review-text">');

  /* --- review dates -------------------------------------------------------
     The review TEXT is never translated. It is a quoted statement by a named
     person: rewriting it puts words in their mouth, a machine translation of a
     testimonial reads as marketing rather than as evidence, and translating it
     would mean sending guest content to a third-party service, which this site
     deliberately never does. The text is marked with its own `lang` instead,
     so screen readers pronounce it correctly.
     Everything AROUND the quote is the site speaking, and that does follow the
     visitor's choice — including the date, which arrived from Google as the
     German string "vor 4 Wochen" and stayed German on the English page.
  ------------------------------------------------------------------------- */

  // Egypt reads Western digits day to day, and the prices on this page are
  // German ones, so Arabic uses the Latin numbering system rather than the
  // Arabic-Indic digits Intl would otherwise pick for ar-EG.
  const LOCALE = { de: 'de-DE', en: 'en-GB', ar: 'ar-EG-u-nu-latn' };

  const RELATIVE_STEPS = [
    ['year', 31536000], ['month', 2592000], ['week', 604800],
    ['day', 86400], ['hour', 3600], ['minute', 60]
  ];

  function relativeTime(iso, fallback) {
    if (!iso || typeof Intl === 'undefined' || !Intl.RelativeTimeFormat) return fallback || '';
    const then = Date.parse(iso);
    if (isNaN(then)) return fallback || '';
    const seconds = (then - Date.now()) / 1000;
    const fmt = new Intl.RelativeTimeFormat(LOCALE[currentLang] || LOCALE.de, { numeric: 'auto' });
    for (const [unit, size] of RELATIVE_STEPS) {
      if (Math.abs(seconds) >= size) return fmt.format(Math.round(seconds / size), unit);
    }
    return fmt.format(Math.round(seconds), 'second');
  }

  /* --- rating summary -----------------------------------------------------
     "5.0 / 5 · 13 Bewertungen auf Google" put three numbers on one line with
     nothing but a middot between them, so 5 and 13 collided and the score read
     as "5.0/5.13" at a glance. The score and the sample size are two different
     facts and now sit on two lines: the score large, the count quiet beneath
     it. Both are formatted for the current locale, so German shows 5,0 with a
     comma and a thousands separator where one is needed.
  ------------------------------------------------------------------------- */

  let summaryFigures = null;

  function renderSummary() {
    const summary = document.getElementById('reviewsSummary');
    if (!summary || !summaryFigures) return;
    const { rating, total } = summaryFigures;
    const locale = LOCALE[currentLang] || LOCALE.de;
    const OUT_OF = { de: 'von 5', en: 'out of 5', ar: 'من 5' };
    const ON_GOOGLE = {
      de: 'Bewertungen auf Google',
      en: 'reviews on Google',
      ar: 'تقييم على Google'
    };
    const outOf = OUT_OF[currentLang] || OUT_OF.de;
    const onGoogle = ON_GOOGLE[currentLang] || ON_GOOGLE.de;

    // Each star is its own element so the last earned one can catch the sheen
    // as it arrives. Deliberately NOT drawn larger than its neighbours: an
    // oversized glyph in a row of five reads as a rendering fault, not as
    // emphasis. The light finishing on it is what completes the row.
    const full = Math.max(0, Math.min(5, Math.round(rating)));
    const stars = Array.from({ length: 5 }, (_, i) => {
      const filled = i < full;
      const cls = 'star' + (filled ? '' : ' is-empty') +
                  (filled && i === full - 1 ? ' is-last' : '');
      return `<span class="${cls}">${filled ? '★' : '☆'}</span>`;
    }).join('');

    const score = rating.toLocaleString(locale, {
      minimumFractionDigits: 1, maximumFractionDigits: 1
    });
    const count = total.toLocaleString(locale);

    summary.innerHTML = `
      <div class="reviews-stars" role="img" aria-label="${score} ${outOf}">${stars}</div>
      <p class="reviews-score">
        <span class="reviews-score-value">${score}</span><span class="reviews-score-max">${outOf}</span>
      </p>
      <p class="reviews-count">${count} ${onGoogle}</p>
    `;
  }

  // The summary and the review dates are the site's own words about the
  // reviews, so both follow the language switch. The quoted text does not.
  document.addEventListener('kairo:lang', (e) => {
    currentLang = (e && e.detail) || currentLang;
    renderSummary();
    if (!reviews.length) return;
    const showing = currentReview;
    renderReviews();
    goToReview(Math.min(showing, reviews.length - 1));
  });

  async function loadReviews() {
    try {
      const res = await fetch('/reviews.json?v=' + Date.now());
      if (!res.ok) throw new Error('reviews.json returned ' + res.status);
      const data = await res.json();
      reviews = Array.isArray(data.reviews) ? data.reviews : [];
      const rating = data.rating || 5;
      const total = data.totalRatings || 0;

      summaryFigures = { rating: rating, total: total };
      renderSummary();

      // Hand the real figures to order.js, which mirrors them into the
      // structured data. Only what is rendered here is ever marked up.
      document.dispatchEvent(new CustomEvent('kairo:reviews', {
        detail: { rating: rating, total: total }
      }));

      if (reviews.length === 0) {
        hideCarousel();
        return;
      }

      renderReviews();
      startAutoAdvance();
    } catch(e) {
      // Keep the heading and the "leave a review" call to action — only the
      // carousel depends on reviews.json.
      hideCarousel();
    }
  }

  function hideCarousel() {
    const carousel = document.querySelector('.reviews-carousel');
    const dots = document.getElementById('reviewsDots');
    if (carousel) carousel.style.display = 'none';
    if (dots) dots.style.display = 'none';
  }

  function renderReviews() {
    const track = document.getElementById('reviewsTrack');
    const dots = document.getElementById('reviewsDots');
    if (!track) return;

    track.innerHTML = reviews.map((r, i) => {
      const author = String(r.author || 'Anonym');
      const stars = Math.max(0, Math.min(5, Math.round(r.rating || 0)));
      return `
      <div class="review-card ${i === 0 ? 'active' : ''}">
        <div class="review-header">
          <div class="review-avatar">${escapeHtml(author.charAt(0).toUpperCase())}</div>
          <div>
            <div class="review-author">${escapeHtml(author)}</div>
            <div class="review-time">${escapeHtml(relativeTime(r.publishTime, r.time))}</div>
          </div>
          <div class="review-stars" role="img" aria-label="${stars}/5">${'★'.repeat(stars)}</div>
        </div>
        <div class="review-body" lang="${escapeHtml(r.lang || 'de')}">
          <p class="review-text">${formatReviewText(r.text)}</p>
        </div>
        <button type="button" class="review-more t" data-action="review-toggle"
                aria-expanded="false"
                data-de="${MORE.de}" data-en="${MORE.en}" data-ar="${MORE.ar}"
                hidden>${MORE[currentLang] || MORE.de}</button>
      </div>
    `;
    }).join('');

    dots.innerHTML = reviews.map((_, i) =>
      `<button type="button" class="dot ${i === 0 ? 'active' : ''}" data-action="reviews-goto" data-index="${i}" aria-label="${i + 1}"></button>`
    ).join('');

    markOverflowingReviews();
  }

  /* --- review length ------------------------------------------------------
     Every card shared one grid cell, so the whole carousel was as tall as the
     single longest review — one 400-word essay and the section became a wall
     of text that pushed the rest of the page down on every screen. Reviews are
     now clamped to a readable block and only the ones that genuinely overflow
     offer to expand. The measurement has to happen after layout, and the fonts
     land after first paint, so it is repeated once the fonts are ready.
  ------------------------------------------------------------------------- */

  function markOverflowingReviews() {
    document.querySelectorAll('.review-card').forEach(card => {
      const body = card.querySelector('.review-body');
      const btn = card.querySelector('.review-more');
      // An expanded card measures as "fits" by definition — re-measuring it
      // would collapse it under the reader on the next resize.
      if (!body || !btn || body.classList.contains('is-open')) return;
      // A card that is faded out still has a laid-out box, so scrollHeight is
      // meaningful for every review, not just the visible one.
      const overflows = body.scrollHeight - body.clientHeight > 4;
      body.classList.toggle('is-clamped', overflows);
      btn.hidden = !overflows;
    });
  }

  function toggleReview(btn) {
    const card = btn.closest('.review-card');
    const body = card && card.querySelector('.review-body');
    if (!body) return;
    const open = body.classList.toggle('is-open');
    btn.setAttribute('aria-expanded', String(open));
    setToggleLabels(btn, open ? LESS : MORE);
    // An expanded review must not be swiped away mid-sentence.
    if (open) stopAutoAdvance();
    else startAutoAdvance();
  }

  // Web fonts land after first paint and change every line break, so the
  // measurement is taken again once they are in, and after a resize.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(markOverflowingReviews);
  }

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(markOverflowingReviews, 200);
  });

  function moveReviews(dir) {
    if (!reviews.length) return;
    goToReview((currentReview + dir + reviews.length) % reviews.length);
  }

  function goToReview(idx) {
    if (!Number.isInteger(idx) || idx < 0 || idx >= reviews.length) return;
    currentReview = idx;
    document.querySelectorAll('.review-card').forEach((c, i) => {
      c.classList.toggle('active', i === idx);
    });
    document.querySelectorAll('.dot').forEach((d, i) => {
      d.classList.toggle('active', i === idx);
    });
  }

  // Auto-advance every 5 seconds — only once reviews are actually loaded.
  // Starting the timer earlier made moveReviews() divide by an empty array,
  // which set currentReview to NaN and left the carousel permanently blank.
  function startAutoAdvance() {
    if (reviewTimer || reviews.length < 2) return;
    // Never resume under a review the visitor has opened to read.
    if (document.querySelector('.review-body.is-open')) return;
    reviewTimer = setInterval(() => moveReviews(1), 5000);
  }

  function stopAutoAdvance() {
    clearInterval(reviewTimer);
    reviewTimer = null;
  }

  // Reading stops the carousel; leaving lets it run again. Text that slides
  // away mid-sentence is the most common complaint about auto-playing
  // testimonials, and a hover is the clearest signal that someone is reading.
  (function () {
    const carousel = document.querySelector('.reviews-carousel');
    if (!carousel) return;
    ['mouseenter', 'focusin'].forEach(ev => carousel.addEventListener(ev, stopAutoAdvance));
    ['mouseleave', 'focusout'].forEach(ev => carousel.addEventListener(ev, startAutoAdvance));
  })();


  // Google Maps is embedded only after an explicit click (two-click solution),
  // so no visitor data reaches Google without consent.
  (function () {
    const btn = document.getElementById('mapConsentBtn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const holder = document.getElementById('mapHolder');
      const frame = document.createElement('iframe');
      frame.src = 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2600.175357343614!2d8.544694011753359!3d49.32989876729051!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x4797b97c5c6a0a77%3A0x1161f25fa30a31cb!2sKAIRO%201980!5e0!3m2!1sen!2sde!4v1779924687462!5m2!1sen!2sde';
      frame.setAttribute('allowfullscreen', '');
      frame.setAttribute('loading', 'lazy');
      frame.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
      const TITLE = {
        de: 'KAIRO 1980 Standort', en: 'KAIRO 1980 location',
        ar: 'موقع KAIRO 1980'
      };
      frame.title = TITLE[currentLang] || TITLE.de;
      /* Everything goes: the static image, its attribution and the panel. The
         guest asked for the interactive map and now has it, and OpenStreetMap's
         attribution goes with the picture it belonged to — Google's embed
         carries its own. */
      holder.innerHTML = '';
      holder.appendChild(frame);
    });
  })();

  /* --- event wiring -------------------------------------------------------
     Replaces the onclick attributes the markup used to carry.
  ----------------------------------------------------------------------- */

  document.addEventListener('click', function (e) {
    var target = e.target.closest('[data-action]');
    if (!target) return;
    var action = target.getAttribute('data-action');

    if (action === 'toggle-story') {
      toggleMehrLesen();
    } else if (action === 'reviews-prev') {
      moveReviews(-1);
    } else if (action === 'reviews-next') {
      moveReviews(1);
    } else if (action === 'reviews-goto') {
      goToReview(parseInt(target.getAttribute('data-index'), 10));
    } else if (action === 'review-toggle') {
      toggleReview(target);
    }
  });

  loadReviews();
})();
