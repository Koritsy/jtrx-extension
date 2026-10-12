import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { phoneBlockedMessage as phoneBlockedFromNotify } from './notify-errors.mjs';

const require = createRequire(import.meta.url);
const patient = require('./patient-watch.js');

function person(lastName, firstName, phoneRaw, language = 'FR') {
  return { lastName, firstName, phoneRaw, user: 'DEMO', language };
}

function docWith(fields) {
  const nodes = {};
  for (const [id, text] of Object.entries(fields)) {
    nodes[id] = { tagName: 'SPAN', id, textContent: text, value: '' };
  }
  return {
    getElementById(id) {
      return nodes[id] || null;
    },
    setText(id, text) {
      if (!nodes[id]) nodes[id] = { tagName: 'SPAN', id, textContent: '', value: '' };
      nodes[id].textContent = text;
    },
  };
}

test('slow DOM fill keeps the new name and does not look up the previous phone', () => {
  const gate = patient.createPatientGate({ stableMs: 100, phoneLagMs: 500 });
  const doc = docWith({
    BA01_LastName: 'Alpha',
    BA01_FirstName: 'Anne',
    BA01_Info2: '450-555-0100 - 1 rue Test',
    LoginName1: 'DEMO',
  });
  const read = () => patient.readPatientFields(doc, () => 'FR');

  let view = gate.note(read(), 0);
  assert.equal(view.mode, 'settling');
  assert.equal(view.allowsActions, false);
  assert.equal(view.startLookup, false);

  view = gate.note(read(), 100);
  assert.equal(view.startLookup, true);
  assert.equal(view.patient.phoneRaw, '4505550100');
  assert.equal(view.patient.lastName, 'Alpha');
  const tokenA = view.lookupToken;
  gate.markLookupQueued(tokenA);
  assert.equal(gate.acceptLookup({
    lookupToken: tokenA,
    phoneRaw: '4505550100',
    state: 'OPTED_IN',
  }).ok, true);
  assert.equal(gate.current().mode, 'settled');

  // Priorx writes the new last name first. The old phone is still on screen.
  doc.setText('BA01_LastName', 'Beta');
  doc.setText('BA01_FirstName', '');
  view = gate.note(read(), 150);
  assert.equal(view.mode, 'settling');
  assert.equal(view.allowsActions, false);
  assert.equal(view.startLookup, false);
  assert.equal(view.patient.lastName, 'Beta');
  assert.equal(gate.acceptLookup({
    lookupToken: tokenA,
    phoneRaw: '4505550100',
    state: 'OPTED_IN',
  }).ok, false);

  // First name arrives, phone still the previous file.
  doc.setText('BA01_FirstName', 'Bob');
  view = gate.note(read(), 180);
  assert.equal(view.mode, 'settling');
  assert.equal(view.patient.firstName, 'Bob');
  assert.equal(view.startLookup, false);

  // A late reply for Alpha must not unlock send buttons.
  assert.equal(gate.acceptLookup({
    lookupToken: tokenA,
    phoneRaw: '4505550100',
    state: 'OPTED_IN',
  }).ok, false);

  // Phone finally catches up.
  doc.setText('BA01_Info2', '514-555-0199 - 2 rue Test');
  view = gate.note(read(), 400);
  assert.equal(view.mode, 'settling');
  assert.equal(view.patient.phoneRaw, '5145550199');
  assert.equal(view.startLookup, false);

  view = gate.note(read(), 500);
  assert.equal(view.startLookup, true);
  assert.equal(view.allowsActions, false);
  assert.equal(view.patient.lastName, 'Beta');
  assert.equal(view.patient.phoneRaw, '5145550199');
  const tokenB = view.lookupToken;
  assert.notEqual(tokenB, tokenA);

  // The slower Alpha reply arrives after Beta's lookup was sent.
  assert.equal(gate.acceptLookup({
    lookupToken: tokenA,
    phoneRaw: '4505550100',
    state: 'OPTED_IN',
  }).ok, false);
  assert.equal(gate.current().mode, 'awaiting');

  const accepted = gate.acceptLookup({
    lookupToken: tokenB,
    phoneRaw: '5145550199',
    state: 'UNKNOWN',
  });
  assert.equal(accepted.ok, true);
  assert.equal(accepted.patient.lastName, 'Beta');
  assert.equal(gate.current().mode, 'settled');

  // An older Beta duplicate, then Alpha again, cannot replace it.
  assert.equal(gate.acceptLookup({
    lookupToken: tokenA,
    phoneRaw: '5145550199',
    state: 'OPTED_IN',
  }).ok, false);
});

