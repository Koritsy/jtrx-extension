import { normalizeApiBaseUrl, normalizeApiKey, pickRuntimeConfig } from './runtime-config.mjs';

const STORE_HOST_PATTERN = 'https://4502812786.priorx.ca/*';

const urlInput = document.getElementById('api-base-url');
const keyInput = document.getElementById('api-key');
const statusEl = document.getElementById('status');
const hostWarning = document.getElementById('host-warning');
const intro = document.getElementById('intro');
const submitButton = document.querySelector('#config-form button[type="submit"]');

function showStatus(text, ok) {
  statusEl.textContent = text;
  statusEl.className = ok ? 'ok' : 'bad';
}

function showHostWarning() {
  const manifest = chrome.runtime.getManifest();
  const matches = manifest.content_scripts?.[0]?.matches ?? [];
  const hosts = manifest.host_permissions ?? [];
  const same = matches.length === 1 && hosts.length === 1 && matches[0] === hosts[0];
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

async function readArea(area) {
  try {
    return await area.get(['apiBaseUrl', 'apiKey']);
  } catch {
    return {};
  }
}

async function load() {
  showHostWarning();
  const [managed, local] = await Promise.all([
    readArea(chrome.storage.managed),
    readArea(chrome.storage.local),
  ]);
  const picked = pickRuntimeConfig(managed, local);
  if (picked.source === 'managed') {
    if (picked.ok) urlInput.value = picked.apiBaseUrl;
    lockManagedForm(
      picked.ok
        ? 'Configuration administrateur active. Rechargez l’onglet Priorx.'
        : 'La configuration fournie par l’administrateur est incomplète ou invalide.',
      picked.ok,
    );
    return;
  }
  urlInput.value = local.apiBaseUrl || '';
  keyInput.value = local.apiKey || '';
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
  urlInput.value = apiBaseUrl;
  showStatus('Enregistré sur cet ordinateur. Rechargez l’onglet Priorx.', true);
});

load();
