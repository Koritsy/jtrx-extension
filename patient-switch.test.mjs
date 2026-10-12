import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { JSDOM, VirtualConsole } from 'jsdom';

const ANNE = { last: 'Alpha', first: 'Anne', phone: '555-010-0199', digits: '5550100199' };
const JEAN = { last: 'Untel', first: 'Jean', phone: '555-010-0198', digits: '5550100198' };

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function boot(options = {}) {
  const virtualConsole = new VirtualConsole();
  const logs = [];
  virtualConsole.on('info', (...args) => {
    logs.push(args.map((part) => {
      if (typeof part === 'string') return part;
      try {
        return JSON.stringify(part);
      } catch {
        return String(part);
      }
    }).join(' '));
  });

  const html = `<!DOCTYPE html><html><body>
    <span id="BA01_LastName"></span>
    <span id="BA01_FirstName"></span>
    <span id="BA01_Info2"></span>
    <span id="LoginName1">DEMO</span>
    <span id="BA01_language">(FR)</span>
    <div id="tick"></div>
  </body></html>`;
  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole,
    url: 'https://4502812786.priorx.ca/4502812786.Web/index.aspx',
  });
  const { window } = dom;
  const { document } = window;
  const lookups = [];
  const sends = [];
  const listeners = [];
  let seq = 0;
  let locked = false;
  const store = { lockDebug: options.debug === true, notirxDebug: options.debug === true };
  const consent = {
    5550100199: 'yes',
    5550100198: 'yes',
    5555555555: 'yes',
    ...(options.consent || {}),
  };

  function broadcast(message) {
    for (const listener of listeners) listener(message);
  }

  window.chrome = {
    runtime: {
      id: 'notirx-test',
      lastError: null,
      sendMessage(message, callback) {
        const type = message?.type;
        if (type === 'PATIENT_CHANGED') {
          const patient = message.data || {};
          const ticket = ++seq;
          lookups.push({
            lastName: patient.lastName || '',
            firstName: patient.firstName || '',
            phoneRaw: String(patient.phoneRaw || ''),
            lookupToken: patient.lookupToken,
          });
          const deliver = (state) => {
            if (ticket !== seq) return;
            broadcast({
              type: 'STATE_UPDATE',
              state,
              patient,
              lookupToken: patient.lookupToken,
              phoneRaw: patient.phoneRaw,
              error: state === 'ERROR'
                ? 'Impossible de vérifier le consentement. Réessayez dans un instant.'
                : undefined,
            });
          };
          window.setTimeout(() => deliver('LOADING'), 15);
          window.setTimeout(() => {
            const answer = consent[String(patient.phoneRaw || '')];
            if (answer === 'error') deliver('ERROR');
            else if (answer === 'no') deliver('OPTED_OUT');
            else if (answer === 'yes') deliver('OPTED_IN');
            else deliver('UNKNOWN');
          }, 40);
        } else if (type === 'PATIENT_CLEARED') {
          seq += 1;
        } else if (type === 'NOTIFY_SEND') {
          sends.push({ ...(message.patient || {}) });
        }
        if (typeof callback === 'function') {
          window.setTimeout(() => callback({ ok: true, confirmations: [], messages: [] }), 0);
        }
      },
      onMessage: { addListener(listener) { listeners.push(listener); } },
    },
    storage: {
      local: {
        get(keys, callback) {
          let result = {};
          if (typeof keys === 'string') result = { [keys]: store[keys] };
          else if (Array.isArray(keys)) {
            for (const key of keys) result[key] = store[key];
          } else result = { ...store };
          if (typeof callback === 'function') callback(result);
          return Promise.resolve(result);
        },
        set(values) {
          Object.assign(store, values || {});
          return Promise.resolve();
        },
        remove(key) {
          delete store[key];
          return Promise.resolve();
        },
      },
      onChanged: { addListener() {} },
      managed: { get(_keys, callback) { if (callback) callback({}); return Promise.resolve({}); } },
    },
  };

  const files = [
    'priorx-search.js',
    'priorx-language.js',
    'poll-schedule.js',
    'confirmation-list.js',
    'patient-watch.js',
  ];
  for (const file of files) window.eval(readFileSync(new URL(`./${file}`, import.meta.url), 'utf8'));
  window.NotiRxLock = {
    PRIORX_LOCK_SELECTORS: [],
    DEFAULT_IDLE_LOCK_MINUTES: 60,
    normalizeIdleLockMinutes() { return 60; },
    assessPriorxSession() {
      return { locked, reasons: locked ? ['test'] : [], debug: { locked } };
    },
  };

  let shadow = null;
  const originalAttach = window.Element.prototype.attachShadow;
  window.Element.prototype.attachShadow = function attachShadow() {
    shadow = originalAttach.call(this, { mode: 'open' });
    return shadow;
  };
  window.eval(readFileSync(new URL('./content.js', import.meta.url), 'utf8'));
  if (!shadow) throw new Error('content script did not draw the widget');

  const badViews = [];
  const watch = window.setInterval(() => {
    const view = activeView();
    const optedName = text('oi-name').trim();
    if (view === 'v-opted-in' && !optedName) badViews.push('opted-in-empty-name');
  }, 25);

  function text(id) {
    return shadow.getElementById(id)?.textContent || '';
  }

  function activeView() {
    const node = shadow.querySelector('#patient-views .view.active');
    return node ? node.id : '';
  }

  function setField(id, value) {
    document.getElementById(id).textContent = value;
  }

  function fill(person, info2) {
    setField('BA01_LastName', person.last);
    setField('BA01_FirstName', `, ${person.first}`);
    setField('BA01_Info2', info2 == null ? `${person.phone} - 10 rue Fictive` : info2);
  }

  function clearFile() {
    setField('BA01_LastName', '');
    setField('BA01_FirstName', '');
    setField('BA01_Info2', '');
  }

  async function waitFor(label, predicate, ms = 4000) {
    const started = Date.now();
    while (Date.now() - started < ms) {
      if (predicate()) return;
      await sleep(25);
    }
    throw new Error(
      `${label} timed out. view=${activeView()} oi="${text('oi-name')}" ld="${text('ld-name')}" `
      + `sp="${text('sp-name')}" er="${text('er-name')}" `
      + `lookups=${lookups.map((item) => `${item.lastName}:${item.phoneRaw}`).join('|')}`,
    );
  }

  function close() {
    window.clearInterval(watch);
    window.close();
  }

  return {
    window,
    document,
    shadow,
    lookups,
    sends,
    logs,
    badViews,
    listeners,
    text,
    activeView,
    setField,
    fill,
    clearFile,
    waitFor,
    close,
    broadcast,
    setLocked(value) {
      locked = value;
      document.getElementById('tick').className = `tick-${Math.random().toString(16).slice(2)}`;
    },
  };
}

