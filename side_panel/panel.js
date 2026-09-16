// J.T.Rx side panel — handles all UI state transitions and user interactions.

import { CONFIG } from '../config.js';

// ── State ──────────────────────────────────────────────────────────────────

let currentState  = 'NO_PATIENT';
let currentPatient = null;
let validationPending = false;
let pendingNotifyType = 'ready';
let confirmationsPollTimer = null;

const NOTIFY_LABELS = {
  ready:            'Envoyer la notification "commande prête" à ce patient?',
  partial:          'Envoyer la notification "médicaments en commande" à ce patient?',
  new_prescription: 'Envoyer la notification "nouvelle prescription reçue" à ce patient?',
  renewal:          'Envoyer la notification "ordonnances dues" à ce patient?',
};

// ── Init ───────────────────────────────────────────────────────────────────

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
      if (msg.consentRevoked) {
        chrome.runtime.sendMessage({ type: 'RETRY_PATIENT', patient: currentPatient });
      } else {
        document.getElementById('error-msg').textContent = msg.error || '';
        showView('error');
      }
      break;
  }
});

// ── Top nav (Patient / Confirmations) ─────────────────────────────────────

document.getElementById('nav-tab-patient').addEventListener('click', () => {
  setActiveTab('patient');
});

document.getElementById('nav-tab-confirmations').addEventListener('click', () => {
  setActiveTab('confirmations');
  fetchConfirmations();
});

function setActiveTab(tab) {
  document.getElementById('nav-tab-patient').classList.toggle('active', tab === 'patient');
  document.getElementById('nav-tab-confirmations').classList.toggle('active', tab === 'confirmations');
  document.getElementById('patient-panel').classList.toggle('hidden', tab !== 'patient');
  document.getElementById('view-confirmations').classList.toggle('hidden', tab !== 'confirmations');
}

// ── Confirmations ──────────────────────────────────────────────────────────

function fetchConfirmations() {
  chrome.runtime.sendMessage({ type: 'CONFIRMATIONS_LIST' }, (response) => {
    if (!response?.ok) return;
    renderConfirmations(response.confirmations || []);
  });
}

function renderConfirmations(items) {
  const listEl  = document.getElementById('confirmations-list');
  const emptyEl = document.getElementById('confirmations-empty');
  const badgeEl = document.getElementById('confirmations-badge');

  badgeEl.textContent = items.length;
  badgeEl.classList.toggle('hidden', items.length === 0);

  emptyEl.classList.toggle('hidden', items.length > 0);
  listEl.innerHTML = '';

  items.forEach(item => {
    const div = document.createElement('div');
    div.className = 'confirmation-item';
    div.innerHTML = `
      <div class="confirmation-info">
        <div class="confirmation-name">${escapeHtml(item.patient_name || 'Numéro inconnu')}</div>
        <div class="confirmation-time">${formatConfirmationTime(item.replied_at)}</div>
      </div>
      <button class="btn-dismiss" data-confirmation-id="${item.confirmation_id}">✓ Fait</button>
    `;
    listEl.appendChild(div);
  });

  listEl.querySelectorAll('.btn-dismiss').forEach(btn => {
    btn.addEventListener('click', () => dismissConfirmation(btn.dataset.confirmationId));
  });
}

function dismissConfirmation(confirmationId) {
  chrome.runtime.sendMessage(
    { type: 'CONFIRMATION_DISMISS', confirmationId },
    (response) => {
      if (response?.ok) fetchConfirmations();
    }
  );
}

function formatConfirmationTime(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('fr-CA', {
      dateStyle: 'short', timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Poll for new confirmations every 20s so the badge count stays current
// even while the technician is looking at the Patient tab.
function startConfirmationsPolling() {
  fetchConfirmations();
  confirmationsPollTimer = setInterval(fetchConfirmations, 20000);
}

startConfirmationsPolling();

function applyState(msg) {
  document.getElementById('reinscription-notice')?.classList.add('hidden');
  const p = msg.patient;

  switch (msg.state) {

    case 'NO_PATIENT':
      showView('no-patient');
      break;

    case 'LOADING':
      showView('loading');
      break;

    case 'NO_PHONE':
      showView('no-phone');
      break;

    case 'UNKNOWN':
      showView('unknown');
      break;

    case 'OPTED_IN':
      resetNotifyUI();
      showView('opted-in');
      // Show persistent warning if patient STOP'd and hasn't re-opted-in via INSCRIPTION
      if (msg.needsReinscription) {
        document.getElementById('reinscription-notice').classList.remove('hidden');
      }
      break;

    case 'OPTED_OUT':
      showView('opted-out');
      break;

    case 'ERROR':
      document.getElementById('error-msg').textContent = msg.error || '';
      showView('error');
      break;
  }
}

function showValidationPrompt() {
  validationPending = true;
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

// OPTED_IN → show confirmation (one listener per notify-type button)
document.querySelectorAll('#notify-area [data-notify-type]').forEach(btn => {
  btn.addEventListener('click', () => {
    pendingNotifyType = btn.dataset.notifyType;
    document.getElementById('notify-confirm-text').textContent =
      NOTIFY_LABELS[pendingNotifyType] || NOTIFY_LABELS.ready;
    document.getElementById('notify-confirm').classList.remove('hidden');
    document.getElementById('notify-area').classList.add('hidden');
  });
});

// Confirmation → send
document.getElementById('btn-confirm-yes').addEventListener('click', () => {
  sendNotification(pendingNotifyType);
});

// Confirmation → cancel
document.getElementById('btn-confirm-no').addEventListener('click', () => {
  resetNotifyUI();
});

// OPTED_IN → show revoke confirmation
document.getElementById('btn-revoke').addEventListener('click', () => {
  document.getElementById('revoke-confirm').classList.remove('hidden');
});

document.getElementById('btn-revoke-yes').addEventListener('click', () => {
  document.getElementById('revoke-confirm').classList.add('hidden');
  saveConsent('no');
});

document.getElementById('btn-revoke-cancel').addEventListener('click', () => {
  document.getElementById('revoke-confirm').classList.add('hidden');
});

// OPTED_OUT → reopen prompt (shows UNKNOWN view)
document.getElementById('btn-change-consent').addEventListener('click', () => {
  showView('unknown');
});

// Validation prompt → send
document.getElementById('btn-validation-send').addEventListener('click', () => {
  hideValidationPrompt();
  sendNotification('ready');
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
  const wasOptedOut = currentState === 'OPTED_OUT';
  showView('loading');
  chrome.runtime.sendMessage({
    type: 'CONSENT_SAVE',
    data: { consent, recordedBy: currentPatient?.user || 'unknown', patient: currentPatient },
  }, (response) => {
    if (!response?.ok) {
      document.getElementById('error-msg').textContent = response?.error || '';
      showView('error');
    } else if (consent === 'yes' && wasOptedOut) {
      // Patient was previously STOP'd — Twilio still has them opted out
      // Show reminder to ask patient to text INSCRIPTION
      document.getElementById('reinscription-notice').classList.remove('hidden');
    } else {
      document.getElementById('reinscription-notice').classList.add('hidden');
    }
  });
}

function sendNotification(messageType) {
  chrome.runtime.sendMessage({ type: 'NOTIFY_SEND', patient: currentPatient, messageType });
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