test('out-of-order lookups apply only the token for the phone on screen', () => {
  const gate = patient.createPatientGate({ stableMs: 10, phoneLagMs: 10 });
  const first = gate.note(person('Un', 'A', '4505550101'), 0);
  const readyA = gate.note(person('Un', 'A', '4505550101'), 10);
  assert.equal(readyA.startLookup, true);
  gate.markLookupQueued(readyA.lookupToken);

  const mid = gate.note(person('Deux', 'B', '4505550102'), 20);
  assert.equal(mid.allowsActions, false);
  const readyB = gate.note(person('Deux', 'B', '4505550102'), 30);
  assert.equal(readyB.startLookup, true);
  gate.markLookupQueued(readyB.lookupToken);

  // The newer lookup returns first.
  assert.equal(gate.acceptLookup({
    lookupToken: readyB.lookupToken,
    phoneRaw: '4505550102',
  }).ok, true);

  // The older lookup returns afterwards and is ignored.
  assert.equal(gate.acceptLookup({
    lookupToken: readyA.lookupToken,
    phoneRaw: '4505550101',
    state: 'OPTED_IN',
  }).ok, false);
  assert.equal(gate.acceptLookup({
    lookupToken: first.lookupToken,
    phoneRaw: '4505550102',
  }).ok, false);
  assert.equal(gate.current().patient.phoneRaw, '4505550102');
  assert.equal(gate.current().patient.lastName, 'Deux');
});

test('a phone that arrives after the name does not flash a lookup on an empty number', () => {
  const gate = patient.createPatientGate({ stableMs: 50, phoneLagMs: 200 });
  let view = gate.note(person('Caron', 'Chloé', ''), 0);
  assert.equal(view.mode, 'settling');
  view = gate.note(person('Caron', 'Chloé', ''), 50);
  assert.equal(view.mode, 'settling');
  assert.equal(view.startLookup, false);
  view = gate.note(person('Caron', 'Chloé', ''), 200);
  assert.equal(view.mode, 'no-phone');
  assert.equal(view.startLookup, false);
  assert.equal(view.patient.lastName, 'Caron');

  view = gate.note(person('Caron', 'Chloé', '4385550144'), 250);
  assert.equal(view.mode, 'settling');
  view = gate.note(person('Caron', 'Chloé', '4385550144'), 300);
  assert.equal(view.startLookup, true);
  assert.equal(view.patient.phoneRaw, '4385550144');
});

test('force skips the settle wait and invalidates the previous token', () => {
  const gate = patient.createPatientGate({ stableMs: 500, phoneLagMs: 2000 });
  gate.note(person('Alpha', 'Anne', '4505550100'), 0);
  const ready = gate.note(person('Alpha', 'Anne', '4505550100'), 500);
  gate.markLookupQueued(ready.lookupToken);
  gate.acceptLookup({ lookupToken: ready.lookupToken, phoneRaw: '4505550100' });

  const again = gate.force(person('Alpha', 'Anne', '4505550100'), 800);
  assert.equal(again.mode, 'awaiting');
  assert.equal(again.startLookup, true);
  assert.notEqual(again.lookupToken, ready.lookupToken);
  assert.equal(gate.acceptLookup({
    lookupToken: ready.lookupToken,
    phoneRaw: '4505550100',
    state: 'OPTED_IN',
  }).ok, false);
  assert.equal(gate.acceptLookup({
    lookupToken: again.lookupToken,
    phoneRaw: '4505550100',
  }).ok, true);
});

test('a cleared file drops the previous lookup before the next one starts', () => {
  const gate = patient.createPatientGate({ stableMs: 20, phoneLagMs: 20 });
  gate.note(person('Alpha', 'Anne', '4505550100'), 0);
  const ready = gate.note(person('Alpha', 'Anne', '4505550100'), 20);
  gate.markLookupQueued(ready.lookupToken);
  gate.acceptLookup({ lookupToken: ready.lookupToken, phoneRaw: '4505550100' });

  const cleared = gate.note(person('', '', ''), 40);
  assert.equal(cleared.mode, 'settling');
  assert.equal(cleared.allowsActions, false);
  assert.equal(gate.acceptLookup({
    lookupToken: ready.lookupToken,
    phoneRaw: '4505550100',
    state: 'OPTED_IN',
  }).ok, false);

  const empty = gate.note(person('', '', ''), 60);
  assert.equal(empty.mode, 'empty');
  assert.equal(empty.patient, null);
  assert.equal(empty.startLookup, false);
});

