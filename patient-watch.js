// When Priorx opens a file it fills the name and the phone in separate steps.
// On a slow PC those steps are far enough apart that a consent lookup can
// start on the previous phone, or on an empty name. This gate waits until the
// same name and phone have sat still, then asks for one lookup.
//
// A name change never times out into a lookup that still carries the previous
// file's phone. If that phone is still on screen more than a few seconds
// later, the gate stays on `same-phone` until the pharmacist presses
// « Même numéro — vérifier » (gate.force). A response is applied only when
// its token, name, and phone still match that lookup.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module && module.exports) {
    module.exports = api;
  }
  root.NotiRxPatient = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const STABLE_MS = 500;
  // How long a name can sit with no phone before the widget says the number
  // is missing. This wait must not start a lookup.
  const PHONE_LAG_MS = 2000;
  // Name changed, phone still the previous file. Never look that number up
  // on our own. After this, the pharmacist can confirm a shared family number.
  const SAME_PHONE_MS = 3000;
  // 10 digits, optional leading 1, with the separators Priorx and non-DSQ
  // files actually use (spaces, dots, dashes, parentheses).
  const PHONE_IN_TEXT = /(?:\+?1[\s.\-]?)?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/;

  function fieldText(el) {
    if (!el) return '';
    try {
      const tag = String(el.tagName || '').toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        return String(el.value ?? '').trim();
      }
      const text = String(el.textContent ?? '').trim();
      if (text) return text;
      if (el.value != null && String(el.value).trim()) return String(el.value).trim();
      return '';
    } catch {
      return '';
    }
  }

  function readPatientFields(doc, readLanguage) {
    const blank = { lastName: '', firstName: '', phoneRaw: '', user: '', language: 'FR' };
    if (!doc || typeof doc.getElementById !== 'function') return blank;
    let lastName = '';
    let firstName = '';
    let info2 = '';
    let user = '';
    try {
      lastName = fieldText(doc.getElementById('BA01_LastName'));
      firstName = fieldText(doc.getElementById('BA01_FirstName')).replace(/^,\s*/, '');
      info2 = fieldText(doc.getElementById('BA01_Info2'));
      user = fieldText(doc.getElementById('LoginName1'));
    } catch {
      return blank;
    }
    const phoneRaw = extractPhoneDigits(info2);
    let language = 'FR';
    if (typeof readLanguage === 'function') {
      try {
        const code = readLanguage(doc);
        language = code === 'EN' ? 'EN' : 'FR';
      } catch {
        language = 'FR';
      }
    }
    return { lastName, firstName, phoneRaw, user, language };
  }

  function extractPhoneDigits(info2) {
    const match = String(info2 || '').match(PHONE_IN_TEXT);
    if (!match) return '';
    const digits = match[0].replace(/\D/g, '');
    if (digits.length === 10) return digits;
    if (digits.length === 11 && digits.startsWith('1')) return digits;
    return '';
  }

  function identityOf(patient) {
    if (!patient) return '\n\n';
    return `${patient.lastName || ''}\n${patient.firstName || ''}\n${patient.phoneRaw || ''}`;
  }

  function hasName(patient) {
    return Boolean(patient && (String(patient.lastName || '').trim() || String(patient.firstName || '').trim()));
  }

  function phoneUsable(phoneRaw) {
    const digits = String(phoneRaw || '').replace(/\D/g, '');
    if (digits.length === 10) return true;
    return digits.length === 11 && digits.startsWith('1');
  }

  function copyPatient(patient, token) {
    return {
      lastName: patient.lastName || '',
      firstName: patient.firstName || '',
      phoneRaw: patient.phoneRaw || '',
      user: patient.user || '',
      language: patient.language === 'EN' ? 'EN' : 'FR',
      lookupToken: token,
    };
  }

  function namesDiffer(a, b) {
    if (!a || !b) return false;
    return (a.lastName || '') !== (b.lastName || '') || (a.firstName || '') !== (b.firstName || '');
  }

  // 555-555-xxxx and an area code that starts with 0 or 1 cannot receive SMS.
  // 555-010-0199 (the fictional test range) is left alone.
  function phoneBlockedMessage(phoneRaw) {
    const digits = String(phoneRaw ?? '').replace(/\D/g, '');
    let national = digits;
    if (digits.length === 11 && digits.startsWith('1')) national = digits.slice(1);
    if (national.length !== 10) return '';
    const area = national.slice(0, 3);
    const exchange = national.slice(3, 6);
    if (area[0] === '0' || area[0] === '1') {
      return 'Numéro invalide ou non joignable par texto. Vérifiez le numéro dans le dossier.';
    }
    if (area === '555' && exchange === '555') {
      return 'Numéro invalide ou non joignable par texto. Vérifiez le numéro dans le dossier.';
    }
    return '';
  }

  function blankPatient() {
    return { lastName: '', firstName: '', phoneRaw: '', user: '', language: 'FR' };
  }

  function createPatientGate(options = {}) {
    const stableMs = Number.isFinite(options.stableMs) ? options.stableMs : STABLE_MS;
    const phoneLagMs = Number.isFinite(options.phoneLagMs) ? options.phoneLagMs : PHONE_LAG_MS;
    const samePhoneMs = Number.isFinite(options.samePhoneMs) ? options.samePhoneMs : SAME_PHONE_MS;

    let token = 0;
    let pendingKey = null;
    let pendingPatient = null;
    let since = 0;
    let committed = null;
    let queuedToken = 0;
    let mode = 'empty';
    // Last file we actually looked up (or settled). A later name is not
    // allowed to inherit this phone.
    let anchor = null;
    let nameSwitchAt = 0;

    function reset() {
      token += 1;
      pendingKey = null;
      pendingPatient = null;
      since = 0;
      committed = null;
      queuedToken = 0;
      mode = 'empty';
      anchor = null;
      nameSwitchAt = 0;
    }

    function dropCommitted() {
      if (!committed) return;
      committed = null;
      queuedToken = 0;
      token += 1;
    }

    function stableRemaining(now) {
      return Math.max(0, stableMs - (now - since));
    }

    function holdsPreviousPhone(sample) {
      if (!sample || !anchor || !hasName(sample)) return false;
      if (!namesDiffer(anchor, sample)) return false;
      if (!phoneUsable(anchor.phoneRaw)) return false;
      return String(sample.phoneRaw || '') !== '' && sample.phoneRaw === anchor.phoneRaw;
    }

    function holdRemaining(now) {
      const switchAge = nameSwitchAt ? now - nameSwitchAt : (now - since);
      return Math.max(stableRemaining(now), samePhoneMs - switchAge, 0);
    }

    function phoneWaitRemaining(now) {
      return Math.max(0, Math.max(stableMs, phoneLagMs) - (now - since));
    }

    function snapshot(now, extra = {}) {
      const display = mode === 'empty'
        ? null
        : (committed ? committed.patient : pendingPatient);
      let waitMs = 0;
      if (mode === 'settling') {
        if (holdsPreviousPhone(pendingPatient)) waitMs = holdRemaining(now);
        else if (pendingPatient && hasName(pendingPatient) && !phoneUsable(pendingPatient.phoneRaw)) {
          waitMs = phoneWaitRemaining(now);
        } else {
          waitMs = stableRemaining(now);
        }
      }
      const startLookup = Boolean(
        committed && mode === 'awaiting' && queuedToken !== committed.token,
      );
      return {
        mode,
        waitMs,
        changed: extra.changed === true,
        startLookup,
        allowsActions: mode === 'settled',
        lookupToken: committed ? committed.token : token,
        patient: display ? { ...display } : null,
        phoneRaw: display?.phoneRaw || '',
      };
    }

    function note(patient, now, noteOptions = {}) {
      const sample = patient || blankPatient();
      const key = identityOf(sample);
      const immediate = noteOptions.immediate === true;
      let changed = false;

      if (key !== pendingKey || immediate) {
        changed = pendingKey !== null && key !== pendingKey;
        if (!immediate && anchor && namesDiffer(anchor, sample) && phoneUsable(anchor.phoneRaw)) {
          if (!sample.phoneRaw || sample.phoneRaw === anchor.phoneRaw) {
            if (!nameSwitchAt) nameSwitchAt = now;
          } else {
            nameSwitchAt = 0;
          }
        } else if (!immediate && anchor && !namesDiffer(anchor, sample)) {
          nameSwitchAt = 0;
        }
        if (committed && committed.key !== key) dropCommitted();
        if (immediate) {
          dropCommitted();
          nameSwitchAt = 0;
        }
        pendingKey = key;
        since = immediate ? now - Math.max(stableMs, phoneLagMs, samePhoneMs) : now;
      }

      pendingPatient = copyPatient(sample, committed ? committed.token : token);

      if (!immediate && holdsPreviousPhone(sample)) {
        if (holdRemaining(now) > 0) {
          mode = 'settling';
          return snapshot(now, { changed });
        }
        dropCommitted();
        mode = 'same-phone';
        return snapshot(now, { changed });
      }

      if (!hasName(sample)) {
        if (stableRemaining(now) > 0 && !immediate) {
          mode = 'settling';
          return snapshot(now, { changed });
        }
        // Anchor stays so a different name cannot inherit its phone.
        dropCommitted();
        mode = 'empty';
        return snapshot(now, { changed });
      }

      if (!phoneUsable(sample.phoneRaw)) {
        if (phoneWaitRemaining(now) > 0 && !immediate) {
          mode = 'settling';
          return snapshot(now, { changed });
        }
        const nextToken = committed && committed.key === key ? committed.token : (token += 1);
        committed = { key, token: nextToken, patient: null };
        committed.patient = copyPatient(sample, nextToken);
        queuedToken = nextToken;
        mode = 'no-phone';
        return snapshot(now, { changed });
      }

      if (stableRemaining(now) > 0 && !immediate) {
        mode = 'settling';
        return snapshot(now, { changed });
      }

      if (!committed || committed.key !== key) {
        token += 1;
        committed = { key, token, patient: copyPatient(sample, token) };
        anchor = copyPatient(sample, token);
        nameSwitchAt = 0;
        mode = 'awaiting';
        return snapshot(now, { changed });
      }

      committed.patient = copyPatient(sample, committed.token);
      anchor = copyPatient(sample, committed.token);
      if (mode !== 'settled') mode = 'awaiting';
      return snapshot(now, { changed });
    }

    function force(patient, now) {
      pendingKey = null;
      nameSwitchAt = 0;
      committed = null;
      queuedToken = 0;
      return note(patient, now || 0, { immediate: true });
    }

    function markLookupQueued(lookupToken) {
      if (committed && committed.token === lookupToken) queuedToken = lookupToken;
    }

    function cancelQueuedLookup(lookupToken) {
      if (queuedToken === lookupToken && mode === 'awaiting') queuedToken = 0;
    }

    function matchesLookup(message) {
      if (!committed || !committed.patient) return false;
      if (mode !== 'awaiting' && mode !== 'settled') return false;
      const messageToken = Number(message?.lookupToken);
      if (!Number.isFinite(messageToken) || messageToken !== committed.token) return false;
      const phone = String(message?.phoneRaw ?? message?.patient?.phoneRaw ?? '').replace(/\D/g, '');
      if (phone !== String(committed.patient.phoneRaw || '').replace(/\D/g, '')) return false;
      const msgPatient = message?.patient;
      if (msgPatient && namesDiffer(msgPatient, committed.patient)) return false;
      return true;
    }

    function acceptLookup(message) {
      if (!matchesLookup(message)) return { ok: false, patient: null };
      mode = 'settled';
      return { ok: true, patient: { ...committed.patient } };
    }

    function current() {
      return {
        mode,
        lookupToken: committed ? committed.token : token,
        patient: committed?.patient
          ? { ...committed.patient }
          : (pendingPatient ? { ...pendingPatient } : null),
      };
    }

    return {
      note,
      reset,
      force,
      markLookupQueued,
      cancelQueuedLookup,
      matchesLookup,
      acceptLookup,
      current,
    };
  }

  return {
    STABLE_MS,
    PHONE_LAG_MS,
    SAME_PHONE_MS,
    fieldText,
    readPatientFields,
    extractPhoneDigits,
    phoneUsable,
    phoneBlockedMessage,
    createPatientGate,
  };
});
