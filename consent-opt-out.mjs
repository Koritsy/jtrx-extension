// SMS opt-out: the patient texted STOP / ARRÊT.
//
// POST /consent/lookup, as this extension already reads it, returns
// consent, consent_date, and needs_reinscription. needs_reinscription means
// the patient texted a stop keyword and has not texted COMMENCER, INSCRIPTION,
// or START. Staff cannot set consent back to yes: POST /consent answers 409.
//
// Koritsy/jtrx-backend was not readable from this environment. If lookup also
// sends one of the optional fields below, that is treated the same way.
// A useful addition, if needs_reinscription is not set while consent is "no"
// after ARRÊT, is a boolean sms_opt_out on the lookup body, true until the
// patient texts a start keyword.
//
// consent "yes" means the patient is subscribed again. The normal screen
// returns even if an older flag is still present.

export const SMS_OPT_OUT_NOTICE =
  'Le patient a répondu ARRÊT par texto. Il doit texter COMMENCER pour se réabonner.';

const OPTIONAL_FLAGS = ['sms_opt_out', 'opted_out_by_sms'];

function isTrue(value) {
  return value === true || value === 'true';
}

export function smsOptOutFromLookup(body) {
  if (!body || typeof body !== 'object') return false;
  if (body.consent === 'yes') return false;
  if (OPTIONAL_FLAGS.some((key) => isTrue(body[key]))) return true;
  const source = typeof body.opt_out_source === 'string' ? body.opt_out_source.trim().toLowerCase() : '';
  if (source === 'sms' || source === 'twilio') return true;
  return isTrue(body.needs_reinscription);
}

// POST /consent → 409 when staff try to set yes after an SMS opt-out.
// The status is the contract. The body is not required.
export function consentSaveBlockedBySms(status, consent) {
  return Number(status) === 409 && consent === 'yes';
}
