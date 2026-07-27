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


  let currentLang = 'de';

  function setLang(lang) {
    currentLang = lang;
    document.documentElement.lang = lang;

    // Update all translatable elements
    document.querySelectorAll('.t').forEach(el => {
      const text = el.getAttribute('data-' + lang);
      if (text) el.textContent = text;
      // Links may also carry a per-language target, e.g. the WhatsApp order
      // buttons, whose prefilled message should match the visitor's language.
      const href = el.getAttribute('data-' + lang + '-href');
      if (href) el.setAttribute('href', href);
    });

    // Update title
    document.title = lang === 'de'
      ? 'KAIRO 1980 – Moderne Ägyptische Küche'
      : 'KAIRO 1980 – Modern Egyptian Cuisine';

    // Update active button
    document.getElementById('btn-de').classList.toggle('active', lang === 'de');
    document.getElementById('btn-en').classList.toggle('active', lang === 'en');

    // Opening hours, the basket and every config-driven number are rendered by
    // order.js, which repaints itself when this fires.
    document.dispatchEvent(new CustomEvent('kairo:lang', { detail: lang }));

    // Update mehr lesen button text based on state
    const btn = document.getElementById('mehrLesenBtn');
    const isOpen = document.getElementById('mehrLesenContent').classList.contains('open');
    btn.querySelector('.t').textContent = isOpen
      ? (lang === 'de' ? 'Weniger lesen' : 'Read less')
      : (lang === 'de' ? 'Mehr lesen' : 'Read more');
  }

  function toggleMehrLesen() {
    const content = document.getElementById('mehrLesenContent');
    const btn = document.getElementById('mehrLesenBtn');
    const btnText = btn.querySelector('.t');
    const isOpen = content.classList.toggle('open');
    btn.setAttribute('aria-expanded', String(isOpen));
    btnText.textContent = isOpen
      ? (currentLang === 'de' ? 'Weniger lesen' : 'Read less')
      : (currentLang === 'de' ? 'Mehr lesen' : 'Read more');
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(el => {
      if (el.isIntersecting) {
        el.target.classList.add('visible');
        observer.unobserve(el.target);
      }
    });
  }, { threshold: 0.12 });

  document.querySelectorAll('.fade-in').forEach(el => observer.observe(el));

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

  async function loadReviews() {
    try {
      const res = await fetch('/reviews.json?v=' + Date.now());
      if (!res.ok) throw new Error('reviews.json returned ' + res.status);
      const data = await res.json();
      reviews = Array.isArray(data.reviews) ? data.reviews : [];
      const rating = data.rating || 5;
      const total = data.totalRatings || 0;

      // Summary
      const summary = document.getElementById('reviewsSummary');
      if (summary) {
        const stars = '★'.repeat(Math.round(rating)) + '☆'.repeat(5 - Math.round(rating));
        summary.innerHTML = `
          <div class="reviews-stars">${stars}</div>
          <div class="reviews-score">${rating.toFixed(1)} <span class="reviews-total">/ 5 · ${total} ${document.documentElement.lang === 'en' ? 'reviews on Google' : 'Bewertungen auf Google'}</span></div>
        `;
      }

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
            <div class="review-time">${escapeHtml(r.time)}</div>
          </div>
          <div class="review-stars">${'★'.repeat(stars)}</div>
        </div>
        <p class="review-text">${formatReviewText(r.text)}</p>
      </div>
    `;
    }).join('');

    dots.innerHTML = reviews.map((_, i) =>
      `<button type="button" class="dot ${i === 0 ? 'active' : ''}" data-action="reviews-goto" data-index="${i}" aria-label="${i + 1}"></button>`
    ).join('');
  }

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
    reviewTimer = setInterval(() => moveReviews(1), 5000);
  }


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
      frame.title = 'KAIRO 1980 Standort';
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

    if (action === 'lang') {
      setLang(target.getAttribute('data-lang'));
    } else if (action === 'toggle-story') {
      toggleMehrLesen();
    } else if (action === 'reviews-prev') {
      moveReviews(-1);
    } else if (action === 'reviews-next') {
      moveReviews(1);
    } else if (action === 'reviews-goto') {
      goToReview(parseInt(target.getAttribute('data-index'), 10));
    }
  });

  loadReviews();
})();
