// J.T.Rx side panel — handles all UI state transitions and user interactions.

import { CONFIG } from '../config.js';

// ── State ──────────────────────────────────────────────────────────────────

let currentState  = 'NO_PATIENT';
let currentPatient = null;
let validationPending = false;

// ── Init ───────────────────────────────────────────────────────────────────

document.getElementById('pharmacy-name').textContent = CONFIG.PHARMACY_NAME;

// ── View manager ───────────────────────────────────────────────────────────

const VIEWS = [
  'no-patient', 'loading', 'no-phone',
  'unknown', 'opted-in', 'opted-out',
  'validation-prompt', 'error',
];

function showView(name) {
  VIEWS.forEach(v => {
    const el = document.getElementById(`view-${v}`);
    if (!el) return;
    el.classList.toggle('active', v === name);
    el.classList.toggle('hidden', v !== name);
  });
}

function resetNotifyUI() {
  document.getElementById('notify-area').classList.remove('hidden');
  document.getElementById('notify-confirm').classList.add('hidden');
  document.getElementById('notify-success').classList.add('hidden');
}

// ── Message listener (from background.js) ─────────────────────────────────

chrome.runtime.onMessage.addListener((msg) => {
  switch (msg.type) {

    case 'STATE_UPDATE':
      currentState   = msg.state;
      currentPatient = msg.patient || null;
      applyState(msg);
      break;

    case 'VALIDATION_PROMPT':
      currentPatient = msg.patient || currentPatient;
      showValidationPrompt();
      break;

    case 'NOTIFY_SUCCESS':
      document.getElementById('notify-confirm').classList.add('hidden');
      document.getElementById('notify-area').classList.add('hidden');
      document.getElementById('notify-success').classList.remove('hidden');
      setTimeout(resetNotifyUI, 3000);
      break;

    case 'NOTIFY_ERROR':
      resetNotifyUI();
      alert(`Erreur d'envoi: ${msg.error}`);
      break;
  }
});

function applyState(msg) {
  const p = msg.patient;

  switch (msg.state) {

    case 'NO_PATIENT':
      showView('no-patient');
      break;

    case 'LOADING':
      showView('loading');
      break;

    case 'NO_PHONE':
      fillEl('np-name', formatName(p));
      showView('no-phone');
      break;

    case 'UNKNOWN':
      fillEl('un-name', formatName(p));
      fillEl('un-phone', formatPhone(p.phoneRaw));
      showView('unknown');
      break;

    case 'OPTED_IN':
      fillEl('oi-name', formatName(p));
      fillEl('oi-phone', formatPhone(p.phoneRaw));
      resetNotifyUI();
      showView('opted-in');
      break;

    case 'OPTED_OUT':
      fillEl('oo-name', formatName(p));
      fillEl('oo-phone', formatPhone(p.phoneRaw));
      showView('opted-out');
      break;

    case 'ERROR':
      document.getElementById('error-msg').textContent = msg.error || '';
      showView('error');
      break;
  }
}

function showValidationPrompt() {
  if (!currentPatient) return;
  validationPending = true;
  fillEl('vp-name', formatName(currentPatient));
  document.getElementById('view-validation-prompt').classList.remove('hidden');
  document.getElementById('view-validation-prompt').classList.add('active');
}

function hideValidationPrompt() {
  validationPending = false;
  document.getElementById('view-validation-prompt').classList.add('hidden');
  document.getElementById('view-validation-prompt').classList.remove('active');
}

// ── Button handlers ────────────────────────────────────────────────────────

// UNKNOWN → save Oui
document.getElementById('btn-oui').addEventListener('click', () => {
  saveConsent('yes');
});

// UNKNOWN → save Non
document.getElementById('btn-non').addEventListener('click', () => {
  saveConsent('no');
});

// OPTED_IN → show confirmation
document.getElementById('btn-notify').addEventListener('click', () => {
  document.getElementById('notify-confirm').classList.remove('hidden');
  document.getElementById('notify-area').classList.add('hidden');
});

// Confirmation → send
document.getElementById('btn-confirm-yes').addEventListener('click', () => {
  sendNotification();
});

// Confirmation → cancel
document.getElementById('btn-confirm-no').addEventListener('click', () => {
  resetNotifyUI();
});

// OPTED_IN → revoke consent
document.getElementById('btn-revoke').addEventListener('click', () => {
  if (confirm('Retirer le consentement de ce patient?')) {
    saveConsent('no');
  }
});

// OPTED_OUT → reopen prompt (shows UNKNOWN view)
document.getElementById('btn-change-consent').addEventListener('click', () => {
  if (!currentPatient) return;
  fillEl('un-name', formatName(currentPatient));
  fillEl('un-phone', formatPhone(currentPatient.phoneRaw));
  showView('unknown');
});

// Validation prompt → send
document.getElementById('btn-validation-send').addEventListener('click', () => {
  hideValidationPrompt();
  sendNotification();
});

// Validation prompt → dismiss
document.getElementById('btn-validation-dismiss').addEventListener('click', () => {
  hideValidationPrompt();
});

// Error → retry (re-request patient state from background)
document.getElementById('btn-retry').addEventListener('click', () => {
  showView('loading');
  chrome.runtime.sendMessage({ type: 'RETRY_PATIENT' });
});

// ── API calls (routed through background.js) ──────────────────────────────

function saveConsent(consent) {
  showView('loading');
  chrome.runtime.sendMessage({
    type: 'CONSENT_SAVE',
    data: { consent, recordedBy: currentPatient?.user || 'unknown' },
  }, (response) => {
    if (!response?.ok) {
      document.getElementById('error-msg').textContent = response?.error || '';
      showView('error');
    }
  });
}

function sendNotification() {
  chrome.runtime.sendMessage({ type: 'NOTIFY_SEND' });
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fillEl(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function formatName(p) {
  if (!p) return '';
  return `${p.lastName?.toUpperCase() || ''}, ${p.firstName || ''}`.trim().replace(/^,\s*/, '');
}

function formatPhone(raw) {
  if (!raw || raw.length < 10) return raw || '';
  const d = raw.replace(/\D/g, '');
  if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
  if (d.length === 11) return `+${d[0]} (${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`;
  return raw;
}
