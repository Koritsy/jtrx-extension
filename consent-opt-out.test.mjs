import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  SMS_OPT_OUT_NOTICE,
  consentSaveBlockedBySms,
  smsOptOutFromLookup,
} from './consent-opt-out.mjs';

test('lookup needs_reinscription hides the consent control until consent is yes', () => {
  assert.equal(smsOptOutFromLookup({ consent: 'no', needs_reinscription: true }), true);
  assert.equal(smsOptOutFromLookup({ consent: null, needs_reinscription: true }), true);
  assert.equal(smsOptOutFromLookup({ needs_reinscription: 'true' }), true);
  assert.equal(smsOptOutFromLookup({ consent: 'no', needs_reinscription: false }), false);
  assert.equal(smsOptOutFromLookup({ consent: 'no' }), false);
  assert.equal(smsOptOutFromLookup({ consent: 'yes', needs_reinscription: true }), false);
  assert.equal(smsOptOutFromLookup(null), false);
});

test('optional lookup flags count as SMS opt-out, except once consent is yes', () => {
  assert.equal(smsOptOutFromLookup({ consent: 'no', sms_opt_out: true }), true);
  assert.equal(smsOptOutFromLookup({ consent: 'no', opted_out_by_sms: true }), true);
  assert.equal(smsOptOutFromLookup({ consent: 'no', opt_out_source: 'sms' }), true);
  assert.equal(smsOptOutFromLookup({ consent: 'no', opt_out_source: 'Twilio' }), true);
  assert.equal(smsOptOutFromLookup({ consent: 'yes', sms_opt_out: true, needs_reinscription: true }), false);
  assert.equal(smsOptOutFromLookup({ consent: 'no', opt_out_source: 'staff' }), false);
});

test('only a 409 while saving yes is the SMS opt-out conflict', () => {
  assert.equal(consentSaveBlockedBySms(409, 'yes'), true);
  assert.equal(consentSaveBlockedBySms(409, 'no'), false);
  assert.equal(consentSaveBlockedBySms(403, 'yes'), false);
  assert.equal(consentSaveBlockedBySms(500, 'yes'), false);
  assert.equal(consentSaveBlockedBySms(undefined, 'yes'), false);
});

test('the patient screen uses the French ARRÊT notice and keeps Modifier for a staff no', () => {
  const content = readFileSync(new URL('./content.js', import.meta.url), 'utf8');
  const background = readFileSync(new URL('./background.js', import.meta.url), 'utf8');
  assert.equal(content.includes(SMS_OPT_OUT_NOTICE), true);
  assert.equal(content.includes('id="v-sms-opt-out"'), true);
  assert.equal(content.includes('id="btn-change"'), true);
  const smsView = content.slice(
    content.indexOf('id="v-sms-opt-out"'),
    content.indexOf('id="v-error"'),
  );
  assert.equal(smsView.includes('<button'), false);
  assert.equal(background.includes('consentSaveBlockedBySms'), true);
  assert.equal(background.includes("'SMS_OPT_OUT'"), true);
  assert.equal(background.includes('smsOptOutFromLookup'), true);
});
