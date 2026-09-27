// Priorx patient search (F3).
//
// Clicking a reply should focus Priorx's patient search and place the phone
// number in it. It must not press Enter and must not open the file.
//
// Synthetic key events are not trusted (isTrusted is false). Priorx may ignore
// them. This file still sends one F3 keydown/keyup per same-origin document
// (top frame and child frames). The event is dispatched on the document so it
// bubbles to that frame's window. It is not also sent to the focused control,
// which would run a toggle shortcut twice.
//
// PRIORX_PATIENT_SEARCH_SELECTOR is the direct fallback when F3 does not reveal
// a field. This repository has no saved Priorx HTML for that box, so the id
// below is a placeholder. At the pharmacy: press F3, right-click the search
// field, choose Inspect, and replace this selector with the field's id
// (for example "#theIdFromInspect"). If the field sits in a frame, note which
// frame. Until that id is confirmed, a click still fills an input that F3
// focuses or newly shows. If neither happens, the number is copied.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module && module.exports) {
    module.exports = api;
  }
  root.NotiRxSearch = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const PRIORX_PATIENT_SEARCH_SELECTOR = '#PRIORX_SEARCH_FIELD_ID_UNCONFIRMED';

  const MESSAGE_TYPE_LABELS = {
    ready: 'commande prête',
    partial: 'médicaments en commande',
    new_prescription: 'nouvelle prescription reçue',
    renewal: 'ordonnances dues',
  };

  const SKIP_INPUT_TYPES = new Set([
    'hidden', 'password', 'checkbox', 'radio', 'button', 'submit', 'reset',
    'file', 'image', 'range', 'color',
  ]);

  function phoneDigits(value) {
    return String(value ?? '').replace(/\D/g, '');
  }

  function maskPhone(value) {
    const digits = phoneDigits(value);
    if (digits.length < 4) return '';
    const last4 = digits.slice(-4);
    if (digits.length >= 10) return `***-***-${last4}`;
    return `•••${last4}`;
  }

  function firstNameFromPatientName(patientName) {
    const name = String(patientName ?? '').trim();
    if (!name) return 'Patient';
    if (name.includes(',')) {
      const afterComma = name.split(',').slice(1).join(',').trim();
      if (afterComma) return afterComma.split(/\s+/)[0];
    }
    return name.split(/\s+/)[0];
  }

  function messageTypeLabel(messageType) {
    if (!messageType) return '';
    return MESSAGE_TYPE_LABELS[messageType] || '';
  }

  function formatTorontoTime(iso) {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    try {
      return new Intl.DateTimeFormat('fr-CA', {
        timeZone: 'America/Toronto',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
    } catch {
      return '';
    }
  }

  function historyEntryTitle(entry) {
    const label = messageTypeLabel(entry?.message_type);
    if (entry?.direction === 'in') {
      const keyword = String(entry.reply_keyword ?? '').trim();
      const reply = keyword ? `Réponse ${keyword}` : 'Réponse';
      return label ? `${reply} · ${label}` : reply;
    }
    return label || 'Message';
  }

  function sortMessagesNewestFirst(messages) {
    return (Array.isArray(messages) ? messages.slice() : []).sort((a, b) => {
      const aTime = Date.parse(a?.sent_at);
      const bTime = Date.parse(b?.sent_at);
      const aOk = !Number.isNaN(aTime);
      const bOk = !Number.isNaN(bTime);
      if (aOk && bOk) return bTime - aTime;
      if (aOk) return -1;
      if (bOk) return 1;
      return 0;
    });
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
          // Cross-origin frame. The search field, if Priorx owns it, is same-origin.
        }
      }
    }

    try {
      add(startDoc.defaultView?.top?.document);
    } catch {
      // The top frame is cross-origin.
    }
    add(startDoc);
    return docs;
  }

  function viewOf(doc) {
    try {
      return doc.defaultView || globalThis;
    } catch {
      return globalThis;
    }
  }

  function defineKeyCode(event) {
    try {
      Object.defineProperty(event, 'keyCode', { configurable: true, get: () => 114 });
    } catch {
      // Some browsers seal keyCode. The init dictionary may already have set it.
    }
    try {
      Object.defineProperty(event, 'which', { configurable: true, get: () => 114 });
    } catch {
      // Same as keyCode.
    }
    return event;
  }

  function createF3Event(view, type) {
    const Ctor = view?.KeyboardEvent;
    if (typeof Ctor === 'function') {
      try {
        return defineKeyCode(new Ctor(type, {
          key: 'F3',
          code: 'F3',
          keyCode: 114,
          which: 114,
          bubbles: true,
          cancelable: true,
          composed: true,
        }));
      } catch {
        try {
          return defineKeyCode(new Ctor(type, {
            key: 'F3',
            code: 'F3',
            bubbles: true,
            cancelable: true,
            composed: true,
          }));
        } catch {
          // Fall through to a plain event object (tests without KeyboardEvent).
        }
      }
    }
    return {
      type,
      key: 'F3',
      code: 'F3',
      keyCode: 114,
      which: 114,
      bubbles: true,
      cancelable: true,
      composed: true,
      isTrusted: false,
    };
  }

  // One keydown and one keyup on each document. Bubbling reaches that frame's
  // window. Do not also dispatch on the active element, and do not send Enter.
  function dispatchF3(doc) {
    const view = viewOf(doc);
    for (const type of ['keydown', 'keyup']) {
      const event = createF3Event(view, type);
      try {
        doc.dispatchEvent(event);
      } catch {
        // A frame document can reject the event. Try the next document.
      }
    }
  }

  function isSearchCandidate(el) {
    if (!el || el.disabled) return false;
    if (el.getAttribute && el.getAttribute('data-notirx-copy') === '1') return false;
    const tag = String(el.tagName || '').toUpperCase();
    if (tag !== 'INPUT' && tag !== 'TEXTAREA') return false;
    const type = String((el.getAttribute && el.getAttribute('type')) || el.type || 'text').toLowerCase();
    if (tag === 'INPUT' && SKIP_INPUT_TYPES.has(type)) return false;
    if (el.hidden) return false;
    const view = el.ownerDocument && viewOf(el.ownerDocument);
    if (view && typeof view.getComputedStyle === 'function') {
      try {
        const style = view.getComputedStyle(el);
        if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
      } catch {
        // Ignore style lookup failures and keep the element eligible.
      }
    }
    return true;
  }

  function eachCandidate(doc, fn) {
    let list;
    try {
      list = doc.querySelectorAll('input, textarea');
    } catch {
      return;
    }
    for (const el of list) {
      if (isSearchCandidate(el)) fn(el);
    }
  }

  function snapshotSearch(docs) {
    const visible = new Set();
    const active = new Set();
    for (const doc of docs) {
      if (doc.activeElement) active.add(doc.activeElement);
      eachCandidate(doc, (el) => visible.add(el));
    }
    return { visible, active };
  }

  function querySelector(doc, selector) {
    if (!selector || typeof doc.querySelector !== 'function') return null;
    try {
      return doc.querySelector(selector);
    } catch {
      return null;
    }
  }

  function findSearchField(docs, selector, before) {
    // A field F3 just focused is the best signal, including when Priorx ignores
    // the unconfirmed selector below.
    for (const doc of docs) {
      const active = doc.activeElement;
      if (isSearchCandidate(active) && !before.active.has(active)) return active;
    }
    for (const doc of docs) {
      let found = null;
      eachCandidate(doc, (el) => {
        if (!found && !before.visible.has(el)) found = el;
      });
      if (found) return found;
    }
    // Direct fallback: the selector Josi confirms at the pharmacy. The placeholder
    // matches nothing on Priorx until that id is replaced.
    for (const doc of docs) {
      const match = querySelector(doc, selector);
      if (isSearchCandidate(match)) return match;
    }
    return null;
  }

  function nativeValueSetter(el) {
    const view = el.ownerDocument ? viewOf(el.ownerDocument) : globalThis;
    const tag = String(el.tagName || '').toUpperCase();
    const ctor = tag === 'TEXTAREA' ? view.HTMLTextAreaElement : view.HTMLInputElement;
    if (!ctor || !ctor.prototype) return null;
    const desc = Object.getOwnPropertyDescriptor(ctor.prototype, 'value');
    return desc && desc.set ? desc.set : null;
  }

  function bubbleEvent(el, type) {
    const view = el.ownerDocument ? viewOf(el.ownerDocument) : globalThis;
    let event;
    const Ctor = view.Event || globalThis.Event;
    if (typeof Ctor === 'function') {
      try {
        event = new Ctor(type, { bubbles: true });
      } catch {
        event = { type, bubbles: true };
      }
    } else {
      event = { type, bubbles: true };
    }
    el.dispatchEvent(event);
  }

  // Sets the value the way a page script would, then tells listeners.
  // Does not press Enter, blur, or submit.
  function fillInputElement(el, value) {
    if (typeof el.focus === 'function') el.focus();
    const setter = nativeValueSetter(el);
    if (setter) setter.call(el, value);
    else el.value = value;
    bubbleEvent(el, 'input');
    bubbleEvent(el, 'change');
    if (typeof el.select === 'function') {
      try { el.select(); } catch { /* selection is optional */ }
    }
  }

  // Runs in the click turn, before any await, so the browser still treats it as the
  // staff member's click. No clipboard permission is requested.
  function syncCopyText(doc, text) {
    try {
      if (!doc.body || typeof doc.createElement !== 'function' || typeof doc.execCommand !== 'function') {
        return false;
      }
      const area = doc.createElement('textarea');
      area.value = text;
      if (area.setAttribute) {
        area.setAttribute('readonly', '');
        area.setAttribute('data-notirx-copy', '1');
      }
      if (area.style) {
        area.style.position = 'fixed';
        area.style.top = '0';
        area.style.left = '0';
        area.style.opacity = '0';
      }
      doc.body.appendChild(area);
      if (typeof area.focus === 'function') area.focus();
      if (typeof area.select === 'function') area.select();
      const ok = doc.execCommand('copy');
      if (typeof area.remove === 'function') area.remove();
      return Boolean(ok);
    } catch {
      return false;
    }
  }

  async function defaultCopyText(doc, text) {
    if (syncCopyText(doc, text)) return true;
    const view = viewOf(doc);
    try {
      if (view.navigator?.clipboard?.writeText) {
        await view.navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // The page refused the clipboard write.
    }
    return false;
  }

  async function openPatientSearch(doc, phone, options = {}) {
    const digits = phoneDigits(phone);
    if (digits.length < 10) return { filled: false, copied: false, reason: 'no-phone' };

    const selector = options.selector === undefined
      ? PRIORX_PATIENT_SEARCH_SELECTOR
      : options.selector;
    const waitMs = options.waitMs === undefined ? 500 : options.waitMs;
    const sleep = options.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    const copyText = options.copyText || ((text) => defaultCopyText(doc, text));

    const docs = accessibleDocuments(doc);
    const before = snapshotSearch(docs);
    for (const frameDoc of docs) dispatchF3(frameDoc);

    let field = findSearchField(docs, selector, before);
    if (field) {
      fillInputElement(field, digits);
      return { filled: true, copied: false };
    }

    // Copy before the first await so a real click can still reach the clipboard.
    let copied = false;
    try {
      copied = Boolean(await copyText(digits));
    } catch {
      copied = false;
    }

    const deadline = Date.now() + waitMs;
    while (!field && Date.now() < deadline) {
      await sleep(40);
      field = findSearchField(accessibleDocuments(doc), selector, before);
    }

    if (field) {
      fillInputElement(field, digits);
      return { filled: true, copied: false };
    }
    return { filled: false, copied };
  }

  return {
    PRIORX_PATIENT_SEARCH_SELECTOR,
    MESSAGE_TYPE_LABELS,
    phoneDigits,
    maskPhone,
    firstNameFromPatientName,
    messageTypeLabel,
    formatTorontoTime,
    historyEntryTitle,
    sortMessagesNewestFirst,
    openPatientSearch,
    fillInputElement,
    dispatchF3,
    accessibleDocuments,
  };
});