test('a 4s phone lag does not look up the old number or show the new name as opted-in', async () => {
  const page = boot({ debug: true });
  try {
    page.fill(ANNE);
    await page.waitFor('Anne opted in', () => (
      page.activeView() === 'v-opted-in' && page.text('oi-name').includes('ALPHA')
    ));
    const before = page.lookups.length;
    assert.equal(page.lookups[0].phoneRaw, ANNE.digits);
    assert.equal(page.lookups[0].lastName, 'Alpha');

    page.fill(JEAN, `${ANNE.phone} - 10 rue Fictive`);
    await page.waitFor('verification after the name change', () => (
      page.activeView() === 'v-loading' && page.text('ld-name').includes('Vérification') === false
      && page.shadow.textContent.includes('Vérification')
    ));
    assert.equal(page.text('oi-name').trim(), '');
    assert.notEqual(page.activeView(), 'v-opted-in');

    await sleep(4200);
    assert.equal(page.activeView(), 'v-same-phone');
    assert.match(page.text('btn-same-phone'), /Même numéro — vérifier/);
    assert.match(page.text('sp-name'), /UNTEL/);
    assert.equal(page.text('oi-name').trim(), '');
    const stale = page.lookups.slice(before).filter((item) => (
      item.lastName === 'Untel' || item.phoneRaw === ANNE.digits
    ));
    assert.deepEqual(stale, []);
    assert.equal(page.badViews.length, 0);

    page.setField('BA01_Info2', `${JEAN.phone} - 10 rue Fictive`);
    await page.waitFor('Jean looked up on his own number', () => (
      page.lookups.some((item) => item.lastName === 'Untel' && item.phoneRaw === JEAN.digits)
      && page.activeView() === 'v-opted-in'
      && page.text('oi-name').includes('UNTEL')
    ), 5000);
    assert.equal(
      page.lookups.some((item) => item.lastName === 'Untel' && item.phoneRaw === ANNE.digits),
      false,
    );
    assert.equal(page.badViews.length, 0);

    const patientLogs = page.logs.filter((line) => line.includes('[NotiRx patient]'));
    assert.ok(patientLogs.length > 0);
    assert.equal(patientLogs.some((line) => line.includes(ANNE.digits)), false);
    assert.equal(patientLogs.some((line) => line.includes(JEAN.digits)), false);
    assert.ok(patientLogs.some((line) => line.includes('0199') || line.includes('0198')));
    assert.ok(patientLogs.some((line) => line.includes('"view"') || line.includes('snapshot') || line.includes('lookup')));
  } finally {
    page.close();
  }
});