test('readPatientFields waits on text that Priorx fills after the nodes exist', () => {
  const doc = docWith({
    BA01_LastName: '',
    BA01_FirstName: '',
    BA01_Info2: '',
    LoginName1: 'DEMO',
  });
  assert.deepEqual(patient.readPatientFields(doc, () => 'EN'), {
    lastName: '',
    firstName: '',
    phoneRaw: '',
    user: 'DEMO',
    language: 'EN',
  });
  doc.setText('BA01_LastName', ' Nadeau ');
  doc.setText('BA01_FirstName', ', Eve');
  assert.equal(patient.readPatientFields(doc).lastName, 'Nadeau');
  assert.equal(patient.readPatientFields(doc).firstName, 'Eve');
  assert.equal(patient.readPatientFields(doc).phoneRaw, '');
  doc.setText('BA01_Info2', '450-555-0133 - 9 rue Fictive');
  assert.equal(patient.readPatientFields(doc).phoneRaw, '4505550133');
});

test('an input value is read when the patient field is not a text node', () => {
  const doc = {
    getElementById(id) {
      if (id !== 'BA01_LastName') return null;
      return { tagName: 'INPUT', value: 'Tremblay', textContent: '' };
    },
  };
  assert.equal(patient.readPatientFields(doc).lastName, 'Tremblay');
});

test('obviously invalid numbers are blocked and ordinary numbers are not', () => {
  const blocked = 'Numéro invalide ou non joignable par texto. Vérifiez le numéro dans le dossier.';
  for (const raw of ['555-555-0199', '15555550199', '0555550100', '155-555-0100']) {
    assert.equal(patient.phoneBlockedMessage(raw), blocked, raw);
  }
  assert.equal(patient.phoneBlockedMessage('555-010-0199'), '');
  assert.equal(patient.phoneBlockedMessage('450-555-0100'), '');
  assert.equal(patient.phoneBlockedMessage('1-450-555-0100'), '');
  assert.equal(patient.phoneBlockedMessage('450-155-0100'), '');
  assert.equal(patient.phoneBlockedMessage(''), '');
});

test('phone block text matches the notify error helper', () => {
  for (const raw of ['555-555-1212', '012-555-0100', '4505550199', '15555551212', '']) {
    assert.equal(patient.phoneBlockedMessage(raw), phoneBlockedFromNotify(raw), raw);
  }
});

test('readPatientFields takes the first phone-shaped number, including non-DSQ text', () => {
  const doc = docWith({
    BA01_LastName: 'Untel',
    BA01_FirstName: ', Jean',
    BA01_Info2: '555.555.5555, Quebec',
    LoginName1: 'DEMO',
  });
  assert.equal(patient.readPatientFields(doc).lastName, 'Untel');
  assert.equal(patient.readPatientFields(doc).firstName, 'Jean');
  assert.equal(patient.readPatientFields(doc).phoneRaw, '5555555555');
  assert.equal(patient.extractPhoneDigits('555.555.5555, Quebec'), '5555555555');
  assert.equal(patient.extractPhoneDigits('555-010-0199 - 123 rue Fictive'), '5550100199');
  assert.equal(patient.extractPhoneDigits('(555) 010-0199, Quebec'), '5550100199');
  assert.equal(patient.extractPhoneDigits('1-555-010-0199 - 10 rue Fictive'), '15550100199');
  assert.equal(patient.extractPhoneDigits('1 555 010 0199'), '15550100199');
  assert.equal(patient.extractPhoneDigits('123 rue Fictive, Quebec'), '');
  assert.equal(patient.extractPhoneDigits(''), '');
  doc.setText('BA01_LastName', 'Alpha');
  doc.setText('BA01_FirstName', 'Anne');
  doc.setText('BA01_Info2', '555-010-0199 - 123 rue Fictive');
  assert.equal(patient.readPatientFields(doc).phoneRaw, '5550100199');
  assert.equal(patient.readPatientFields(doc).lastName, 'Alpha');
  assert.equal(patient.readPatientFields(doc).firstName, 'Anne');
});

