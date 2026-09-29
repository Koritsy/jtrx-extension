import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const language = require('./priorx-language.js');

function el(props = {}) {
  const node = {
    tagName: props.tag || 'DIV',
    id: props.id || '',
    textContent: props.text == null ? '' : props.text,
    value: props.value,
    selectedOptions: props.selectedOptions || null,
    parentElement: null,
    previousElementSibling: null,
    nextElementSibling: null,
    children: [],
  };
  if (props.children) {
    for (const child of props.children) {
      child.parentElement = node;
      node.children.push(child);
    }
    linkSiblings(node.children);
  }
  return node;
}

function linkSiblings(children) {
  for (let i = 0; i < children.length; i += 1) {
    children[i].previousElementSibling = children[i - 1] || null;
    children[i].nextElementSibling = children[i + 1] || null;
  }
}

function documentWith(nodes) {
  const all = [];
  function walk(node) {
    all.push(node);
    for (const child of node.children || []) walk(child);
  }
  for (const node of nodes) walk(node);
  return {
    getElementById(id) {
      return all.find((node) => node.id === id) || null;
    },
    querySelector(selector) {
      if (!selector.startsWith('#')) return null;
      return this.getElementById(selector.slice(1));
    },
  };
}

test('english tokens become EN and everything else becomes FR', () => {
  for (const raw of ['EN', 'en', ' En ', 'ENG', 'anglais', 'ANGLAIS', 'English']) {
    assert.equal(language.normalizePatientLanguage(raw), 'EN', raw);
  }
  for (const raw of ['', '   ', 'FR', 'fr', 'FRA', 'francais', 'FRANÇAIS', 'ES', '1', null, undefined]) {
    assert.equal(language.normalizePatientLanguage(raw), 'FR', String(raw));
  }
});

test('#BA01_language text is read, and the wrong capital letter is ignored', () => {
  const name = el({ id: 'BA01_LastName', text: 'Exemple' });
  const wrongCase = el({ id: 'BA01_Language', text: 'EN' });
  assert.equal(language.readPatientLanguage(documentWith([name, wrongCase])), 'FR');
  assert.deepEqual(language.PRIORX_LANGUAGE_SELECTORS, ['#BA01_language']);

  const langue = el({ id: 'BA01_language', text: ' anglais ' });
  assert.equal(language.readPatientLanguage(documentWith([name, wrongCase, langue])), 'EN');
});

test('an empty language span is skipped for a nearby FR or EN label', () => {
  const name = el({ id: 'BA01_LastName', text: 'Exemple' });
  const empty = el({ id: 'BA01_language', text: '   ' });
  const lang = el({ text: 'EN' });
  const parent = el({ children: [name, empty, lang] });
  assert.equal(language.readPatientLanguage(documentWith([parent])), 'EN');
});

test('the language span text is read', () => {
  const english = el({ tag: 'SPAN', id: 'BA01_language', text: 'ENG' });
  assert.equal(language.readPatientLanguage(documentWith([english])), 'EN');
  const french = el({ tag: 'SPAN', id: 'BA01_language', text: 'FR' });
  assert.equal(language.readPatientLanguage(documentWith([french])), 'FR');
});

test('a small FR or EN field next to the name is used when no id matches', () => {
  const name = el({ id: 'BA01_LastName', text: 'Exemple' });
  const lang = el({ text: 'EN' });
  const parent = el({ children: [name, lang] });
  assert.equal(language.readPatientLanguage(documentWith([parent])), 'EN');
});

test('nearby text that is not exactly FR or EN does not count as English', () => {
  const name = el({ id: 'BA01_LastName', text: 'Exemple' });
  const note = el({ text: 'ENGLISH' });
  const parent = el({ children: [name, note] });
  assert.equal(language.readPatientLanguage(documentWith([parent])), 'FR');
});

test('a missing or unreadable language falls back to FR', () => {
  assert.equal(language.readPatientLanguage(documentWith([])), 'FR');
  assert.equal(language.readPatientLanguage(null), 'FR');

  const broken = {
    getElementById() {
      throw new Error('unreadable');
    },
    querySelector() {
      throw new Error('unreadable');
    },
  };
  assert.equal(language.readPatientLanguage(broken), 'FR');
});

test('the language result is only FR or EN', () => {
  const name = el({ id: 'BA01_LastName', text: 'Exemple' });
  const info = el({ id: 'BA01_Info2', text: '555-010-0199 - 100 rue Fictive' });
  const lang = el({ id: 'BA01_language', text: 'Exemple, Alex' });
  const code = language.readPatientLanguage(documentWith([name, info, lang]));
  assert.equal(code, 'FR');
  assert.equal(JSON.stringify({ language: code }).includes('555'), false);
  assert.equal(JSON.stringify({ language: code }).includes('Exemple'), false);
});
