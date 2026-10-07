// French text for POST /notify (and the lookup / consent calls that share
// the widget). The service worker maps status + JSON error code here.
// The widget never shows "API POST /notify → 502".

export const MESSAGES = {
  invalidPhone: 'Numéro invalide ou non joignable par texto. Vérifiez le numéro dans le dossier.',
  sendsPaused: 'Envois temporairement suspendus',
  providerSlow: 'Service SMS lent, réessayez dans un instant',
  providerTimeout: 'Service SMS lent. Le texto a peut-être déjà été envoyé. Vérifiez l\'historique avant de réessayer, pour éviter un doublon.',
  providerError: 'Le service SMS n\'a pas répondu correctement. Réessayez dans un instant.',
  dailyLimit: 'Limite quotidienne d\'envois atteinte.',
  noConsent: 'Aucun consentement pour ce numéro.',
  unsubscribed: 'Ce numéro est désabonné des textos. Le patient doit texter COMMENCER pour se réabonner.',
  generic: 'L\'envoi n\'a pas abouti. Réessayez dans un instant.',
  lookupFailed: 'Impossible de vérifier le consentement. Réessayez dans un instant.',
  consentSaveFailed: 'Impossible d\'enregistrer le consentement. Réessayez dans un instant.',
};

const INVALID_CODES = new Set([
  'invalid_phone',
  'invalid_number',
  'not_mobile',
  'unreachable',
]);

const UNSUBSCRIBED_CODES = new Set([
  'unsubscribed',
  'stop',
  'opted_out',
  'sms_opt_out',
]);

const PAUSED_CODES = new Set([
  'sends_disabled',
  'sending_disabled',
  'temporarily_disabled',
]);

const LIMIT_CODES = new Set([
  'daily_limit',
  'rate_limited',
  'rate_limit',
  'quota_exceeded',
  'too_many_requests',
]);

function errorCode(body) {
  if (!body || typeof body !== 'object') return '';
  const raw = body.error ?? body.code ?? body.error_code ?? '';
  return String(raw).trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function errorText(body) {
  if (!body || typeof body !== 'object') return '';
  const raw = body.error ?? body.message ?? '';
  return typeof raw === 'string' ? raw : '';
}

function plain(message, extra = {}) {
  return {
    message,
    consentRevoked: false,
    smsOptOut: false,
    mayHaveSent: false,
    ...extra,
  };
}

// Same rule as patient-watch.js. A parity test keeps the two copies together.
export function phoneBlockedMessage(phoneRaw) {
  const digits = String(phoneRaw ?? '').replace(/\D/g, '');
  let national = digits;
  if (digits.length === 11 && digits.startsWith('1')) national = digits.slice(1);
  if (national.length !== 10) return '';
  const area = national.slice(0, 3);
  const exchange = national.slice(3, 6);
  if (area[0] === '0' || area[0] === '1') return MESSAGES.invalidPhone;
  if (area === '555' && exchange === '555') return MESSAGES.invalidPhone;
  return '';
}

export function describeRequestFailure(err, action = 'notify') {
  const status = Number(err?.status) || 0;
  const code = errorCode(err?.body);
  const text = errorText(err?.body);
  const paused = PAUSED_CODES.has(code) || /temporarily disabled/i.test(text);

  if (action === 'notify' && (status === 403 || code === 'no_consent' || code === 'consent_required')) {
    return plain(MESSAGES.noConsent, { consentRevoked: true });
  }
  if (action === 'notify' && (status === 409 || UNSUBSCRIBED_CODES.has(code))) {
    return plain(MESSAGES.unsubscribed, { smsOptOut: true });
  }
  if (INVALID_CODES.has(code) || (action === 'notify' && status === 422)) {
    return plain(MESSAGES.invalidPhone);
  }
  if (status === 429 || LIMIT_CODES.has(code)) {
    return plain(MESSAGES.dailyLimit);
  }
  if (paused) return plain(MESSAGES.sendsPaused);
  if (code === 'provider_timeout' || status === 504) {
    if (action === 'notify') return plain(MESSAGES.providerTimeout, { mayHaveSent: true });
    return plain(MESSAGES.lookupFailed);
  }
  if (code === 'provider_error') {
    return plain(action === 'notify' ? MESSAGES.providerError : MESSAGES.lookupFailed);
  }
  if (status === 502 || status === 503) {
    if (action === 'notify') return plain(MESSAGES.providerTimeout, { mayHaveSent: true });
    if (action === 'consent') return plain(MESSAGES.consentSaveFailed);
    return plain(MESSAGES.lookupFailed);
  }
  if (action === 'lookup') return plain(MESSAGES.lookupFailed);
  if (action === 'consent') return plain(MESSAGES.consentSaveFailed);
  return plain(MESSAGES.generic);
}
