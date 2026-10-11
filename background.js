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
import { consentSaveBlockedBySms, smsOptOutFromLookup } from './consent-opt-out.mjs';
import { describeRequestFailure, phoneBlockedMessage } from './notify-errors.mjs';
import { pickRuntimeConfig } from './runtime-config.mjs';

// Keyed by tabId — current patient and consent for that Priorx tab.
const tabState = {};
// Drops a consent lookup that returns after a newer one for the same tab.
const consentLookupSeq = {};

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
  const text = await res.text();
  if (!res.ok) {
    const error = new Error(`API ${method} ${path} → ${res.status}`);
    error.status = res.status;
    error.body = parseJsonBody(text);
    throw error;
  }
  if (!text) return {};
  return JSON.parse(text);
}

function parseJsonBody(text) {
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
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
      consentLookupSeq[tabId] = (consentLookupSeq[tabId] || 0) + 1;
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
        handlePatientChanged(tabId, patient, { quiet: msg.quiet === true });
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

function lookupStillCurrent(tabId, seq, patient) {
  if (consentLookupSeq[tabId] !== seq) return false;
  const current = tabState[tabId]?.patient;
  if (!current || !patient) return false;
  if ((current.phoneRaw || '') !== (patient.phoneRaw || '')) return false;
  if (patient.lookupToken != null && current.lookupToken != null
      && current.lookupToken !== patient.lookupToken) {
    return false;
  }
  return true;
}

function stateMessage(state, patient, extra = {}) {
  return {
    type: 'STATE_UPDATE',
    state,
    patient,
    lookupToken: patient?.lookupToken ?? null,
    phoneRaw: patient?.phoneRaw || '',
    ...extra,
  };
}

async function handlePatientChanged(tabId, patient, options = {}) {
  const quiet = options.quiet === true;
  const seq = (consentLookupSeq[tabId] || 0) + 1;
  consentLookupSeq[tabId] = seq;
  if (!quiet || !tabState[tabId]) {
    tabState[tabId] = { patient, consent: null };
  } else {
    tabState[tabId].patient = patient;
  }

  // A quiet refresh keeps the ARRÊT notice on screen while it rechecks.
  // Showing Vérification… on each poll would flash the panel.
  if (!quiet) {
    broadcastToPanel(tabId, stateMessage('LOADING', patient));
  }

  if (!patient.phoneRaw || patient.phoneRaw.length < 10) {
    if (!lookupStillCurrent(tabId, seq, patient)) return;
    broadcastToPanel(tabId, stateMessage('NO_PHONE', patient));
    return;
  }

  try {
    const req = consentLookup(patient.phoneRaw);
    const result = await apiRequest(req.method, req.path, req.body);
    if (!lookupStillCurrent(tabId, seq, patient)) return;
    const consent = result.consent;
    tabState[tabId].consent = consent;
    const smsOptOut = smsOptOutFromLookup(result);

    broadcastToPanel(tabId, stateMessage(
      smsOptOut ? 'SMS_OPT_OUT' : consentToState(consent),
      patient,
      {
        consentDate: result.consent_date || null,
        needsReinscription: result.needs_reinscription || false,
        smsOptOut,
      },
    ));
  } catch (err) {
    if (!lookupStillCurrent(tabId, seq, patient)) return;
    if (quiet) return;
    const failure = describeRequestFailure(err, 'lookup');
    console.warn('[NotiRx] consent lookup failed', err.status || 0);
    broadcastToPanel(tabId, stateMessage('ERROR', patient, {
      error: failure.message,
      status: err.status || 0,
    }));
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
    broadcastToPanel(tabId, stateMessage(consentToState(consent), patient));
    sendResponse({ ok: true });
  } catch (err) {
    if (consentSaveBlockedBySms(err.status, consent)) {
      if (tabState[tabId]) tabState[tabId].consent = 'no';
      broadcastToPanel(tabId, stateMessage('SMS_OPT_OUT', patient, {
        smsOptOut: true,
        status: 409,
      }));
      sendResponse({ ok: false, smsOptOut: true, status: 409 });
      return;
    }
    const failure = describeRequestFailure(err, 'consent');
    sendResponse({ ok: false, error: failure.message, status: err.status || 0 });
  }
}

function messageLanguage(msgPatient, patient) {
  const value = msgPatient?.language ?? patient?.language;
  return value === 'EN' ? 'EN' : 'FR';
}

async function handleNotifySend(tabId, sendResponse, msgPatient, messageType) {
  const patient = tabState[tabId]?.patient ?? msgPatient;
  if (!patient) return sendResponse({ ok: false, error: 'No patient' });

  const blocked = phoneBlockedMessage(patient.phoneRaw);
  if (blocked) {
    broadcastToPanel(tabId, { type: 'NOTIFY_ERROR', error: blocked });
    sendResponse({ ok: false, error: blocked });
    return;
  }

  try {
    const req = notifySend({
      phoneNumber: patient.phoneRaw,
      messageType,
      sentBy: patient.user,
      language: messageLanguage(msgPatient, patient),
    });
    const result = await apiRequest(req.method, req.path, req.body);
    broadcastToPanel(tabId, {
      type: 'NOTIFY_SUCCESS',
      messageSid: result.message_sid,
      phoneRaw: patient.phoneRaw,
    });
    sendResponse({ ok: true });
  } catch (err) {
    const failure = describeRequestFailure(err, 'notify');
    console.warn('[NotiRx] notify failed', err.status || 0);
    if (failure.consentRevoked && tabState[tabId]) tabState[tabId].consent = 'no';
    if (failure.smsOptOut) {
      if (tabState[tabId]) tabState[tabId].consent = 'no';
      broadcastToPanel(tabId, stateMessage('SMS_OPT_OUT', patient, {
        smsOptOut: true,
        status: err.status || 409,
      }));
      sendResponse({ ok: false, smsOptOut: true, error: failure.message, status: err.status || 409 });
      return;
    }
    broadcastToPanel(tabId, {
      type: 'NOTIFY_ERROR',
      error: failure.message,
      consentRevoked: failure.consentRevoked,
      mayHaveSent: failure.mayHaveSent,
      phoneRaw: patient.phoneRaw,
    });
    sendResponse({ ok: false, error: failure.message, status: err.status || 0 });
  }
}

async function handleConfirmationsList(sendResponse) {
  try {
    const req = confirmationsList();
    const result = await apiRequest(req.method, req.path, req.body);
    const confirmations = Array.isArray(result.confirmations) ? result.confirmations : [];
    sendResponse({ ok: true, status: 200, confirmations });
  } catch (err) {
    console.warn('[NotiRx] confirmations failed', err.status || 0);
    sendResponse({
      ok: false,
      status: err.status || 0,
      error: 'Impossible de charger les confirmations.',
    });
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
    // The row is already gone in the page. Log enough to debug, and do not
    // ask the widget to put the row back or to show a toast.
    console.warn("[NotiRx] Fait : échec de l'enregistrement", {
      confirmationId,
      status: err.status || 0,
    });
    sendResponse({
      ok: false,
      status: err.status || 0,
      error: 'Impossible d\'enregistrer cette réponse.',
    });
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
