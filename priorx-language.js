// Patient language on the Priorx file, next to the patient name.
//
// PRIORX_LANGUAGE_SELECTORS was confirmed at the Beloeil pharmacy:
// <span id="BA01_language"> (lowercase L). HTML ids are case-sensitive, so
// #BA01_Language does not match. The span's text is read.
//
// An empty span is skipped. A small field next to BA01_LastName whose whole
// text is exactly FR, EN, or (AN) is the fallback. Anything else, including a
// missing or unreadable field, becomes FR. A send is never blocked because the
// language could not be read.
//
// The value sent to the server is only EN or FR. Priorx shows English as
// "(AN)" (anglais), not "(EN)". AN, ANG, EN, ENG, ANGLAIS, and ENGLISH become
// EN, with or without parentheses and surrounding spaces. The backend uses
// English for EN and French for anything else. The extension sends EN, not AN.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module && module.exports) {
    module.exports = api;
  }
  root.NotiRxLanguage = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const PRIORX_LANGUAGE_SELECTORS = [
    '#BA01_language',
  ];

  const ENGLISH_TOKENS = new Set(['EN', 'ENG', 'ANG', 'AN', 'ANGLAIS', 'ENGLISH']);

  function languageToken(raw) {
    return String(raw ?? '')
      .trim()
      .toUpperCase()
      .replace(/^[^A-ZÀ-ÿ]+|[^A-ZÀ-ÿ]+$/g, '');
  }

  function normalizePatientLanguage(raw) {
    const token = languageToken(raw);
    if (ENGLISH_TOKENS.has(token)) return 'EN';
    const upper = String(raw ?? '').toUpperCase();
    const paren = upper.match(/\(\s*([A-ZÀ-ÿ]+)\s*\)/);
    if (paren && ENGLISH_TOKENS.has(paren[1])) return 'EN';
    return 'FR';
  }

  function stringsOf(el) {
    const out = [];
    const tag = String(el.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      if (el.value != null) out.push(String(el.value));
    }
    if (tag === 'SELECT' && el.selectedOptions && el.selectedOptions[0]) {
      out.push(String(el.selectedOptions[0].textContent || ''));
    }
    if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
      out.push(String(el.textContent || ''));
    }
    return out;
  }

  function languageFromElement(el) {
    if (!el) return null;
    let parts;
    try {
      parts = stringsOf(el);
    } catch {
      return null;
    }
    let sawText = false;
    for (const part of parts) {
      const trimmed = String(part).trim();
      if (!trimmed) continue;
      sawText = true;
      if (normalizePatientLanguage(trimmed) === 'EN') return 'EN';
    }
    return sawText ? 'FR' : null;
  }

  function exactFrEn(el) {
    let text = '';
    try {
      text = String(el.textContent || '').replace(/\s+/g, ' ').trim();
    } catch {
      return null;
    }
    // A neighbouring field counts only when its whole text is FR, EN, or AN
    // (Priorx writes English as "(AN)"). Longer words such as ENGLISH do not.
    if (/^\(?\s*(FR|EN|AN)\s*\)?$/i.test(text)) {
      return /^FR$/i.test(text.replace(/[()\s]/g, '')) ? 'FR' : 'EN';
    }
    return null;
  }

  function readFromSelectors(doc) {
    for (const selector of PRIORX_LANGUAGE_SELECTORS) {
      let el = null;
      try {
        el = doc.querySelector(selector);
      } catch {
        continue;
      }
      const language = languageFromElement(el);
      if (language) return language;
    }
    return null;
  }

  function readAdjacent(doc) {
    let name = null;
    try {
      name = doc.getElementById('BA01_LastName');
    } catch {
      return null;
    }
    if (!name) return null;

    const seen = new Set();
    const candidates = [];
    function push(el) {
      if (!el || el === name || seen.has(el)) return;
      seen.add(el);
      candidates.push(el);
    }

    try {
      push(name.previousElementSibling);
      push(name.nextElementSibling);
    } catch {
      // Siblings could not be read. The selector list may still have matched.
    }

    let parent = null;
    try {
      parent = name.parentElement;
    } catch {
      parent = null;
    }
    if (parent && parent.children) {
      for (const child of parent.children) push(child);
    }
    for (const el of candidates.slice()) {
      if (!el.children) continue;
      for (const child of el.children) push(child);
    }

    for (const el of candidates) {
      const language = exactFrEn(el);
      if (language) return language;
    }
    return null;
  }

  function readPatientLanguage(doc) {
    if (!doc) return 'FR';
    try {
      return readFromSelectors(doc) || readAdjacent(doc) || 'FR';
    } catch {
      return 'FR';
    }
  }

  return {
    PRIORX_LANGUAGE_SELECTORS,
    normalizePatientLanguage,
    readPatientLanguage,
  };
});
