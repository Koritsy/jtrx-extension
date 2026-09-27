// Where the API address and API key come from.
// An administrator policy (chrome.storage.managed) wins when it sets either value.
// Otherwise the Options page values in chrome.storage.local are used.

export function normalizeApiBaseUrl(raw) {
  let url;
  try {
    url = new URL(String(raw ?? '').trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  if (url.search || url.hash) return null;
  const path = url.pathname.replace(/\/+$/, '');
  return `${url.origin}${path}`;
}

export function normalizeApiKey(raw) {
  if (typeof raw !== 'string') return null;
  const apiKey = raw.trim();
  if (!apiKey || /\s/.test(apiKey) || apiKey.length > 256) return null;
  return apiKey;
}

function filled(value) {
  return typeof value === 'string' && value.trim() !== '';
}

export function pickRuntimeConfig(managed = {}, local = {}) {
  const managedPresent = filled(managed.apiBaseUrl) || filled(managed.apiKey);
  if (managedPresent) {
    const apiBaseUrl = normalizeApiBaseUrl(managed.apiBaseUrl);
    const apiKey = normalizeApiKey(managed.apiKey);
    if (!apiBaseUrl || !apiKey) return { ok: false, source: 'managed' };
    return { ok: true, source: 'managed', apiBaseUrl, apiKey };
  }

  const apiBaseUrl = normalizeApiBaseUrl(local.apiBaseUrl);
  const apiKey = normalizeApiKey(local.apiKey);
  if (!apiBaseUrl || !apiKey) return { ok: false, source: 'local' };
  return { ok: true, source: 'local', apiBaseUrl, apiKey };
}
