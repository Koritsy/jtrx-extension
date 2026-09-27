import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const lock = require('./priorx-lock.js');

function createDocument() {
  const elements = [];
  const doc = {
    elements,
    activeElement: null,
    hit: null,
    documentElement: null,
    body: null,
    defaultView: null,
    getElementById(id) {
      return elements.find((el) => el.id === id) || null;
    },
    querySelectorAll(selector) {
      return elements.filter((el) => matches(el, selector));
    },
    elementFromPoint() {
      return this.hit;
    },
  };
  doc.documentElement = { clientWidth: 1000, clientHeight: 800, tagName: 'HTML', parentElement: null };
  doc.body = { tagName: 'BODY', parentElement: doc.documentElement, ownerDocument: doc };
  doc.defaultView = {
    document: doc,
    innerWidth: 1000,
    innerHeight: 800,
    top: null,
    getComputedStyle(el) {
      return {
        display: el.hidden ? 'none' : (el._style.display || 'block'),
        visibility: el._style.visibility || 'visible',
        opacity: el._style.opacity == null ? '1' : String(el._style.opacity),
        position: el._style.position || 'static',
      };
    },
  };
  doc.defaultView.top = doc.defaultView;

  function matches(el, selector) {
    return String(selector).split(',').some((part) => {
      const token = part.trim();
      if (token.startsWith('#')) return el.id === token.slice(1);
      if (token === 'input') return el.tagName === 'INPUT';
      if (token === 'iframe' || token === 'frame') return el.tagName === token.toUpperCase();
      if (token === '[role="dialog"]') return el.getAttribute('role') === 'dialog';
      if (token === '[aria-modal="true"]') return el.getAttribute('aria-modal') === 'true';
      if (token === '[data-notirx-lock-screen]') return el.attrs['data-notirx-lock-screen'] != null;
      return false;
    });
  }

  doc.add = function add(props = {}) {
    const el = {
      tagName: props.tag || 'DIV',
      id: props.id || '',
      className: props.className || '',
      name: props.name || '',
      type: props.type || '',
      hidden: Boolean(props.hidden),
      textContent: props.text || '',
      value: props.value || '',
      attrs: { ...(props.attrs || {}) },
      _style: { ...(props.style || {}) },
      rect: props.rect || { left: 0, top: 0, right: 40, bottom: 20, width: 40, height: 20 },
      parentElement: props.parent || doc.body,
      ownerDocument: doc,
      getAttribute(name) {
        if (name === 'type') return this.type || null;
        if (name === 'class') return this.className || null;
        return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null;
      },
      getBoundingClientRect() {
        return this.rect;
      },
      contains(other) {
        let node = other;
        while (node) {
          if (node === this) return true;
          node = node.parentElement;
        }
        return false;
      },
      closest() {
        return null;
      },
      querySelectorAll(selector) {
        const found = [];
        for (const candidate of elements) {
          let node = candidate;
          let inside = false;
          while (node) {
            if (node === this) {
              inside = true;
              break;
            }
            node = node.parentElement;
          }
          if (inside && candidate !== this && matches(candidate, selector)) found.push(candidate);
        }
        return found;
      },
    };
    elements.push(el);
    return el;
  };

  return doc;
}

function signedIn(doc, props = {}) {
  doc.add({ id: 'LoginName1', tag: 'DIV', text: props.user == null ? 'DEMO' : props.user, ...props.login });
  const patient = doc.add({
    id: 'BA01_LastName',
    tag: 'DIV',
    text: 'Exemple',
    rect: { left: 10, top: 10, right: 120, bottom: 30, width: 110, height: 20 },
    ...(props.patient || {}),
  });
  doc.hit = patient;
  return patient;
}

test('idle minutes stay inside 1 to 120 and default to 10', () => {
  assert.equal(lock.DEFAULT_IDLE_LOCK_MINUTES, 10);
  assert.equal(lock.normalizeIdleLockMinutes(10), 10);
  assert.equal(lock.normalizeIdleLockMinutes('15'), 15);
  assert.equal(lock.normalizeIdleLockMinutes(''), 10);
  assert.equal(lock.normalizeIdleLockMinutes(0), 10);
  assert.equal(lock.normalizeIdleLockMinutes(121), 10);
  assert.equal(lock.normalizeIdleLockMinutes(10.5), 10);
  assert.ok(lock.PRIORX_LOCK_SELECTORS.includes('#PRIORX_LOCK_OVERLAY_ID_UNCONFIRMED'));
});

test('a visible signed-in patient file is not locked', () => {
  const doc = createDocument();
  signedIn(doc);
  const result = lock.assessPriorxSession(doc);
  assert.equal(result.locked, false);
  assert.deepEqual(result.reasons, []);
});

test('missing, empty, or hidden login locks and does not copy the phone', () => {
  const missing = createDocument();
  signedIn(missing);
  const loginIndex = missing.elements.findIndex((el) => el.id === 'LoginName1');
  missing.elements.splice(loginIndex, 1);
  assert.equal(lock.assessPriorxSession(missing).reasons.includes('login-missing'), true);

  const empty = createDocument();
  signedIn(empty, { user: '   ' });
  assert.equal(lock.assessPriorxSession(empty).reasons.includes('login-empty'), true);

  const hidden = createDocument();
  signedIn(hidden, { login: { hidden: true, text: 'DEMO' } });
  const phone = hidden.add({ id: 'BA01_Info2', text: '555-010-0199 - 100 rue Fictive' });
  const result = lock.assessPriorxSession(hidden);
  assert.equal(result.reasons.includes('login-hidden'), true);
  assert.equal(JSON.stringify(result.debug).includes('5550100199'), false);
  assert.equal(JSON.stringify(result.debug).includes(phone.textContent), false);
});

