import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  assertSafeRequest,
  confirmationDismiss,
  confirmationsList,
  consentLookup,
  consentSave,
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
  });
  assert.equal(notify.path, '/notify');
  assert.equal(notify.body.message_type, 'renewal');
  assert.equal(notify.body.patient_name, 'Alex');

  const ready = notifySend({ phoneNumber: PHONE, patientName: 'Alex' });
  assert.equal(ready.body.message_type, 'ready');

  assert.deepEqual(confirmationsList(), {
    method: 'GET',
    path: '/confirmations',
    body: null,
  });

  for (const req of [save, notify, confirmationsList()]) {
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
});

test('manifest grants only storage and one Priorx HTTPS match', () => {
  const manifest = JSON.parse(readFileSync(new URL('./manifest.json', import.meta.url), 'utf8'));
  const pattern = 'https://FILL-IN-PRIORX-HOST.example/*index.aspx*';
  assert.deepEqual(manifest.permissions, ['storage']);
  assert.deepEqual(manifest.host_permissions, [pattern]);
  assert.deepEqual(manifest.content_scripts[0].matches, [pattern]);
  assert.equal(JSON.stringify(manifest).includes('*://*/*'), false);
  assert.equal(JSON.stringify(manifest).includes('alarms'), false);
  assert.equal(manifest.version, '1.1.0');
});

test('extension source no longer intercepts page requests or reads config.js', () => {
  const background = readFileSync(new URL('./background.js', import.meta.url), 'utf8');
  const content = readFileSync(new URL('./content.js', import.meta.url), 'utf8');
  const testPage = readFileSync(new URL('./test.html', import.meta.url), 'utf8');

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
