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

test('a guessed language field is read, and an empty guess is skipped', () => {
  const name = el({ id: 'BA01_LastName', text: 'Exemple' });
  const empty = el({ id: 'BA01_Language', text: '   ' });
  const langue = el({ id: 'BA01_Langue', text: ' anglais ' });
  const doc = documentWith([name, empty, langue]);
  assert.equal(language.readPatientLanguage(doc), 'EN');
});

test('the first non-empty guessed field wins', () => {
  const first = el({ id: 'BA01_Language', text: 'FR' });
  const second = el({ id: 'BA01_Langue', text: 'EN' });
  assert.equal(language.readPatientLanguage(documentWith([first, second])), 'FR');
});

test('a select or input value is read', () => {
  const select = el({
    tag: 'SELECT',
    id: 'ddlLangue',
    value: 'EN',
    text: 'EN',
  });
  assert.equal(language.readPatientLanguage(documentWith([select])), 'EN');

  const input = el({ tag: 'INPUT', id: 'txtLangue', value: 'english', text: '' });
  assert.equal(language.readPatientLanguage(documentWith([input])), 'EN');
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
  const lang = el({ id: 'BA01_Langue', text: 'Exemple, Alex' });
  const code = language.readPatientLanguage(documentWith([name, info, lang]));
  assert.equal(code, 'FR');
  assert.equal(JSON.stringify({ language: code }).includes('555'), false);
  assert.equal(JSON.stringify({ language: code }).includes('Exemple'), false);
});
