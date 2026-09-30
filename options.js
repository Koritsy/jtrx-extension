import { normalizeApiBaseUrl, normalizeApiKey, pickRuntimeConfig } from './runtime-config.mjs';

const STORE_HOST_PATTERN = 'https://4502812786.priorx.ca/*';
const API_GATEWAY_SUFFIX = '.execute-api.ca-central-1.amazonaws.com';

function apiGatewayHost(apiBaseUrl) {
  try {
    const url = new URL(apiBaseUrl);
    return url.protocol === 'https:' && url.hostname.endsWith(API_GATEWAY_SUFFIX);
  } catch {
    return false;
  }
}

const urlInput = document.getElementById('api-base-url');
const keyInput = document.getElementById('api-key');
const statusEl = document.getElementById('status');
const hostWarning = document.getElementById('host-warning');
const intro = document.getElementById('intro');
const submitButton = document.querySelector('#config-form button[type="submit"]');
const idleInput = document.getElementById('idle-minutes');
const lockDebugInput = document.getElementById('lock-debug');

function idleMinutesFromInput() {
  const Lock = globalThis.NotiRxLock;
  if (!Lock) return 5;
  return Lock.normalizeIdleLockMinutes(idleInput.value);
}

async function saveIdleSetting() {
  const minutes = idleMinutesFromInput();
  idleInput.value = String(minutes);
  await chrome.storage.local.set({
    idleLockMinutes: minutes,
    lockDebug: lockDebugInput.checked,
  });
}

function showStatus(text, ok) {
  statusEl.textContent = text;
  statusEl.className = ok ? 'ok' : 'bad';
}

function showHostWarning() {
  const manifest = chrome.runtime.getManifest();
  const matches = manifest.content_scripts?.[0]?.matches ?? [];
  const hosts = manifest.host_permissions ?? [];
  const priorxHosts = hosts.filter((host) => String(host).includes('priorx.ca'));
  const same = matches.length === 1 && priorxHosts.length === 1 && matches[0] === priorxHosts[0];
  if (!same) {
    hostWarning.hidden = false;
    hostWarning.textContent = 'Dans manifest.json, host_permissions et content_scripts.matches doivent contenir exactement la même adresse Priorx.';
    return;
  }
  if (matches[0] !== STORE_HOST_PATTERN) {
    hostWarning.hidden = false;
    hostWarning.textContent = 'Cette copie est limitée à https://4502812786.priorx.ca. Une autre succursale a son propre sous-domaine priorx.ca et doit être ajoutée telle quelle, sans *.priorx.ca.';
    return;
  }
  if (!hosts.includes('https://*.execute-api.ca-central-1.amazonaws.com/*')) {
    hostWarning.hidden = false;
    hostWarning.textContent = 'host_permissions doit inclure https://*.execute-api.ca-central-1.amazonaws.com/*. Sans cette ligne, Chrome bloque les appels API.';
    return;
  }
  hostWarning.hidden = true;
}

function lockManagedForm(message, ok) {
  urlInput.disabled = true;
  keyInput.disabled = true;
  keyInput.value = '';
  keyInput.placeholder = 'Définie par l’administrateur';
  urlInput.required = false;
  keyInput.required = false;
  submitButton.disabled = true;
  intro.textContent = 'L’adresse du service et la clé API de cette pharmacie sont fournies par l’administrateur de cet ordinateur.';
  showStatus(message, ok);
}

async function readArea(area, keys) {
  try {
    return await area.get(keys);
  } catch {
    return {};
  }
}

function showIdleSetting(local) {
  const Lock = globalThis.NotiRxLock;
  idleInput.value = String(
    local.idleLockMinutes == null
      ? (Lock ? Lock.DEFAULT_IDLE_LOCK_MINUTES : 5)
      : (Lock ? Lock.normalizeIdleLockMinutes(local.idleLockMinutes) : 5),
  );
  lockDebugInput.checked = Boolean(local.lockDebug);
}

async function load() {
  showHostWarning();
  const [managed, local] = await Promise.all([
    readArea(chrome.storage.managed, ['apiBaseUrl', 'apiKey']),
    readArea(chrome.storage.local, ['apiBaseUrl', 'apiKey', 'idleLockMinutes', 'lockDebug']),
  ]);
  showIdleSetting(local);
  const picked = pickRuntimeConfig(managed, local);
  if (picked.source === 'managed') {
    if (picked.ok) urlInput.value = picked.apiBaseUrl;
    const hostOk = picked.ok && apiGatewayHost(picked.apiBaseUrl);
    lockManagedForm(
      !picked.ok
        ? 'La configuration fournie par l’administrateur est incomplète ou invalide.'
        : hostOk
          ? 'Configuration administrateur active. Rechargez l’onglet Priorx.'
          : 'L’adresse fournie par l’administrateur n’est pas sur execute-api.ca-central-1.amazonaws.com. L’extension ne peut pas l’appeler.',
      hostOk,
    );
    return;
  }
  urlInput.value = local.apiBaseUrl || '';
  keyInput.value = local.apiKey || '';
  const savedUrl = normalizeApiBaseUrl(local.apiBaseUrl || '');
  if (savedUrl && !apiGatewayHost(savedUrl)) {
    showStatus('Cette adresse n’est pas sur execute-api.ca-central-1.amazonaws.com. L’extension ne peut pas l’appeler.', false);
  }
}

document.getElementById('config-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const apiBaseUrl = normalizeApiBaseUrl(urlInput.value);
  const apiKey = normalizeApiKey(keyInput.value);
  if (!apiBaseUrl) {
    showStatus('L’adresse API doit être une URL https, sans identifiant dans l’adresse.', false);
    return;
  }
  if (!apiKey) {
    showStatus('Entrez la clé API, sans espace.', false);
    return;
  }
  await chrome.storage.local.set({ apiBaseUrl, apiKey });
  await saveIdleSetting();
  urlInput.value = apiBaseUrl;
  if (!apiGatewayHost(apiBaseUrl)) {
    showStatus('Enregistré, mais cette adresse n’est pas sur execute-api.ca-central-1.amazonaws.com. L’extension ne peut pas l’appeler. Utilisez l’URL API Gateway de cette région.', false);
    return;
  }
  showStatus('Enregistré sur cet ordinateur. Rechargez l’onglet Priorx.', true);
});

idleInput.addEventListener('change', () => {
  saveIdleSetting().catch(() => {});
});
lockDebugInput.addEventListener('change', () => {
  saveIdleSetting().catch(() => {});
});

load();
