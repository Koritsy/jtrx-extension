import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const require = createRequire(import.meta.url);
const list = require('./confirmation-list.js');

const ID = '2026-09-30T21:58:12+00:00#a1b2c3d4';

function item(id, name) {
  return { confirmation_id: id, patient_name: name, replied_at: '2026-09-30T21:58:12Z' };
}

test('Fait hides the row immediately and a second click does not send again', () => {
  const suppressed = new Set();
  const items = [item(ID, 'Alex'), item('2026-09-30T22:00:00+00:00#b2c3d4e5', 'Sam')];

  const first = list.beginDismiss(suppressed, ID);
  assert.deepEqual(first, { ok: true, id: ID });
  assert.deepEqual(
    list.visibleConfirmations(items, suppressed).map((row) => row.patient_name),
    ['Sam'],
  );

  const again = list.beginDismiss(suppressed, ID);
  assert.equal(again.ok, false);
  assert.equal(again.reason, 'duplicate');
  assert.equal(suppressed.size, 1);
});

test('a poll that still lists the id does not put it back while it is suppressed', () => {
  const suppressed = new Set([ID]);
  const polled = [item(ID, 'Alex'), item('', 'Sans id')];
  const visible = list.visibleConfirmations(polled, suppressed);
  assert.equal(visible.length, 1);
  assert.equal(visible[0].patient_name, 'Sans id');
  assert.equal(list.visibleConfirmations(null, suppressed).length, 0);
});

test('an empty id is refused and the list stays', () => {
  const suppressed = new Set();
  assert.deepEqual(list.beginDismiss(suppressed, '  '), { ok: false, reason: 'invalid' });
  assert.equal(suppressed.size, 0);
  const items = [item(ID, 'Alex')];
  assert.equal(list.visibleConfirmations(items, suppressed).length, 1);
});

test('the Fait click removes the row before the POST and only logs a failure', () => {
  const content = readFileSync(new URL('./content.js', import.meta.url), 'utf8');
  const background = readFileSync(new URL('./background.js', import.meta.url), 'utf8');
  assert.equal(content.includes('beginDismiss'), true);
  assert.equal(content.includes('visibleConfirmations'), true);
  assert.equal(
    content.includes("showToast(response?.error || 'Impossible de marquer cette réponse comme terminée.', 8000)"),
    false,
  );
  assert.equal(content.includes("Fait : échec de l'enregistrement"), true);
  assert.equal(background.includes("Fait : échec de l'enregistrement"), true);
  const dismissStart = content.indexOf('function dismissConfirmation');
  const dismissEnd = content.indexOf('// ── Historique');
  const dismiss = content.slice(dismissStart, dismissEnd);
  assert.equal(dismiss.indexOf('beginDismiss') < dismiss.indexOf('CONFIRMATION_DISMISS'), true);
  assert.equal(dismiss.includes('fetchConfirmations'), false);
});
