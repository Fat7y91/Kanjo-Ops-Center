/* Language toggle for the static bilingual legal pages.
   Switches between the baked Arabic (#doc-ar) and English (#doc-en) articles,
   flips the document direction, and persists the choice. No network calls. */
(function () {
  'use strict';
  var STORAGE_KEY = 'kanjo_legal_lang';

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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
