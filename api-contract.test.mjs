import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  assertSafeRequest,
  confirmationDismiss,
  confirmationsList,
  consentLookup,
  consentSave,
  messagesHistory,
  notifySend,
} from './api-contract.mjs';

const PHONE = '5550100199';

test('consent lookup keeps the phone in the body', () => {
  const req = consentLookup(PHONE);
  assert.equal(req.method, 'POST');
  assert.equal(req.path, '/consent/lookup');
  assert.deepEqual(req.body, { phone_number: PHONE });
  assert.equal(req.path.includes(PHONE), false);
  assertSafeRequest(req.method, req.path);
});

test('consent save, notify, and confirmations use fixed paths', () => {
  const save = consentSave({ phoneNumber: PHONE, consent: 'yes', recordedBy: 'DEMO' });
  assert.equal(save.path, '/consent');
  assert.deepEqual(save.body, {
    phone_number: PHONE,
    consent: 'yes',
    recorded_by: 'DEMO',
  });

  const notify = notifySend({
    phoneNumber: PHONE,
    patientName: 'Alex',
    messageType: 'renewal',
    sentBy: 'DEMO',
  });
  assert.equal(notify.path, '/notify');
  assert.equal(notify.body.message_type, 'renewal');
  assert.equal(notify.body.patient_name, 'Alex');
  assert.equal(notify.body.sent_by, 'DEMO');

  const ready = notifySend({ phoneNumber: PHONE, patientName: 'Alex' });
  assert.equal(ready.body.message_type, 'ready');
  assert.equal(Object.hasOwn(ready.body, 'sent_by'), false);

  const blankSender = notifySend({
    phoneNumber: PHONE,
    patientName: 'Alex',
    messageType: 'ready',
    sentBy: '   ',
  });
  assert.equal(Object.hasOwn(blankSender.body, 'sent_by'), false);

  const history = messagesHistory(PHONE);
  assert.equal(history.method, 'POST');
  assert.equal(history.path, '/messages/history');
  assert.deepEqual(history.body, { phone_number: PHONE });
  assert.equal(history.path.includes(PHONE), false);

  assert.deepEqual(confirmationsList(), {
    method: 'GET',
    path: '/confirmations',
    body: null,
  });

  for (const req of [save, notify, confirmationsList(), history]) {
    assert.equal(req.path.includes(PHONE), false);
    assertSafeRequest(req.method, req.path);
  }
});

test('dismiss puts only an opaque id in the path', () => {
  const req = confirmationDismiss('conf-oui-100');
  assert.equal(req.method, 'POST');
  assert.equal(req.path, '/confirmations/conf-oui-100/dismiss');
  assert.equal(req.body, null);
  assertSafeRequest(req.method, req.path);
  assert.throws(() => confirmationDismiss(''), /Invalid confirmation id/);
  assert.throws(() => confirmationDismiss('a/b'), /Invalid confirmation id/);
  assert.throws(() => confirmationDismiss('5550100199?x=1'), /Invalid confirmation id/);
});

test('phone numbers in the URL are rejected', () => {
  assert.throws(() => assertSafeRequest('GET', `/consent/${PHONE}`), /Blocked API path/);
  assert.throws(() => assertSafeRequest('POST', `/consent/lookup?phone_number=${PHONE}`), /Blocked API path/);
  assert.throws(() => assertSafeRequest('GET', '/consent/lookup'), /Blocked API path/);
  assert.throws(() => assertSafeRequest('POST', '/pharmacy/secret'), /Blocked API path/);
  assert.throws(() => assertSafeRequest('POST', `/messages/${PHONE}/history`), /Blocked API path/);
  assert.throws(() => assertSafeRequest('GET', '/messages/history'), /Blocked API path/);
  assertSafeRequest('POST', '/messages/history');
});

