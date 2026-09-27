import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const require = createRequire(import.meta.url);
const search = require('./priorx-search.js');

function createDocument() {
  const elements = [];
  const doc = {
    events: [],
    listeners: {},
    activeElement: null,
    elements,
    querySelector(selector) {
      if (typeof selector === 'string' && selector.startsWith('#')) {
        const id = selector.slice(1);
        return elements.find((el) => el.id === id) || null;
      }
      return null;
    },
    querySelectorAll(selector) {
      const tags = String(selector).split(',').map((part) => part.trim().toUpperCase());
      return elements.filter((el) => tags.includes(el.tagName));
    },
    dispatchEvent(event) {
      this.events.push(event);
      for (const fn of this.listeners[event.type] || []) fn(event);
      return true;
    },
    addEventListener(type, fn) {
      (this.listeners[type] ||= []).push(fn);
    },
    createElement(tag) {
      return {
        tagName: String(tag).toUpperCase(),
        value: '',
        style: {},
        setAttribute() {},
        select() {},
        remove() {},
      };
    },
    execCommand() {
      return false;
    },
  };

  doc.body = { tagName: 'BODY', appendChild() {} };
  const view = {
    document: doc,
    getComputedStyle(el) {
      return {
        display: el.hidden ? 'none' : 'block',
        visibility: 'visible',
      };
    },
    HTMLInputElement: function HTMLInputElement() {},
    HTMLTextAreaElement: function HTMLTextAreaElement() {},
    navigator: {},
  };
  view.top = view;
  Object.defineProperty(view.HTMLInputElement.prototype, 'value', {
    configurable: true,
    set(value) {
      this.usedNativeSetter = true;
      this.nativeValue = value;
    },
    get() {
      return this.nativeValue;
    },
  });
  doc.defaultView = view;

  doc.addInput = function addInput(props = {}) {
    const el = {
      tagName: 'INPUT',
      type: props.type || 'text',
      id: props.id || '',
      hidden: Boolean(props.hidden),
      disabled: false,
      value: '',
      usedNativeSetter: false,
      nativeValue: undefined,
      events: [],
      ownerDocument: doc,
      getAttribute(name) {
        return name === 'type' ? this.type : null;
      },
      focus() {
        doc.activeElement = this;
      },
      select() {},
      dispatchEvent(event) {
        this.events.push(event);
        return true;
      },
    };
    elements.push(el);
    return el;
  };

  return doc;
}

function quietOptions(extra = {}) {
  return {
    waitMs: 0,
    sleep: async () => {},
    copyText: async () => false,
    ...extra,
  };
}

test('labels, mask, first name, Toronto time, and history order', () => {
  assert.equal(search.maskPhone('5550100199'), '***-***-0199');
  assert.equal(search.maskPhone('555-010-0199'), '***-***-0199');
  assert.equal(search.firstNameFromPatientName('Exemple, Alex'), 'Alex');
  assert.equal(search.firstNameFromPatientName('Alex Exemple'), 'Alex');
  assert.equal(search.firstNameFromPatientName('Alex'), 'Alex');
  assert.equal(search.firstNameFromPatientName(''), 'Patient');
  assert.equal(search.messageTypeLabel('ready'), 'commande prête');
  assert.equal(search.messageTypeLabel('partial'), 'médicaments en commande');
  assert.equal(search.messageTypeLabel('new_prescription'), 'nouvelle prescription reçue');
  assert.equal(search.messageTypeLabel('renewal'), 'ordonnances dues');
  assert.equal(search.messageTypeLabel(null), '');

  const winter = search.formatTorontoTime('2026-01-15T18:30:00.000Z');
  const summer = search.formatTorontoTime('2026-07-15T18:30:00.000Z');
  assert.match(winter, /2026-01-15/);
  assert.match(winter, /13:30|13 h 30/);
  assert.match(summer, /2026-07-15/);
  assert.match(summer, /14:30|14 h 30/);

  assert.equal(
    search.historyEntryTitle({ direction: 'in', reply_keyword: 'OUI', message_type: 'renewal' }),
    'Réponse OUI · ordonnances dues',
  );
  assert.equal(search.historyEntryTitle({ direction: 'out', message_type: 'ready' }), 'commande prête');

  const sorted = search.sortMessagesNewestFirst([
    { sent_at: '2026-01-01T00:00:00.000Z', message_type: 'ready' },
    { sent_at: '2026-03-01T00:00:00.000Z', message_type: 'partial' },
  ]);
  assert.equal(sorted[0].message_type, 'partial');
  assert.equal(sorted[1].message_type, 'ready');
});

