/* Language toggle + navigation localization for the static bilingual legal
   pages. Switches between the baked Arabic (#doc-ar) and English (#doc-en)
   articles, flips the document direction, localizes the navbar via a tiny
   `t()` dictionary, highlights the active route, and persists the choice.
   No network calls. */
(function () {
  'use strict';
  var STORAGE_KEY = 'kanjo_legal_lang';

  /* Minimal translation layer: keys map to the strings the legal chrome renders.
     The articles themselves stay baked (fully translated) in the HTML. */
  var I18N = {
    ar: {
      'nav.privacy': 'الخصوصية',
      'nav.terms': 'الشروط',
      'nav.privacyFull': 'سياسة الخصوصية',
      'nav.termsFull': 'الشروط والأحكام'
    },
    en: {
      'nav.privacy': 'Privacy',
      'nav.terms': 'Terms',
      'nav.privacyFull': 'Privacy Policy',
      'nav.termsFull': 'Terms & Conditions'
    }
  };

  function t(key, lang) {
    var pack = I18N[lang] || I18N.ar;
    return Object.prototype.hasOwnProperty.call(pack, key) ? pack[key] : key;
  }

  /* Translate every element carrying a data-i18n key (navbar + footer links). */
  function applyI18n(lang) {
    var nodes = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < nodes.length; i++) {
      var key = nodes[i].getAttribute('data-i18n');
      var value = t(key, lang);
      if (value !== key) nodes[i].textContent = value;
    }
  }

  /* Highlight the nav link that matches the current route. */
  function markActiveRoute() {
    var path = (window.location.pathname || '').replace(/\.html$/, '');
    var links = document.querySelectorAll('.legal-nav a[href]');
    for (var i = 0; i < links.length; i++) {
      var href = (links[i].getAttribute('href') || '').replace(/\.html$/, '');
      var isActive = !!href && href !== '/' && path.indexOf(href) === 0;
      links[i].classList.toggle('active', isActive);
      if (isActive) links[i].setAttribute('aria-current', 'page');
      else links[i].removeAttribute('aria-current');
    }
  }

  function readInitial() {
    try {
      var params = new URLSearchParams(window.location.search);
      var q = (params.get('lang') || '').toLowerCase();
      if (q === 'ar' || q === 'en') return q;
    } catch (_) { /* URLSearchParams may be unavailable */ }
    try {
      var saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === 'ar' || saved === 'en') return saved;
    } catch (_) { /* private mode */ }
    return 'ar';
  }

  function apply(lang) {
    var ar = document.getElementById('doc-ar');
    var en = document.getElementById('doc-en');
    if (!ar || !en) return;
    var isAr = lang !== 'en';
    ar.hidden = !isAr;
    en.hidden = isAr;

    document.documentElement.lang = isAr ? 'ar' : 'en';
    document.documentElement.dir = isAr ? 'rtl' : 'ltr';

    applyI18n(isAr ? 'ar' : 'en');
    markActiveRoute();

    var active = isAr ? ar : en;
    var h1 = active.querySelector('h1');
    if (h1) document.title = h1.textContent.trim() + ' | كانجو Kanjo';

    var btn = document.getElementById('langToggle');
    if (btn) {
      btn.textContent = isAr ? 'English' : 'العربية';
      btn.setAttribute('aria-pressed', String(!isAr));
      btn.setAttribute('aria-label', isAr ? 'Switch to English' : 'التبديل إلى العربية');
    }
    try { window.localStorage.setItem(STORAGE_KEY, isAr ? 'ar' : 'en'); } catch (_) { /* ignore */ }
  }

  function init() {
    var lang = readInitial();
    apply(lang);
    var btn = document.getElementById('langToggle');
    if (btn) {
      btn.addEventListener('click', function () {
        apply(document.documentElement.lang === 'ar' ? 'en' : 'ar');
      });
    }
  }

  /* Expose the translator for parity with the app-wide i18n contract. */
  window.legalT = t;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
