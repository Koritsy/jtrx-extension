const HOST_PLACEHOLDER = 'FILL-IN-PRIORX-HOST.example';

const urlInput = document.getElementById('api-base-url');
const keyInput = document.getElementById('api-key');
const statusEl = document.getElementById('status');
const hostWarning = document.getElementById('host-warning');

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
  if ((matches[0] || '').includes(HOST_PLACEHOLDER)) {
    hostWarning.hidden = false;
    hostWarning.textContent = 'Le site Priorx n’est pas encore indiqué. Dans manifest.json, remplacez FILL-IN-PRIORX-HOST.example aux deux endroits par le nom d’hôte affiché dans la barre d’adresse de Priorx (entre https:// et le / suivant), puis rechargez l’extension. Tant que ce n’est pas fait, les boutons n’apparaissent pas.';
    return;
  }
  hostWarning.hidden = true;
}

function normalizeBaseUrl(raw) {
  let url;
  try {
    url = new URL(String(raw).trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  if (url.search || url.hash) return null;
  const path = url.pathname.replace(/\/+$/, '');
  return `${url.origin}${path}`;
}

async function load() {
  showHostWarning();
  const { apiBaseUrl = '', apiKey = '' } = await chrome.storage.local.get(['apiBaseUrl', 'apiKey']);
  urlInput.value = apiBaseUrl;
  keyInput.value = apiKey;
}

document.getElementById('config-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const apiBaseUrl = normalizeBaseUrl(urlInput.value);
  const apiKey = keyInput.value.trim();
  if (!apiBaseUrl) {
    showStatus('L’adresse API doit être une URL https, sans identifiant dans l’adresse.', false);
    return;
  }
  if (!apiKey || /\s/.test(apiKey) || apiKey.length > 256) {
    showStatus('Entrez la clé API, sans espace.', false);
    return;
  }
  await chrome.storage.local.set({ apiBaseUrl, apiKey });
  urlInput.value = apiBaseUrl;
  showStatus('Enregistré sur cet ordinateur. Rechargez l’onglet Priorx.', true);
});

load();
