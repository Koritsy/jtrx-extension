// Backend contract for Koritsy/jtrx-backend.
//
// If the backend pull request uses a different path or JSON field, change
// only this file. background.js calls these helpers and does not build URLs.
//
// Pharmacy identity is derived on the server from the API key. These requests
// do not carry a pharmacy id or a pharmacy name.
//
// Phone numbers are sent only as the JSON field phone_number. They are never
// placed in the path or the query string.
//
//   POST /consent/lookup                          { phone_number }
//   POST /consent                                 { phone_number, consent, recorded_by }
//   POST /notify                                  { phone_number, message_type, sent_by?, language }
//   GET  /confirmations
//   POST /confirmations/{confirmation_id}/dismiss
//   POST /messages/history                        { phone_number }
//
// DismissConfirmation is POST /confirmations/{confirmation_id}/dismiss.
// It is not DELETE /confirmations/{confirmation_id}. The id is the
// confirmation_id field on each GET /confirmations item, not the phone.
//
// message_type is ready | partial | new_prescription | renewal.
// The patient's first name is not sent. The widget may still show it on this computer.
// sent_by is the staff login from LoginName1. It is omitted when that field is empty.
// language is EN or FR. The widget sends EN when Priorx shows EN, ENG, ANG, AN,
// (AN), ANGLAIS, or ENGLISH. Anything else, including a missing field, is FR.
// Priorx labels English as (AN), not (EN). The extension sends EN, not AN.
// An older server ignores language and sends French.
// confirmation_id is the id returned by GET /confirmations, not a phone number.
// Backend dismiss_confirmation accepts ^[0-9A-Za-z:+.\-]{20,40}#[0-9a-f]{8}$
// for example 2026-09-30T21:58:12+00:00#a1b2c3d4. encodeURIComponent puts it in
// the path (# → %23, + → %2B, : → %3A). A raw # in the path is rejected.
//
// Responses this extension reads:
//   lookup:        consent, consent_date, needs_reinscription
//                  Optional, same meaning as needs_reinscription when consent
//                  is not yes: sms_opt_out, opted_out_by_sms, opt_out_source
//                  ("sms" or "twilio"). consent "yes" is subscribed again.
//   consent save:  409 when staff set yes after an SMS opt-out. The widget
//                  shows a French notice and does not show the status text.
//   notify:        message_sid
//   confirmations: confirmations[].confirmation_id, patient_name, replied_at,
//                  phone_number (10 digits, may be missing on an older server),
//                  message_type (may be null)
//   history:       messages[].message_type, sent_at (ISO UTC), sent_by|null,
//                  status|null, direction? ("out"|"in"), reply_keyword?
//                  Older servers answer 404. The widget shows a French notice.

const STATIC_REQUESTS = new Set([
  'POST /consent/lookup',
  'POST /consent',
  'POST /notify',
  'GET /confirmations',
  'POST /messages/history',
]);

export function consentLookup(phoneNumber) {
  return {
    method: 'POST',
    path: '/consent/lookup',
    body: { phone_number: phoneNumber },
  };
}

export function consentSave({ phoneNumber, consent, recordedBy }) {
  return {
    method: 'POST',
    path: '/consent',
    body: {
      phone_number: phoneNumber,
      consent,
      recorded_by: recordedBy,
    },
  };
}

export function notifySend({ phoneNumber, messageType, sentBy, language }) {
  const body = {
    phone_number: phoneNumber,
    message_type: messageType || 'ready',
    language: language === 'EN' ? 'EN' : 'FR',
  };
  if (typeof sentBy === 'string' && sentBy.trim()) {
    body.sent_by = sentBy.trim();
  }
  return {
    method: 'POST',
    path: '/notify',
    body,
  };
}

export function messagesHistory(phoneNumber) {
  return {
    method: 'POST',
    path: '/messages/history',
    body: { phone_number: phoneNumber },
  };
}

export function confirmationsList() {
  return { method: 'GET', path: '/confirmations', body: null };
}

// Same rule as src/dismiss_confirmation/app.py in Koritsy/jtrx-backend.
const CONFIRMATION_ID = /^[0-9A-Za-z:+.\-]{20,40}#[0-9a-f]{8}$/;

export function confirmationDismiss(confirmationId) {
  const id = String(confirmationId ?? '').trim();
  if (!CONFIRMATION_ID.test(id)) {
    throw new Error('Invalid confirmation id');
  }
  return {
    method: 'POST',
    path: `/confirmations/${encodeURIComponent(id)}/dismiss`,
    body: null,
  };
}

// Rejects anything other than the calls above, including a phone number in the path.
export function assertSafeRequest(method, path) {
  if (typeof method !== 'string' || typeof path !== 'string') {
    throw new Error('Blocked API path');
  }
  if (path.includes('?') || path.includes('#') || path.includes('\\')) {
    throw new Error('Blocked API path');
  }
  const key = `${method} ${path}`;
  if (STATIC_REQUESTS.has(key)) return;

  const dismiss = path.match(/^\/confirmations\/([^/]+)\/dismiss$/);
  if (method === 'POST' && dismiss) {
    let id;
    try {
      id = decodeURIComponent(dismiss[1]);
    } catch {
      throw new Error('Blocked API path');
    }
    if (!CONFIRMATION_ID.test(id)) throw new Error('Blocked API path');
    return;
  }

  throw new Error('Blocked API path');
}
