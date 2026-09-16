// NotiRx background service worker — relays messages, calls AWS API.

import { CONFIG } from './config.js';

// ── State ──────────────────────────────────────────────────────────────────

// Keyed by tabId — stores the current patient + their consent state per tab
const tabState = {};

// Last tab where a patient was detected — side panel messages have no tab, so we fall back to this
let activeTabId = null;

// ── API helpers ────────────────────────────────────────────────────────────

async function apiRequest(method, path, body = null) {
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': CONFIG.API_KEY,
      'X-Pharmacy-Id': CONFIG.PHARMACY_ID,
      'X-Pharmacy-Name': CONFIG.PHARMACY_NAME,
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${CONFIG.API_BASE_URL}${path}`, opts);
  if (!res.ok) throw new Error(`API ${method} ${path} → ${res.status}`);
  return res.json();
}

// ── Message router ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Content script messages have sender.tab.id; side panel messages do not — fall back to activeTabId
  const tabId = sender.tab?.id ?? activeTabId;

  switch (msg.type) {

    case 'PATIENT_CHANGED':
      activeTabId = sender.tab?.id ?? activeTabId;
      handlePatientChanged(tabId, msg.data);
      break;

    case 'PATIENT_CLEARED':
      delete tabState[tabId];
      broadcastToPanel(tabId, { type: 'STATE_UPDATE', state: 'NO_PATIENT' });
      break;

    case 'PRESCRIPTION_VALIDATED':
      handleValidationDetected(tabId);
      break;

    case 'CONSENT_SAVE':
      handleConsentSave(tabId, msg.data, sendResponse);
      return true; // async

    case 'NOTIFY_SEND':
      handleNotifySend(tabId, sendResponse, msg.patient, msg.messageType);
      return true; // async

    case 'CONFIRMATIONS_LIST':
      handleConfirmationsList(sendResponse);
      return true; // async

    case 'CONFIRMATION_DISMISS':
      handleConfirmationDismiss(msg.confirmationId, sendResponse);
      return true; // async

    case 'RETRY_PATIENT': {
      const patient = tabState[tabId]?.patient ?? msg.patient;
      if (patient) {
        handlePatientChanged(tabId, patient);
      } else {
        broadcastToPanel(tabId, { type: 'STATE_UPDATE', state: 'NO_PATIENT' });
      }
      break;
    }

    default:
      break;
  }
});

// ── Handlers ──────────────────────────────────────────────────────────────

async function handlePatientChanged(tabId, patient) {
  tabState[tabId] = { patient, consent: null };

  broadcastToPanel(tabId, { type: 'STATE_UPDATE', state: 'LOADING', patient });

  if (!patient.phoneRaw || patient.phoneRaw.length < 10) {
    broadcastToPanel(tabId, { type: 'STATE_UPDATE', state: 'NO_PHONE', patient });
    return;
  }

  try {
    const result = await apiRequest('GET', `/consent/${patient.phoneRaw}`);
    const consent = result.consent;
    tabState[tabId].consent = consent;

    broadcastToPanel(tabId, {
      type: 'STATE_UPDATE',
      state: consentToState(consent),
      patient,
      consentDate:          result.consent_date || null,
      needsReinscription:   result.needs_reinscription || false,
    });
  } catch (err) {
    broadcastToPanel(tabId, { type: 'STATE_UPDATE', state: 'ERROR', error: err.message });
  }
}

async function handleValidationDetected(tabId) {
  const state = tabState[tabId];
  if (!state || state.consent !== 'yes') return;

  broadcastToPanel(tabId, { type: 'VALIDATION_PROMPT', patient: state.patient });
}

async function handleConsentSave(tabId, { consent, recordedBy, patient: msgPatient }, sendResponse) {
  // Prefer tabState (in-memory), fall back to patient sent in the message
  const patient = tabState[tabId]?.patient ?? msgPatient;
  if (!patient) return sendResponse({ ok: false, error: 'No patient' });

  try {
    await apiRequest('POST', '/consent', {
      phone_number: patient.phoneRaw,
      consent,
      recorded_by:  recordedBy,
    });
    if (tabState[tabId]) tabState[tabId].consent = consent;
    broadcastToPanel(tabId, {
      type: 'STATE_UPDATE',
      state: consentToState(consent),
      patient,
    });
    sendResponse({ ok: true });
  } catch (err) {
    sendResponse({ ok: false, error: err.message });
  }
}

async function handleNotifySend(tabId, sendResponse, msgPatient, messageType) {
  const patient = tabState[tabId]?.patient ?? msgPatient;
  if (!patient) return sendResponse({ ok: false, error: 'No patient' });

  try {
    const result = await apiRequest('POST', '/notify', {
      phone_number: patient.phoneRaw,
      patient_name: patient.firstName,
      message_type: messageType || 'ready',
    });
    broadcastToPanel(tabId, { type: 'NOTIFY_SUCCESS', messageSid: result.message_sid });
    sendResponse({ ok: true });
  } catch (err) {
    const revoked = err.message.includes('403');
    if (revoked && tabState[tabId]) tabState[tabId].consent = 'no';
    broadcastToPanel(tabId, { type: 'NOTIFY_ERROR', error: err.message, consentRevoked: revoked });
    sendResponse({ ok: false, error: err.message });
  }
}

async function handleConfirmationsList(sendResponse) {
  try {
    const result = await apiRequest('GET', '/confirmations');
    sendResponse({ ok: true, confirmations: result.confirmations || [] });
  } catch (err) {
    sendResponse({ ok: false, error: err.message });
  }
}

async function handleConfirmationDismiss(confirmationId, sendResponse) {
  try {
    await apiRequest('POST', `/confirmations/${encodeURIComponent(confirmationId)}/dismiss`);
    sendResponse({ ok: true });
  } catch (err) {
    sendResponse({ ok: false, error: err.message });
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function consentToState(consent) {
  if (consent === 'yes') return 'OPTED_IN';
  if (consent === 'no')  return 'OPTED_OUT';
  return 'UNKNOWN';
}

function broadcastToPanel(tabId, message) {
  if (!tabId) return;
  chrome.tabs.sendMessage(tabId, message).catch(() => {});
}

// Toggle widget when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_WIDGET' }).catch(() => {});
});
