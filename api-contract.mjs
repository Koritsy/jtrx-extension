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
//   POST /notify                                  { phone_number, patient_name, message_type, sent_by?, language }
//   GET  /confirmations
//   POST /confirmations/{confirmation_id}/dismiss
//   POST /messages/history                        { phone_number }
//
// DismissConfirmation is POST /confirmations/{confirmation_id}/dismiss.
// It is not DELETE /confirmations/{confirmation_id}. The id is the
// confirmation_id field on each GET /confirmations item, not the phone.
//
// message_type is ready | partial | new_prescription | renewal.
// patient_name is the patient's first name.
// sent_by is the staff login from LoginName1. It is omitted when that field is empty.
// language is EN or FR. EN only when the patient file says EN, ENG, ANGLAIS, or ENGLISH.
// Anything else, including a missing field, is FR. An older server ignores language and sends French.
// confirmation_id is the id returned by GET /confirmations, not a phone number.
//
// Responses this extension reads:
//   lookup:        consent, consent_date, needs_reinscription
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

export function notifySend({ phoneNumber, patientName, messageType, sentBy, language }) {
  const body = {
    phone_number: phoneNumber,
    patient_name: patientName,
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

export function confirmationDismiss(confirmationId) {
  const id = String(confirmationId ?? '').trim();
  if (!id || /[/?#\\\s]/.test(id)) {
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
    if (!id || /[/?#\\\s]/.test(id)) throw new Error('Blocked API path');
    return;
  }

  throw new Error('Blocked API path');
}
