// NotiRx background service worker — relays widget messages to the API.

import {
  assertSafeRequest,
  confirmationDismiss,
  confirmationsList,
  consentLookup,
  consentSave,
  messagesHistory,
  notifySend,
} from './api-contract.mjs';
import { pickRuntimeConfig } from './runtime-config.mjs';

// Keyed by tabId — current patient and consent for that Priorx tab.
const tabState = {};

// Content-script messages include sender.tab.id. The toolbar icon does too.
let activeTabId = null;

async function readStorageArea(area) {
  try {
    return await area.get(['apiBaseUrl', 'apiKey']);
  } catch {
    return {};
  }
}

async function getConfig() {
  const [managed, local] = await Promise.all([
    readStorageArea(chrome.storage.managed),
    readStorageArea(chrome.storage.local),
  ]);
  const picked = pickRuntimeConfig(managed, local);
  if (!picked.ok && picked.source === 'managed') {
    throw new Error('La configuration fournie par l’administrateur est incomplète ou invalide.');
  }
  if (!picked.ok) {
    throw new Error('Configuration manquante. Ouvrez les options de NotiRx.');
  }
  return picked;
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
  if (!res.ok) {
    const error = new Error(`API ${method} ${path} → ${res.status}`);
    error.status = res.status;
    throw error;
  }
  const text = await res.text();
  if (!text) return {};
  return JSON.parse(text);
}

function rejectIfLocked(msg, sendResponse) {
  if (msg?.priorxUnlocked === true) return false;
  sendResponse({ ok: false, error: 'Priorx est verrouillé.' });
  return true;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab?.id ?? activeTabId;

  switch (msg.type) {

    case 'PATIENT_CHANGED':
      activeTabId = sender.tab?.id ?? activeTabId;
      if (msg.priorxUnlocked !== true) {
        delete tabState[tabId];
        broadcastToPanel(tabId, { type: 'STATE_UPDATE', state: 'NO_PATIENT' });
        break;
      }
      handlePatientChanged(tabId, msg.data);
      break;

    case 'PATIENT_CLEARED':
      delete tabState[tabId];
      broadcastToPanel(tabId, { type: 'STATE_UPDATE', state: 'NO_PATIENT' });
      break;

    case 'CONSENT_SAVE':
      if (rejectIfLocked(msg, sendResponse)) return true;
      handleConsentSave(tabId, msg.data, sendResponse);
      return true;

    case 'NOTIFY_SEND':
      if (rejectIfLocked(msg, sendResponse)) return true;
      handleNotifySend(tabId, sendResponse, msg.patient, msg.messageType);
      return true;

    case 'CONFIRMATIONS_LIST':
      if (rejectIfLocked(msg, sendResponse)) return true;
      handleConfirmationsList(sendResponse);
      return true;

    case 'CONFIRMATION_DISMISS':
      if (rejectIfLocked(msg, sendResponse)) return true;
      handleConfirmationDismiss(msg.confirmationId, sendResponse);
      return true;

    case 'MESSAGES_HISTORY':
      if (rejectIfLocked(msg, sendResponse)) return true;
      handleMessagesHistory(msg.phoneNumber, sendResponse);
      return true;

    case 'RETRY_PATIENT': {
      if (msg.priorxUnlocked !== true) {
        broadcastToPanel(tabId, { type: 'STATE_UPDATE', state: 'NO_PATIENT' });
        break;
      }
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
    broadcastToPanel(tabId, {
      type: 'STATE_UPDATE',
      state: 'ERROR',
      error: err.message,
      status: err.status || 0,
    });
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

function messageLanguage(msgPatient, patient) {
  const value = msgPatient?.language ?? patient?.language;
  return value === 'EN' ? 'EN' : 'FR';
}

async function handleNotifySend(tabId, sendResponse, msgPatient, messageType) {
  const patient = tabState[tabId]?.patient ?? msgPatient;
  if (!patient) return sendResponse({ ok: false, error: 'No patient' });

  try {
    const req = notifySend({
      phoneNumber: patient.phoneRaw,
      messageType,
      sentBy: patient.user,
      language: messageLanguage(msgPatient, patient),
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
    sendResponse({ ok: true, status: 200, confirmations });
  } catch (err) {
    sendResponse({ ok: false, status: err.status || 0, error: err.message });
  }
}

async function handleMessagesHistory(phoneNumber, sendResponse) {
  try {
    const req = messagesHistory(phoneNumber);
    const result = await apiRequest(req.method, req.path, req.body);
    const messages = Array.isArray(result.messages) ? result.messages : [];
    sendResponse({ ok: true, status: 200, messages });
  } catch (err) {
    const unavailable = err.status === 404;
    sendResponse({
      ok: false,
      status: err.status || 0,
      unavailable,
      error: unavailable
        ? "L'historique n'est pas disponible. Mettez à jour le serveur avec cette extension."
        : "Impossible de charger l'historique.",
    });
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
  try {
    await getConfig();
  } catch {
    chrome.runtime.openOptionsPage();
  }
});