test('a hidden patient name locks', () => {
  const doc = createDocument();
  signedIn(doc, { patient: { hidden: true } });
  assert.equal(lock.assessPriorxSession(doc).reasons.includes('patient-hidden'), true);
});

test('the unconfirmed lock selector locks only while that element is visible', () => {
  const doc = createDocument();
  signedIn(doc);
  const overlay = doc.add({
    id: 'PRIORX_LOCK_OVERLAY_ID_UNCONFIRMED',
    hidden: true,
    rect: { left: 0, top: 0, right: 1000, bottom: 800, width: 1000, height: 800 },
  });
  assert.equal(lock.assessPriorxSession(doc).locked, false);
  overlay.hidden = false;
  const result = lock.assessPriorxSession(doc);
  assert.equal(result.reasons.includes('lock-selector'), true);
  assert.equal(result.debug.matchedSelectors.includes('#PRIORX_LOCK_OVERLAY_ID_UNCONFIRMED'), true);
});

test('a visible password field locks even without a known id', () => {
  const doc = createDocument();
  signedIn(doc);
  doc.add({
    id: 'mystery-nip',
    tag: 'INPUT',
    type: 'password',
    rect: { left: 400, top: 300, right: 560, bottom: 330, width: 160, height: 30 },
  });
  const result = lock.assessPriorxSession(doc);
  assert.equal(result.locked, true);
  assert.equal(result.reasons.includes('credential-field'), true);
  assert.equal(result.debug.credentialField.id, 'mystery-nip');
  assert.equal(Object.hasOwn(result.debug.credentialField, 'value'), false);
});

test('a large layer covering the patient name locks; a small one does not', () => {
  const doc = createDocument();
  signedIn(doc);
  const menu = doc.add({
    id: 'small-menu',
    rect: { left: 10, top: 10, right: 80, bottom: 40, width: 70, height: 30 },
  });
  doc.hit = menu;
  assert.equal(lock.assessPriorxSession(doc).locked, false);

  const cover = doc.add({
    id: 'full-cover',
    rect: { left: 0, top: 0, right: 1000, bottom: 800, width: 1000, height: 800 },
  });
  doc.hit = cover;
  assert.equal(lock.assessPriorxSession(doc).reasons.includes('patient-covered'), true);
});

test('a large dialog locks and a clock class does not', () => {
  const doc = createDocument();
  signedIn(doc);
  doc.add({
    id: 'clock',
    className: 'clock',
    rect: { left: 0, top: 0, right: 80, bottom: 40, width: 80, height: 40 },
  });
  assert.equal(lock.assessPriorxSession(doc).locked, false);

  doc.add({
    id: 'nip-dialog',
    attrs: { role: 'dialog', 'aria-modal': 'true' },
    rect: { left: 50, top: 50, right: 950, bottom: 750, width: 900, height: 700 },
  });
  assert.equal(lock.assessPriorxSession(doc).reasons.includes('lock-overlay'), true);
});

test('a password field inside a same-origin frame locks', () => {
  const parent = createDocument();
  signedIn(parent);
  const child = createDocument();
  child.add({ tag: 'INPUT', type: 'password', id: 'frame-nip' });
  const frame = parent.add({ tag: 'IFRAME' });
  frame.contentDocument = child;
  parent.querySelectorAll = function query(selector) {
    const own = parent.elements.filter((el) => {
      const token = String(selector).split(',')[0].trim();
      if (token === 'iframe' || token === 'frame') return el.tagName === 'IFRAME' || el.tagName === 'FRAME';
      return false;
    });
    if (String(selector).includes('iframe') || String(selector).includes('frame')) return own;
    return parent.elements.filter((el) => {
      return String(selector).split(',').some((part) => {
        const token = part.trim();
        if (token.startsWith('#')) return el.id === token.slice(1);
        if (token === 'input') return el.tagName === 'INPUT';
        if (token === '[role="dialog"]') return el.getAttribute('role') === 'dialog';
        if (token === '[aria-modal="true"]') return el.getAttribute('aria-modal') === 'true';
        return false;
      });
    });
  };
  const result = lock.assessPriorxSession(parent);
  assert.equal(result.reasons.includes('credential-field'), true);
  assert.equal(result.debug.credentialField.id, 'frame-nip');
});

test('a fixed layer over the viewport locks even if the patient name is scrolled away', () => {
  const doc = createDocument();
  signedIn(doc, {
    patient: { rect: { left: 10, top: 2400, right: 120, bottom: 2420, width: 110, height: 20 } },
  });
  const cover = doc.add({
    id: 'full-cover',
    style: { position: 'fixed' },
    rect: { left: 0, top: 0, right: 1000, bottom: 800, width: 1000, height: 800 },
  });
  doc.elementFromPoint = (x, y) => (y >= 0 && y <= 800 ? cover : null);
  const result = lock.assessPriorxSession(doc);
  assert.equal(result.reasons.includes('viewport-covered'), true);
  assert.equal(result.debug.overlay.id, 'full-cover');
});

test('extension idle locks a session that otherwise looks open', () => {
  const doc = createDocument();
  signedIn(doc);
  const result = lock.assessPriorxSession(doc, { idleExpired: true });
  assert.deepEqual(result.reasons, ['idle']);
  assert.equal(result.locked, true);
});
