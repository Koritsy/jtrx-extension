// J.T.Rx background service worker — relays messages, calls AWS API.

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
      broadcastToPanel({ type: 'STATE_UPDATE', state: 'NO_PATIENT' });
      break;

    case 'PRESCRIPTION_VALIDATED':
      handleValidationDetected(tabId);
      break;

    case 'CONSENT_SAVE':
      handleConsentSave(tabId, msg.data, sendResponse);
      return true; // async

    case 'NOTIFY_SEND':
      handleNotifySend(tabId, sendResponse);
      return true; // async

    case 'RETRY_PATIENT': {
      const state = tabState[tabId];
      if (state?.patient) {
        broadcastToPanel({
          type: 'STATE_UPDATE',
          state: consentToState(state.consent),
          patient: state.patient,
        });
      } else {
        broadcastToPanel({ type: 'STATE_UPDATE', state: 'NO_PATIENT' });
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

  broadcastToPanel({ type: 'STATE_UPDATE', state: 'LOADING', patient });

  if (!patient.phoneRaw || patient.phoneRaw.length < 10) {
    // Phone not yet in DOM (might load slightly after name) — panel shows loading
    // content.js will re-send PATIENT_CHANGED once BA01_Info2 updates
    broadcastToPanel({ type: 'STATE_UPDATE', state: 'NO_PHONE', patient });
    return;
  }

  try {
    const result = await apiRequest('GET', `/consent/${patient.phoneRaw}`);
    const consent = result.consent; // "yes" | "no" | null
    tabState[tabId].consent = consent;

    broadcastToPanel({
      type: 'STATE_UPDATE',
      state: consentToState(consent),
      patient,
      consentDate: result.consent_date || null,
    });
  } catch (err) {
    broadcastToPanel({ type: 'STATE_UPDATE', state: 'ERROR', error: err.message });
  }
}

async function handleValidationDetected(tabId) {
  const state = tabState[tabId];
  if (!state || state.consent !== 'yes') return;

  // Open side panel (in case it isn't visible) and prompt
  chrome.sidePanel.open({ tabId }).catch(() => {});
  broadcastToPanel({ type: 'VALIDATION_PROMPT', patient: state.patient });
}

async function handleConsentSave(tabId, { consent, recordedBy }, sendResponse) {
  const state = tabState[tabId];
  if (!state?.patient) return sendResponse({ ok: false, error: 'No patient' });

  try {
    await apiRequest('POST', '/consent', {
      phone_number:  state.patient.phoneRaw,
      consent,
      recorded_by:   recordedBy,
    });
    tabState[tabId].consent = consent;
    broadcastToPanel({
      type: 'STATE_UPDATE',
      state: consentToState(consent),
      patient: state.patient,
    });
    sendResponse({ ok: true });
  } catch (err) {
    sendResponse({ ok: false, error: err.message });
  }
}

async function handleNotifySend(tabId, sendResponse) {
  const state = tabState[tabId];
  if (!state?.patient) return sendResponse({ ok: false, error: 'No patient' });

  try {
    const result = await apiRequest('POST', '/notify', {
      phone_number:  state.patient.phoneRaw,
      patient_name:  state.patient.firstName,
    });
    broadcastToPanel({ type: 'NOTIFY_SUCCESS', messageSid: result.message_sid });
    sendResponse({ ok: true });
  } catch (err) {
    broadcastToPanel({ type: 'NOTIFY_ERROR', error: err.message });
    sendResponse({ ok: false, error: err.message });
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function consentToState(consent) {
  if (consent === 'yes') return 'OPTED_IN';
  if (consent === 'no')  return 'OPTED_OUT';
  return 'UNKNOWN';
}

function broadcastToPanel(message) {
  chrome.runtime.sendMessage(message).catch(() => {
    // Panel not open — fine, it will load fresh state on open
  });
}

// Open side panel automatically when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});
