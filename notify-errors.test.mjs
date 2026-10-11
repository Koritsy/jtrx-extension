import assert from 'node:assert/strict';
import test from 'node:test';
import { MESSAGES, describeRequestFailure, phoneBlockedMessage } from './notify-errors.mjs';

function fail(status, error) {
  return { status, body: error == null ? null : { error } };
}

test('notify failures become short French messages', () => {
  const invalid = describeRequestFailure(fail(422, 'invalid_phone'));
  assert.equal(invalid.message, MESSAGES.invalidPhone);
  assert.equal(invalid.mayHaveSent, false);
  assert.equal(describeRequestFailure(fail(400, 'not_mobile')).message, MESSAGES.invalidPhone);
  assert.equal(describeRequestFailure(fail(400, 'unreachable')).message, MESSAGES.invalidPhone);

  const paused = describeRequestFailure(fail(503, 'Sends are temporarily disabled'));
  assert.equal(paused.message, MESSAGES.sendsPaused);
  assert.equal(paused.mayHaveSent, false);
  assert.equal(describeRequestFailure(fail(503, 'sends_disabled')).message, MESSAGES.sendsPaused);

  const timeout = describeRequestFailure(fail(504, 'provider_timeout'));
  assert.equal(timeout.message, MESSAGES.providerTimeout);
  assert.equal(timeout.mayHaveSent, true);
  assert.match(timeout.message, /peut-être déjà été envoyé/);
  assert.equal(describeRequestFailure(fail(502, 'provider_timeout')).mayHaveSent, true);

  const provider = describeRequestFailure(fail(502, 'provider_error'));
  assert.equal(provider.message, MESSAGES.providerError);
  assert.equal(provider.mayHaveSent, false);

  assert.equal(describeRequestFailure(fail(429, 'daily_limit')).message, MESSAGES.dailyLimit);
  assert.equal(describeRequestFailure(fail(429, 'too many')).message, MESSAGES.dailyLimit);

  const consent = describeRequestFailure(fail(403, 'no_consent'));
  assert.equal(consent.message, MESSAGES.noConsent);
  assert.equal(consent.consentRevoked, true);

  const stop = describeRequestFailure(fail(409, 'stop'));
  assert.equal(stop.smsOptOut, true);
  assert.match(stop.message, /COMMENCER/);
  assert.equal(describeRequestFailure(fail(400, 'unsubscribed')).smsOptOut, true);
});

test('a bare gateway timeout warns that the SMS may already have gone out', () => {
  const gateway = describeRequestFailure({ status: 502, body: null });
  assert.equal(gateway.message, MESSAGES.providerTimeout);
  assert.equal(gateway.mayHaveSent, true);
  assert.equal(gateway.message.includes('API POST'), false);
  assert.equal(gateway.message.includes('502'), false);
});

test('unknown codes stay generic and lookup failures do not claim an SMS was sent', () => {
  const unknown = describeRequestFailure(fail(400, 'something_new'));
  assert.equal(unknown.message, MESSAGES.generic);
  assert.equal(unknown.mayHaveSent, false);
  assert.equal(unknown.message.includes('something_new'), false);

  const lookup = describeRequestFailure(fail(502, 'provider_timeout'), 'lookup');
  assert.equal(lookup.message, MESSAGES.lookupFailed);
  assert.equal(lookup.mayHaveSent, false);

  const save = describeRequestFailure(fail(500, 'nope'), 'consent');
  assert.equal(save.message, MESSAGES.consentSaveFailed);
});

test('client-side checks use the same invalid-number sentence', () => {
  assert.equal(phoneBlockedMessage('555-555-0199'), MESSAGES.invalidPhone);
  assert.equal(phoneBlockedMessage('4505550100'), '');
});