test('a 4s phone lag never looks up the previous number under the new name', () => {
  const gate = patient.createPatientGate({ stableMs: 100, phoneLagMs: 2000, samePhoneMs: 3000 });
  const anne = person('Alpha', 'Anne', '5550100199');
  const jean = person('Untel', 'Jean', '5550100199');
  gate.note(anne, 0);
  const ready = gate.note(anne, 100);
  assert.equal(ready.startLookup, true);
  const tokenA = ready.lookupToken;
  gate.markLookupQueued(tokenA);
  assert.equal(gate.acceptLookup({ lookupToken: tokenA, phoneRaw: '5550100199' }).ok, true);

  const switched = gate.note(jean, 150);
  assert.equal(switched.mode, 'settling');
  assert.equal(switched.startLookup, false);
  assert.equal(switched.changed, true);
  assert.equal(switched.allowsActions, false);
  assert.equal(switched.patient.lastName, 'Untel');
  assert.equal(gate.acceptLookup({
    lookupToken: tokenA,
    phoneRaw: '5550100199',
    state: 'OPTED_IN',
    patient: jean,
  }).ok, false);

  const atOldLag = gate.note(jean, 150 + 2000);
  assert.equal(atOldLag.startLookup, false);
  assert.equal(atOldLag.mode, 'settling');
  assert.notEqual(atOldLag.mode, 'awaiting');

  const atFour = gate.note(jean, 150 + 4000);
  assert.equal(atFour.mode, 'same-phone');
  assert.equal(atFour.startLookup, false);
  assert.equal(atFour.allowsActions, false);
  assert.equal(atFour.patient.lastName, 'Untel');
  assert.equal(atFour.patient.firstName, 'Jean');
  assert.equal(atFour.patient.phoneRaw, '5550100199');
  assert.equal(gate.acceptLookup({
    lookupToken: atFour.lookupToken,
    phoneRaw: '5550100199',
    state: 'OPTED_IN',
    patient: jean,
  }).ok, false);
  assert.equal(gate.current().mode, 'same-phone');

  const forced = gate.force(jean, 4300);
  assert.equal(forced.mode, 'awaiting');
  assert.equal(forced.startLookup, true);
  assert.equal(forced.patient.lastName, 'Untel');
  assert.equal(forced.patient.phoneRaw, '5550100199');
  assert.notEqual(forced.lookupToken, tokenA);
  assert.equal(gate.acceptLookup({
    lookupToken: tokenA,
    phoneRaw: '5550100199',
    state: 'OPTED_IN',
  }).ok, false);
  assert.equal(gate.acceptLookup({
    lookupToken: forced.lookupToken,
    phoneRaw: '5550100199',
    patient: jean,
  }).ok, true);
});

test('phone-first switch waits until the new name and phone are both still', () => {
  const gate = patient.createPatientGate({ stableMs: 500, phoneLagMs: 2000, samePhoneMs: 3000 });
  const anne = person('Alpha', 'Anne', '5550100199');
  gate.note(anne, 0);
  const ready = gate.note(anne, 500);
  gate.markLookupQueued(ready.lookupToken);
  gate.acceptLookup({ lookupToken: ready.lookupToken, phoneRaw: '5550100199' });

  let view = gate.note(person('Alpha', 'Anne', '5550100198'), 1000);
  assert.equal(view.mode, 'settling');
  assert.equal(view.startLookup, false);
  assert.equal(view.allowsActions, false);

  view = gate.note(person('Untel', 'Anne', '5550100198'), 1200);
  assert.equal(view.startLookup, false);
  view = gate.note(person('Untel', 'Jean', '5550100198'), 1400);
  assert.equal(view.mode, 'settling');
  assert.equal(view.startLookup, false);
  assert.equal(gate.acceptLookup({
    lookupToken: ready.lookupToken,
    phoneRaw: '5550100199',
    state: 'OPTED_IN',
  }).ok, false);

  view = gate.note(person('Untel', 'Jean', '5550100198'), 1900);
  assert.equal(view.startLookup, true);
  assert.equal(view.patient.lastName, 'Untel');
  assert.equal(view.patient.firstName, 'Jean');
  assert.equal(view.patient.phoneRaw, '5550100198');
  assert.notEqual(view.lookupToken, ready.lookupToken);
});