function pngSize(buf) {
  assert.equal(buf.subarray(0, 8).toString('binary'), '\x89PNG\r\n\x1a\n');
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

function chromeMatch(pattern, href) {
  const url = new URL(href);
  const parsed = /^(https|\*):\/\/(\*|\*\.[^/*]+|[^/*]+)(\/.*)$/.exec(pattern);
  assert.ok(parsed, pattern);
  const [, scheme, host, path] = parsed;
  if (scheme !== '*' && `${scheme}:` !== url.protocol) return false;
  if (host === '*') {
    // any host
  } else if (host.startsWith('*.')) {
    const suffix = host.slice(1);
    if (url.hostname === host.slice(2) || !url.hostname.endsWith(suffix)) return false;
  } else if (host !== url.hostname) {
    return false;
  }
  const pathRe = new RegExp(`^${path.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
  return pathRe.test(url.pathname);
}

test('manifest grants only storage and one Priorx HTTPS match', () => {
  const manifest = JSON.parse(readFileSync(new URL('./manifest.json', import.meta.url), 'utf8'));
  const pattern = 'https://4502812786.priorx.ca/*';
  const patientFile = 'https://4502812786.priorx.ca/4502812786.Web/index.aspx?w=Priorx04&c=fr-CA';
  assert.deepEqual(manifest.permissions, ['storage']);
  assert.deepEqual(manifest.host_permissions, [pattern]);
  assert.deepEqual(manifest.content_scripts[0].matches, [pattern]);
  assert.equal(chromeMatch(pattern, patientFile), true);
  assert.equal(chromeMatch(pattern, 'https://9995550100.priorx.ca/9995550100.Web/index.aspx'), false);
  assert.equal(chromeMatch(pattern, 'http://4502812786.priorx.ca/4502812786.Web/index.aspx'), false);
  assert.equal(chromeMatch(pattern, 'https://priorx.ca/4502812786.Web/index.aspx'), false);
  assert.equal(JSON.stringify(manifest).includes('*.priorx.ca'), false);
  assert.equal(JSON.stringify(manifest).includes('FILL-IN-PRIORX-HOST'), false);
  assert.equal(JSON.stringify(manifest).includes('*://*/*'), false);
  assert.equal(JSON.stringify(manifest).includes('alarms'), false);
  assert.equal(manifest.version, '1.3.0');
  assert.deepEqual(manifest.content_scripts[0].js, ['priorx-search.js', 'priorx-lock.js', 'content.js']);
  assert.equal(manifest.minimum_chrome_version, '109');
  assert.equal(manifest.incognito, 'not_allowed');
  assert.equal(manifest.storage.managed_schema, 'managed_schema.json');
  assert.equal(manifest.update_url, undefined);
  assert.equal(manifest.key, undefined);
  assert.ok(manifest.description.length > 0);
  assert.ok(manifest.description.length <= 132, manifest.description.length);
  for (const size of ['16', '48', '128']) {
    assert.equal(manifest.icons[size], `icons/icon${size}.png`);
    assert.deepEqual(
      pngSize(readFileSync(new URL(`./icons/icon${size}.png`, import.meta.url))),
      [Number(size), Number(size)],
    );
  }
});

test('extension source no longer intercepts page requests or reads config.js', () => {
  const background = readFileSync(new URL('./background.js', import.meta.url), 'utf8');
  const content = readFileSync(new URL('./content.js', import.meta.url), 'utf8');
  const testPage = readFileSync(new URL('./test.html', import.meta.url), 'utf8');

  for (const id of ['BA01_LastName', 'BA01_FirstName', 'BA01_Info2', 'LoginName1']) {
    assert.equal(content.includes(`getElementById('${id}')`), true, id);
  }
  assert.equal(content.includes('/4502812786.Web/'), true);
  assert.equal(content.includes('Réponses'), true);
  assert.equal(content.includes('Historique'), true);
  assert.equal(content.includes('Aucun message envoyé pour ce patient.'), true);
  assert.equal(content.includes('Numéro copié — collez-le dans la recherche (F3)'), true);
  assert.equal(content.includes('data-notify-type="ready"'), true);
  assert.equal(content.includes('data-notify-type="partial"'), true);
  assert.equal(content.includes('data-notify-type="new_prescription"'), true);
  assert.equal(content.includes('data-notify-type="renewal"'), true);
  assert.equal(content.includes('Envoyer "commande prête"?'), true);
  assert.equal(content.includes('priorxUnlocked'), true);
  assert.equal(content.includes('notirx-lock-debug'), true);
  assert.equal(content.includes('host.hidden = true'), true);

  assert.equal(background.includes('sentBy: patient.user'), true);
  assert.equal(background.includes('Priorx est verrouillé.'), true);
  assert.equal(background.includes('MESSAGES_HISTORY'), true);
  assert.equal(background.includes("L'historique n'est pas disponible. Mettez à jour le serveur avec cette extension."), true);

  for (const source of [background, content]) {
    assert.equal(source.includes('XMLHttpRequest'), false);
    assert.equal(source.includes('__doPostBack'), false);
    assert.equal(source.includes('X-Pharmacy-Id'), false);
    assert.equal(source.includes('X-Pharmacy-Name'), false);
    assert.equal(source.includes('config.js'), false);
    assert.equal(source.includes('/consent/${'), false);
  }

  for (const leaked of ['Josianne', 'jositr', '438.524.6123', '4385246123', 'Louise-Bernard', 'Beloeil']) {
    assert.equal(testPage.includes(leaked), false, leaked);
  }
  assert.equal(testPage.includes('555-010-0199'), true);
});
