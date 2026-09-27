// NotiRx background service worker — relays widget messages to the API.

import {
  assertSafeRequest,
  confirmationDismiss,
  confirmationsList,
  consentLookup,
  consentSave,
  notifySend,
} from './api-contract.mjs';

// Keyed by tabId — current patient and consent for that Priorx tab.
const tabState = {};

// Content-script messages include sender.tab.id. The toolbar icon does too.
let activeTabId = null;

async function getConfig() {
  const stored = await chrome.storage.local.get(['apiBaseUrl', 'apiKey']);
  const apiBaseUrl = typeof stored.apiBaseUrl === 'string' ? stored.apiBaseUrl.replace(/\/$/, '') : '';
  const apiKey = typeof stored.apiKey === 'string' ? stored.apiKey : '';
  if (!apiBaseUrl || !apiKey) {
    throw new Error('Configuration manquante. Ouvrez les options de NotiRx.');
  }
  if (!apiBaseUrl.startsWith('https://')) {
    throw new Error('Adresse API invalide. Corrigez-la dans les options de NotiRx.');
  }
  return { apiBaseUrl, apiKey };
}

async function apiRequest(method, path, body = null) {
  assertSafeRequest(method, path);
  const { apiBaseUrl, apiKey } = await getConfig();
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey,
    },
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    cache: 'no-store',
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${apiBaseUrl}${path}`, opts);
  if (!res.ok) throw new Error(`API ${method} ${path} → ${res.status}`);
  return res.json();
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
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

    case 'CONSENT_SAVE':
      handleConsentSave(tabId, msg.data, sendResponse);
      return true;

    case 'NOTIFY_SEND':
      handleNotifySend(tabId, sendResponse, msg.patient, msg.messageType);
      return true;

    case 'CONFIRMATIONS_LIST':
      handleConfirmationsList(sendResponse);
      return true;

    case 'CONFIRMATION_DISMISS':
      handleConfirmationDismiss(msg.confirmationId, sendResponse);
      return true;

    case 'RETRY_PATIENT': {
      const patient = tabState[tabId]?.patient ?? msg.patient;
      if (patient) {
        handlePatientChanged(tabId, patient);
      } else {
        broadcastToPanel(tabId, { type: 'STATE_UPDATE', state: 'NO_PATIENT' });
      }
      break;
    }

    case 'OPEN_OPTIONS':
      chrome.runtime.openOptionsPage();
      break;

    default:
      break;
  }
});

async function handlePatientChanged(tabId, patient) {
  tabState[tabId] = { patient, consent: null };

  broadcastToPanel(tabId, { type: 'STATE_UPDATE', state: 'LOADING', patient });

  if (!patient.phoneRaw || patient.phoneRaw.length < 10) {
    broadcastToPanel(tabId, { type: 'STATE_UPDATE', state: 'NO_PHONE', patient });
    return;
  }

  try {
    const req = consentLookup(patient.phoneRaw);
    const result = await apiRequest(req.method, req.path, req.body);
    const consent = result.consent;
    tabState[tabId].consent = consent;

    broadcastToPanel(tabId, {
      type: 'STATE_UPDATE',
      state: consentToState(consent),
      patient,
      consentDate: result.consent_date || null,
      needsReinscription: result.needs_reinscription || false,
    });
  } catch (err) {
    broadcastToPanel(tabId, { type: 'STATE_UPDATE', state: 'ERROR', error: err.message });
  }
}

async function handleConsentSave(tabId, { consent, recordedBy, patient: msgPatient }, sendResponse) {
  const patient = tabState[tabId]?.patient ?? msgPatient;
  if (!patient) return sendResponse({ ok: false, error: 'No patient' });

  try {
    const req = consentSave({
      phoneNumber: patient.phoneRaw,
      consent,
      recordedBy,
    });
    await apiRequest(req.method, req.path, req.body);
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
    const req = notifySend({
      phoneNumber: patient.phoneRaw,
      patientName: patient.firstName,
      messageType,
    });
    const result = await apiRequest(req.method, req.path, req.body);
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
    const req = confirmationsList();
    const result = await apiRequest(req.method, req.path, req.body);
    const confirmations = Array.isArray(result.confirmations) ? result.confirmations : [];
    sendResponse({ ok: true, confirmations });
  } catch (err) {
    sendResponse({ ok: false, error: err.message });
  }
}

async function handleConfirmationDismiss(confirmationId, sendResponse) {
  try {
    const req = confirmationDismiss(confirmationId);
    await apiRequest(req.method, req.path, req.body);
    sendResponse({ ok: true });
  } catch (err) {
    sendResponse({ ok: false, error: err.message });
  }
}

function consentToState(consent) {
  if (consent === 'yes') return 'OPTED_IN';
  if (consent === 'no') return 'OPTED_OUT';
  return 'UNKNOWN';
}

function broadcastToPanel(tabId, message) {
  if (!tabId) return;
  chrome.tabs.sendMessage(tabId, message).catch(() => {});
}

chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_WIDGET' }).catch(() => {});
});

chrome.runtime.onInstalled.addListener(async () => {
  const { apiBaseUrl, apiKey } = await chrome.storage.local.get(['apiBaseUrl', 'apiKey']);
  if (!apiBaseUrl || !apiKey) chrome.runtime.openOptionsPage();
});
