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
//   POST /notify                                  { phone_number, patient_name, message_type }
//   GET  /confirmations
//   POST /confirmations/{confirmation_id}/dismiss
//
// message_type is ready | partial | new_prescription | renewal.
// patient_name is the patient's first name.
// confirmation_id is the id returned by GET /confirmations, not a phone number.
//
// Responses this extension still reads (unchanged by this file):
//   lookup:        consent, consent_date, needs_reinscription
//   notify:        message_sid
//   confirmations: confirmations[].confirmation_id, patient_name, replied_at

const STATIC_REQUESTS = new Set([
  'POST /consent/lookup',
  'POST /consent',
  'POST /notify',
  'GET /confirmations',
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

export function notifySend({ phoneNumber, patientName, messageType }) {
  return {
    method: 'POST',
    path: '/notify',
    body: {
      phone_number: phoneNumber,
      patient_name: patientName,
      message_type: messageType || 'ready',
    },
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