test('phone-first switch looks up only the new name with the new phone', async () => {
  const page = boot();
  try {
    page.fill(ANNE);
    await page.waitFor('Anne opted in', () => page.activeView() === 'v-opted-in');
    page.setField('BA01_Info2', `${JEAN.phone} - 10 rue Fictive`);
    await sleep(200);
    page.setField('BA01_LastName', JEAN.last);
    await sleep(200);
    page.setField('BA01_FirstName', `, ${JEAN.first}`);
    await page.waitFor('Jean opted in', () => (
      page.activeView() === 'v-opted-in' && page.text('oi-name').includes('UNTEL')
    ), 5000);
    assert.equal(
      page.lookups.some((item) => item.lastName === 'Alpha' && item.phoneRaw === JEAN.digits),
      false,
    );
    assert.ok(page.lookups.some((item) => item.lastName === 'Untel' && item.phoneRaw === JEAN.digits));
    assert.equal(page.badViews.length, 0);
  } finally {
    page.close();
  }
});

test('the same phone on a new name waits for Même numéro — vérifier', async () => {
  const page = boot();
  try {
    page.fill(ANNE);
    await page.waitFor('Anne opted in', () => page.activeView() === 'v-opted-in');
    const before = page.lookups.length;
    page.setField('BA01_LastName', JEAN.last);
    page.setField('BA01_FirstName', `, ${JEAN.first}`);
    await page.waitFor('shared number prompt', () => page.activeView() === 'v-same-phone', 5000);
    assert.equal(page.lookups.length, before);
    assert.equal(page.text('oi-name').trim(), '');
    page.shadow.getElementById('btn-same-phone').click();
    await page.waitFor('explicit verify looked Jean up', () => (
      page.lookups.some((item) => item.lastName === 'Untel' && item.phoneRaw === ANNE.digits)
      && page.activeView() === 'v-opted-in'
      && page.text('oi-name').includes('UNTEL')
    ), 5000);
    assert.equal(page.badViews.length, 0);
  } finally {
    page.close();
  }
});

test('clearing the name leaves no opted-in view, and refilling looks the file up again', async () => {
  const page = boot();
  try {
    page.fill(ANNE);
    await page.waitFor('Anne opted in', () => page.activeView() === 'v-opted-in');
    const token = page.lookups.at(-1).lookupToken;
    page.clearFile();
    await page.waitFor('file cleared', () => page.activeView() === 'v-no-patient', 3000);
    assert.equal(page.text('oi-name').trim(), '');
    assert.notEqual(page.activeView(), 'v-opted-in');
    page.broadcast({
      type: 'STATE_UPDATE',
      state: 'OPTED_IN',
      patient: { lastName: 'Alpha', firstName: 'Anne', phoneRaw: ANNE.digits },
      phoneRaw: ANNE.digits,
      lookupToken: token,
    });
    await sleep(50);
    assert.notEqual(page.activeView(), 'v-opted-in');
    page.fill(ANNE);
    await page.waitFor('Anne restored', () => (
      page.activeView() === 'v-opted-in' && page.text('oi-name').includes('ALPHA')
    ), 5000);
    assert.ok(page.lookups.filter((item) => item.phoneRaw === ANNE.digits).length >= 2);
    assert.equal(page.badViews.length, 0);
  } finally {
    page.close();
  }
});