test('a different name with the same phone waits for an explicit verify', () => {
  const gate = patient.createPatientGate({ stableMs: 100, phoneLagMs: 2000, samePhoneMs: 3000 });
  const anne = person('Alpha', 'Anne', '5550100199');
  gate.note(anne, 0);
  const ready = gate.note(anne, 100);
  gate.markLookupQueued(ready.lookupToken);
  gate.acceptLookup({ lookupToken: ready.lookupToken, phoneRaw: '5550100199' });

  const next = gate.note(person('Untel', 'Jean', '5550100199'), 200);
  assert.equal(next.startLookup, false);
  const held = gate.note(person('Untel', 'Jean', '5550100199'), 200 + 3000);
  assert.equal(held.mode, 'same-phone');
  assert.equal(held.startLookup, false);
  assert.equal(held.patient.lastName, 'Untel');
  const forced = gate.force(person('Untel', 'Jean', '5550100199'), 3300);
  assert.equal(forced.startLookup, true);
  assert.equal(forced.patient.phoneRaw, '5550100199');
  assert.equal(forced.patient.lastName, 'Untel');
});

test('a cleared name drops the previous consent and the same file can be looked up again', () => {
  const gate = patient.createPatientGate({ stableMs: 100, phoneLagMs: 2000, samePhoneMs: 3000 });
  const anne = person('Alpha', 'Anne', '5550100199');
  gate.note(anne, 0);
  const ready = gate.note(anne, 100);
  gate.markLookupQueued(ready.lookupToken);
  gate.acceptLookup({ lookupToken: ready.lookupToken, phoneRaw: '5550100199' });

  const clearing = gate.note(person('', '', '5550100199'), 200);
  assert.equal(clearing.mode, 'settling');
  assert.equal(clearing.allowsActions, false);
  assert.equal(gate.acceptLookup({
    lookupToken: ready.lookupToken,
    phoneRaw: '5550100199',
    state: 'OPTED_IN',
  }).ok, false);

  gate.note(person('', '', ''), 300);
  const empty = gate.note(person('', '', ''), 400);
  assert.equal(empty.mode, 'empty');
  assert.equal(empty.patient, null);
  assert.equal(empty.startLookup, false);

  const back = gate.note(anne, 500);
  assert.equal(back.startLookup, false);
  const again = gate.note(anne, 600);
  assert.equal(again.startLookup, true);
  assert.equal(again.patient.lastName, 'Alpha');
  assert.equal(again.patient.phoneRaw, '5550100199');
  assert.notEqual(again.lookupToken, ready.lookupToken);
});

test('after a clear, a new name on the previous phone does not look itself up', () => {
  const gate = patient.createPatientGate({ stableMs: 100, phoneLagMs: 2000, samePhoneMs: 3000 });
  const anne = person('Alpha', 'Anne', '5550100199');
  gate.note(anne, 0);
  const ready = gate.note(anne, 100);
  gate.markLookupQueued(ready.lookupToken);
  gate.acceptLookup({ lookupToken: ready.lookupToken, phoneRaw: '5550100199' });

  gate.note(person('', '', ''), 200);
  const empty = gate.note(person('', '', ''), 300);
  assert.equal(empty.mode, 'empty');

  const next = gate.note(person('Untel', 'Jean', '5550100199'), 400);
  assert.equal(next.startLookup, false);
  const held = gate.note(person('Untel', 'Jean', '5550100199'), 400 + 3000);
  assert.equal(held.mode, 'same-phone');
  assert.equal(held.startLookup, false);
  assert.equal(gate.acceptLookup({
    lookupToken: ready.lookupToken,
    phoneRaw: '5550100199',
    patient: { lastName: 'Alpha', firstName: 'Anne' },
  }).ok, false);
});

test('a lookup whose name does not match the committed file is refused', () => {
  const gate = patient.createPatientGate({ stableMs: 10, phoneLagMs: 10, samePhoneMs: 3000 });
  const anne = person('Alpha', 'Anne', '5550100199');
  gate.note(anne, 0);
  const ready = gate.note(anne, 10);
  gate.markLookupQueued(ready.lookupToken);
  assert.equal(gate.acceptLookup({
    lookupToken: ready.lookupToken,
    phoneRaw: '5550100199',
    patient: { lastName: 'Untel', firstName: 'Jean' },
  }).ok, false);
  assert.equal(gate.current().mode, 'awaiting');
  assert.equal(gate.acceptLookup({
    lookupToken: ready.lookupToken,
    phoneRaw: '5550100199',
    patient: { lastName: 'Alpha', firstName: 'Anne' },
  }).ok, true);
});
