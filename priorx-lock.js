// Priorx lock / switch-user screen.
//
// After idle time Priorx can cover the patient file and ask for the staff NIP
// while LoginName1 still holds the previous name. The widget must hide and
// refuse every send until a signed-in user is visible again.
//
// PRIORX_LOCK_SELECTORS is NOT confirmed against the live lock screen. This
// repository has no saved HTML for it. At the pharmacy, when the NIP box is
// on screen: right-click it, choose Inspect, and add the overlay or PIN
// input's id or class to this list (for example "#theIdFromInspect").
//
// Until that id is known, these generic checks also lock the widget:
//   - LoginName1 missing, empty, or not visible
//   - BA01_LastName missing, not visible, or covered by a large layer
//   - a visible password field, or a visible field whose id/name/label says NIP
//   - a visible element from PRIORX_LOCK_SELECTORS
//   - a large dialog, or a visible layer whose id/class looks like a lock
// Fail closed: if the login field cannot be read, the session counts as locked.
//
// DEFAULT_IDLE_LOCK_MINUTES is a stand-in. Priorx's own NIP delay is not in
// this repository. Options stores the value the pharmacy actually uses.
// 10 minutes is the default until that number is confirmed.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module && module.exports) {
    module.exports = api;
  }
  root.NotiRxLock = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const PRIORX_LOCK_SELECTORS = [
    '#PRIORX_LOCK_OVERLAY_ID_UNCONFIRMED',
    '#priorx-nip-lock',
    '#lockScreen',
    '#LockScreen',
    '#pnlLock',
    '#divLock',
    '#NIPDialog',
    '#dlgNIP',
    '#txtNIP',
    '#txtPin',
    '#userSwitch',
    '#switchUser',
    '[data-notirx-lock-screen]',
  ];

  const DEFAULT_IDLE_LOCK_MINUTES = 10;
  const MIN_IDLE_LOCK_MINUTES = 1;
  const MAX_IDLE_LOCK_MINUTES = 120;
  const LARGE_COVER_RATIO = 0.5;
  const DIALOG_RATIO = 0.45;

  function normalizeIdleLockMinutes(value) {
    const n = typeof value === 'string' ? Number(value.trim()) : Number(value);
    if (!Number.isInteger(n) || n < MIN_IDLE_LOCK_MINUTES || n > MAX_IDLE_LOCK_MINUTES) {
      return DEFAULT_IDLE_LOCK_MINUTES;
    }
    return n;
  }

  function viewOf(doc) {
    try {
      return doc.defaultView || globalThis;
    } catch {
      return globalThis;
    }
  }

  function styleOf(el) {
    try {
      const view = el.ownerDocument ? viewOf(el.ownerDocument) : globalThis;
      if (typeof view.getComputedStyle === 'function') return view.getComputedStyle(el);
    } catch {
      // Fail closed at the caller when style cannot be read.
    }
    return null;
  }

  function isVisible(el) {
    if (!el || !el.tagName) return false;
    if (el.hidden) return false;
    if (el.getAttribute && el.getAttribute('aria-hidden') === 'true') return false;
    const style = styleOf(el);
    if (!style) return false;
    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
    if (String(style.opacity) === '0') return false;
    const rect = typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect() : null;
    if (!rect || rect.width < 1 || rect.height < 1) return false;
    return true;
  }

  function accessibleDocuments(startDoc) {
    const docs = [];
    const seen = new Set();
    function add(doc) {
      if (!doc || seen.has(doc)) return;
      seen.add(doc);
      docs.push(doc);
      let frames;
      try {
        frames = doc.querySelectorAll('iframe, frame');
      } catch {
        return;
      }
      for (const frame of frames) {
        try {
          add(frame.contentDocument);
        } catch {
          // Cross-origin frame. Skip it. Do not treat it as a lock by itself.
        }
      }
    }
    try {
      add(startDoc.defaultView?.top?.document);
    } catch {
      // Top frame is cross-origin.
    }
    add(startDoc);
    return docs;
  }

  function byId(docs, id) {
    for (const doc of docs) {
      try {
        const el = doc.getElementById?.(id);
        if (el) return el;
      } catch {
        // Ignore a document that refuses the lookup.
      }
    }
    return null;
  }

  function textOf(el) {
    try {
      return String(el.textContent || el.value || '').trim();
    } catch {
      return '';
    }
  }

  function classText(el) {
    if (!el) return '';
    if (typeof el.className === 'string') return el.className;
    try {
      return el.getAttribute?.('class') || '';
    } catch {
      return '';
    }
  }

  function areaRatio(el, doc) {
    const rect = typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect() : null;
    if (!rect) return 0;
    const view = viewOf(doc);
    const vw = view.innerWidth || doc.documentElement?.clientWidth || 0;
    const vh = view.innerHeight || doc.documentElement?.clientHeight || 0;
    if (!vw || !vh) return 0;
    const width = Math.max(0, Math.min(rect.right, vw) - Math.max(rect.left, 0));
    const height = Math.max(0, Math.min(rect.bottom, vh) - Math.max(rect.top, 0));
    return (width * height) / (vw * vh);
  }

  function isWidget(el) {
    if (!el) return false;
    if (el.id === 'notirx-host') return true;
    try {
      return Boolean(el.closest && el.closest('#notirx-host'));
    } catch {
      return false;
    }
  }

  function hintText(el) {
    const parts = [
      el.id,
      el.name,
      el.getAttribute?.('placeholder'),
      el.getAttribute?.('aria-label'),
      el.getAttribute?.('title'),
    ];
    return parts.filter(Boolean).join(' ');
  }

  function isCredentialInput(el) {
    if (!el || String(el.tagName || '').toUpperCase() !== 'INPUT') return false;
    if (isWidget(el) || !isVisible(el)) return false;
    const type = String((el.getAttribute && el.getAttribute('type')) || el.type || '').toLowerCase();
    if (type === 'password') return true;
    return /nip|pin|passwd|password|motdepasse|mot-de-passe/i.test(hintText(el));
  }

  function hasLockIdentity(el) {
    const blob = `${el.id || ''} ${classText(el)}`;
    return /(^|[^a-z0-9])(lock|locked|lockscreen|verrou|verrouille|nip|pin)([^a-z0-9]|$)/i.test(blob);
  }

  function matchesLockSelector(el, doc) {
    for (const selector of PRIORX_LOCK_SELECTORS) {
      let list;
      try {
        list = doc.querySelectorAll(selector);
      } catch {
        continue;
      }
      for (const match of list) {
        if (match === el) return selector;
      }
    }
    return '';
  }

  function describeElement(el) {
    if (!el) return null;
    return {
      id: el.id || '',
      className: classText(el).slice(0, 120),
      tag: String(el.tagName || '').toLowerCase(),
    };
  }

  function findCredentialField(docs) {
    for (const doc of docs) {
      let inputs;
      try {
        inputs = doc.querySelectorAll('input');
      } catch {
        continue;
      }
      for (const input of inputs) {
        if (isCredentialInput(input)) return input;
      }
    }
    return null;
  }

  function findSelectorMatch(docs) {
    const matches = [];
    for (const doc of docs) {
      for (const selector of PRIORX_LOCK_SELECTORS) {
        let list;
        try {
          list = doc.querySelectorAll(selector);
        } catch {
          continue;
        }
        for (const el of list) {
          if (isVisible(el) && !isWidget(el)) {
            matches.push({ selector, element: el });
          }
        }
      }
    }
    return matches;
  }

  function findDialog(docs) {
    for (const doc of docs) {
      let list;
      try {
        list = doc.querySelectorAll('[role="dialog"], [aria-modal="true"]');
      } catch {
        continue;
      }
      for (const el of list) {
        if (!isVisible(el) || isWidget(el)) continue;
        if (areaRatio(el, doc) >= DIALOG_RATIO || hasLockIdentity(el) || credentialInside(el)) return el;
      }
    }
    return null;
  }

  function isPositionedLayer(el) {
    const style = styleOf(el);
    if (!style) return false;
    return style.position === 'fixed' || style.position === 'absolute';
  }

  // A full-screen lock still counts when the patient name is scrolled off screen.
  // Only a fixed or absolute layer counts, so the normal page underneath does not.
  function findViewportCover(docs) {
    for (const doc of docs) {
      const view = viewOf(doc);
      const x = (view.innerWidth || 0) / 2;
      const y = (view.innerHeight || 0) / 2;
      if (!x || !y || typeof doc.elementFromPoint !== 'function') continue;
      let top = null;
      try {
        top = doc.elementFromPoint(x, y);
      } catch {
        return { failClosed: true, overlay: null };
      }
      let node = top;
      while (node && node !== doc.documentElement) {
        if (!isWidget(node) && isVisible(node) && isPositionedLayer(node) && areaRatio(node, doc) >= LARGE_COVER_RATIO) {
          return { failClosed: false, overlay: node };
        }
        node = node.parentElement;
      }
    }
    return { failClosed: false, overlay: null };
  }

  function patientCover(docs) {
    const field = byId(docs, 'BA01_LastName');
    if (!field) return { state: 'missing', overlay: null };
    if (!isVisible(field)) return { state: 'hidden', overlay: null };
    const doc = field.ownerDocument;
    const rect = field.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    let top = null;
    try {
      top = doc.elementFromPoint(x, y);
    } catch {
      return { state: 'covered', overlay: null };
    }
    if (!top || top === field || (typeof field.contains === 'function' && field.contains(top))) {
      return { state: 'clear', overlay: null };
    }
    let node = top;
    while (node && node !== doc.documentElement) {
      if (!isWidget(node) && isVisible(node)) {
        const selector = matchesLockSelector(node, doc);
        const role = node.getAttribute?.('role');
        const modal = node.getAttribute?.('aria-modal') === 'true';
        const dialog = (role === 'dialog' || modal) && areaRatio(node, doc) >= DIALOG_RATIO;
        const identified = hasLockIdentity(node);
        const credential = isCredentialInput(node) || (typeof node.querySelector === 'function' && credentialInside(node));
        const large = areaRatio(node, doc) >= LARGE_COVER_RATIO;
        if (selector || dialog || identified || credential || large) {
          return { state: 'covered', overlay: node };
        }
      }
      node = node.parentElement;
    }
    return { state: 'clear', overlay: null };
  }

  function credentialInside(el) {
    let inputs;
    try {
      inputs = el.querySelectorAll('input');
    } catch {
      return false;
    }
    for (const input of inputs) {
      if (isCredentialInput(input)) return true;
    }
    return false;
  }

  function assessPriorxSession(doc, options = {}) {
    const reasons = [];
    const docs = accessibleDocuments(doc);
    const login = byId(docs, 'LoginName1');
    let loginState = 'ok';
    if (!login) {
      reasons.push('login-missing');
      loginState = 'missing';
    } else if (!isVisible(login)) {
      reasons.push('login-hidden');
      loginState = 'hidden';
    } else if (!textOf(login)) {
      reasons.push('login-empty');
      loginState = 'empty';
    }

    const cover = patientCover(docs);
    if (cover.state === 'missing' || cover.state === 'hidden') reasons.push('patient-hidden');
    if (cover.state === 'covered') reasons.push('patient-covered');

    const viewport = findViewportCover(docs);
    if (viewport.failClosed || viewport.overlay) reasons.push('viewport-covered');

    const selectorMatches = findSelectorMatch(docs);
    if (selectorMatches.length) reasons.push('lock-selector');

    const credential = findCredentialField(docs);
    if (credential) reasons.push('credential-field');

    const layer = findDialog(docs);
    if (layer) reasons.push('lock-overlay');

    if (options.idleExpired) reasons.push('idle');

    const unique = [];
    for (const reason of reasons) {
      if (!unique.includes(reason)) unique.push(reason);
    }

    const debug = {
      locked: unique.length > 0,
      reasons: unique,
      login: loginState,
      patient: cover.state,
      matchedSelectors: selectorMatches.map((match) => match.selector),
      overlay: describeElement(cover.overlay || viewport.overlay || layer || selectorMatches[0]?.element || null),
      credentialField: credential ? describeElement(credential) : null,
      idleExpired: Boolean(options.idleExpired),
    };

    return { locked: unique.length > 0, reasons: unique, debug };
  }

  return {
    PRIORX_LOCK_SELECTORS,
    DEFAULT_IDLE_LOCK_MINUTES,
    normalizeIdleLockMinutes,
    assessPriorxSession,
  };
});