test('a non-DSQ Info2 value yields the phone and not the city text', async () => {
  const page = boot();
  try {
    page.fill(
      { last: 'Untel', first: 'Jean', phone: '555.555.5555' },
      '555.555.5555, Quebec',
    );
    await page.waitFor('non-DSQ lookup', () => (
      page.lookups.some((item) => item.lastName === 'Untel' && item.phoneRaw === '5555555555')
    ), 4000);
    assert.equal(page.lookups.some((item) => String(item.phoneRaw).includes('Quebec')), false);
    assert.match(page.text('oi-name') + page.text('ld-name') + page.text('up-name'), /UNTEL/);
  } finally {
    page.close();
  }
});

test('the error view shows the patient name', async () => {
  const page = boot();
  try {
    page.fill(ANNE);
    await page.waitFor('Anne opted in', () => page.activeView() === 'v-opted-in');
    const latest = page.lookups.at(-1);
    page.broadcast({
      type: 'STATE_UPDATE',
      state: 'ERROR',
      error: 'Impossible de vérifier le consentement. Réessayez dans un instant.',
      patient: {
        lastName: latest.lastName,
        firstName: latest.firstName,
        phoneRaw: latest.phoneRaw,
      },
      phoneRaw: latest.phoneRaw,
      lookupToken: latest.lookupToken,
    });
    await page.waitFor('error view', () => page.activeView() === 'v-error');
    assert.match(page.text('er-name'), /ALPHA/);
    assert.match(page.text('er-name'), /Anne/);
    assert.match(page.text('err-msg'), /Impossible de vérifier/);
  } finally {
    page.close();
  }
});

test('a lock flicker never leaves an opted-in view with an empty name', async () => {
  const page = boot();
  try {
    page.fill(ANNE);
    await page.waitFor('Anne opted in', () => page.activeView() === 'v-opted-in');
    page.setLocked(true);
    await page.waitFor('locked to a blank patient view', () => (
      page.activeView() === 'v-no-patient' || page.activeView() === 'v-loading'
    ), 2000);
    assert.equal(page.text('oi-name').trim(), '');
    assert.notEqual(page.activeView(), 'v-opted-in');
    page.clearFile();
    await sleep(80);
    page.fill(JEAN);
    await sleep(80);
    page.setLocked(false);
    await page.waitFor('Jean after unlock', () => (
      page.activeView() === 'v-opted-in' && page.text('oi-name').includes('UNTEL')
    ), 6000);
    assert.equal(page.text('oi-name').includes('ALPHA'), false);
    assert.ok(page.lookups.some((item) => item.lastName === 'Untel' && item.phoneRaw === JEAN.digits));
    assert.equal(page.badViews.length, 0);
  } finally {
    page.close();
  }
});

test('a late lookup and a send are dropped when the live file no longer matches', async () => {
  const page = boot();
  try {
    page.fill(ANNE);
    await page.waitFor('Anne opted in', () => page.activeView() === 'v-opted-in');
    const latest = page.lookups.at(-1);
    page.shadow.querySelector('[data-notify-type="ready"]').click();
    page.setField('BA01_LastName', JEAN.last);
    page.setField('BA01_FirstName', `, ${JEAN.first}`);
    page.setField('BA01_Info2', `${JEAN.phone} - 10 rue Fictive`);
    page.broadcast({
      type: 'STATE_UPDATE',
      state: 'OPTED_IN',
      patient: { lastName: 'Alpha', firstName: 'Anne', phoneRaw: ANNE.digits },
      phoneRaw: ANNE.digits,
      lookupToken: latest.lookupToken,
    });
    page.shadow.getElementById('btn-send-yes').click();
    await sleep(30);
    assert.equal(page.sends.length, 0);
    assert.equal(page.text('oi-name').includes('UNTEL') && page.activeView() === 'v-opted-in', false);
    await page.waitFor('restarted on Jean', () => (
      page.lookups.some((item) => item.lastName === 'Untel' && item.phoneRaw === JEAN.digits)
    ), 5000);
    assert.equal(page.sends.length, 0);
    assert.equal(page.badViews.length, 0);
  } finally {
    page.close();
  }
});