test('F3 focuses a hidden search field and fills it without Enter', async () => {
  const doc = createDocument();
  const field = doc.addInput({ id: 'priorx-f3-search', hidden: true });
  doc.addEventListener('keydown', (event) => {
    assert.equal(event.key, 'F3');
    assert.equal(event.code, 'F3');
    assert.equal(event.keyCode, 114);
    field.hidden = false;
    field.focus();
  });

  let copied = false;
  const result = await search.openPatientSearch(doc, '555-010-0199', quietOptions({
    copyText: async () => {
      copied = true;
      return true;
    },
  }));

  assert.equal(result.filled, true);
  assert.equal(result.copied, false);
  assert.equal(copied, false);
  assert.equal(field.usedNativeSetter, true);
  assert.equal(field.nativeValue, '5550100199');
  assert.deepEqual(field.events.map((event) => event.type), ['input', 'change']);
  assert.deepEqual(doc.events.map((event) => event.type || 'keydown'), ['keydown', 'keyup']);
  assert.equal(doc.events.some((event) => event.key === 'Enter' || event.keyCode === 13), false);
});

test('a field that was already focused is not overwritten when F3 does nothing', async () => {
  const doc = createDocument();
  const notes = doc.addInput({ id: 'notes' });
  notes.focus();

  const result = await search.openPatientSearch(doc, '5550100199', quietOptions({
    selector: '',
    copyText: async () => true,
  }));

  assert.equal(result.filled, false);
  assert.equal(result.copied, true);
  assert.equal(notes.usedNativeSetter, false);
  assert.equal(doc.events.length, 2);
});

test('the named selector is the fallback when F3 is ignored', async () => {
  const doc = createDocument();
  const field = doc.addInput({ id: 'PRIORX_SEARCH_FIELD_ID_UNCONFIRMED' });
  doc.addEventListener('keydown', () => {});

  const result = await search.openPatientSearch(doc, '5550100199', quietOptions());

  assert.equal(search.PRIORX_PATIENT_SEARCH_SELECTOR, '#PRIORX_SEARCH_FIELD_ID_UNCONFIRMED');
  assert.equal(result.filled, true);
  assert.equal(field.nativeValue, '5550100199');
  assert.equal(field.events.some((event) => event.key === 'Enter'), false);
});

test('F3 inside a same-origin frame fills that frame’s search field', async () => {
  const parent = createDocument();
  const child = createDocument();
  parent.elements.push({ tagName: 'IFRAME', contentDocument: child });
  const field = child.addInput({ id: 'frame-search', hidden: true });
  child.addEventListener('keydown', (event) => {
    assert.equal(event.key, 'F3');
    assert.equal(event.keyCode, 114);
    field.hidden = false;
    field.focus();
  });

  const result = await search.openPatientSearch(parent, '5550100199', quietOptions());

  assert.equal(result.filled, true);
  assert.equal(field.nativeValue, '5550100199');
  assert.equal(parent.events.filter((event) => event.key === 'F3').length, 2);
  assert.equal(child.events.filter((event) => event.key === 'F3').length, 2);
});

test('a late search field is filled after a short wait, and a short number is refused', async () => {
  const doc = createDocument();
  const field = doc.addInput({ id: 'late-search', hidden: true });
  let polls = 0;
  const result = await search.openPatientSearch(doc, '5550100199', {
    waitMs: 200,
    selector: '',
    sleep: async () => {
      polls += 1;
      if (polls === 1) {
        field.hidden = false;
        field.focus();
      }
    },
    copyText: async () => false,
  });
  assert.equal(result.filled, true);
  assert.equal(field.nativeValue, '5550100199');

  const refused = await search.openPatientSearch(doc, '123', quietOptions());
  assert.deepEqual(refused, { filled: false, copied: false, reason: 'no-phone' });
});

test('search source does not send Enter', () => {
  const source = readFileSync(new URL('./priorx-search.js', import.meta.url), 'utf8');
  assert.equal(source.includes("key: 'Enter'"), false);
  assert.equal(source.includes('keyCode: 13'), false);
  assert.equal(source.includes('PRIORX_PATIENT_SEARCH_SELECTOR'), true);
});
