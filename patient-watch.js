// When Priorx opens a file it fills the name and the phone in separate steps.
// On a slow PC those steps are far enough apart that a consent lookup can
// start on the previous phone, or on an empty name. This gate waits until the
// same name and phone have sat still, then asks for one lookup. A response is
// applied only when its token and phone still match that lookup.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module && module.exports) {
    module.exports = api;
  }
  root.NotiRxPatient = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const STABLE_MS = 700;
  // Name often updates before the phone. Keep the previous file's buttons
  // hidden until the phone moves, or until this longer wait runs out.
  const PHONE_LAG_MS = 2000;

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
    const phoneRaw = info2.split(' - ')[0].trim().replace(/\D/g, '');
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

  function identityOf(patient) {
    if (!patient) return '\n\n';
    return `${patient.lastName || ''}\n${patient.firstName || ''}\n${patient.phoneRaw || ''}`;
  }

  function hasName(patient) {
    return Boolean(patient && (String(patient.lastName || '').trim() || String(patient.firstName || '').trim()));
  }

  function phoneUsable(phoneRaw) {
    return String(phoneRaw || '').replace(/\D/g, '').length >= 10;
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

  function createPatientGate(options = {}) {
    const stableMs = Number.isFinite(options.stableMs) ? options.stableMs : STABLE_MS;
    const phoneLagMs = Number.isFinite(options.phoneLagMs) ? options.phoneLagMs : PHONE_LAG_MS;

    let token = 0;
    let pendingKey = null;
    let pendingPatient = null;
    let pendingHold = false;
    let since = 0;
    let committed = null;
    let queuedToken = 0;
    let mode = 'empty';

    function reset() {
      token += 1;
      pendingKey = null;
      pendingPatient = null;
      pendingHold = false;
      since = 0;
      committed = null;
      queuedToken = 0;
      mode = 'empty';
    }

    function waitNeeded() {
      let need = stableMs;
      const pending = pendingPatient;
      if (pendingHold) need = Math.max(need, phoneLagMs);
      if (pending && hasName(pending) && !phoneUsable(pending.phoneRaw)) {
        need = Math.max(need, phoneLagMs);
      }
      return need;
    }

    function snapshot(now) {
      const display = mode === 'empty' ? null : (committed ? committed.patient : pendingPatient);
      const need = waitNeeded();
      const waitMs = mode === 'settling' ? Math.max(0, need - (now - since)) : 0;
      const startLookup = Boolean(
        committed && mode === 'awaiting' && queuedToken !== committed.token,
      );
      return {
        mode,
        waitMs,
        startLookup,
        allowsActions: mode === 'settled',
        lookupToken: committed ? committed.token : token,
        patient: display ? { ...display } : null,
        phoneRaw: committed?.patient?.phoneRaw || pendingPatient?.phoneRaw || '',
      };
    }

    function note(patient, now, noteOptions = {}) {
      const sample = patient || {
        lastName: '', firstName: '', phoneRaw: '', user: '', language: 'FR',
      };
      const key = identityOf(sample);
      const immediate = noteOptions.immediate === true;

      if (key !== pendingKey || immediate) {
        const previous = committed?.patient || pendingPatient;
        const nameChanged = namesDiffer(previous, sample);
        const phoneStillPrevious = Boolean(
          previous && sample.phoneRaw && sample.phoneRaw === previous.phoneRaw,
        );
        pendingHold = !immediate && nameChanged && phoneStillPrevious;
        if (committed && committed.key !== key) {
          committed = null;
          queuedToken = 0;
          token += 1;
        }
        if (immediate) {
          committed = null;
          queuedToken = 0;
          pendingHold = false;
        }
        pendingKey = key;
        since = immediate ? now - Math.max(stableMs, phoneLagMs) : now;
      }

      const carriedToken = committed ? committed.token : token;
      pendingPatient = copyPatient(sample, carriedToken);

      const age = now - since;
      if (age < waitNeeded()) {
        mode = 'settling';
        return snapshot(now);
      }

      if (!hasName(sample)) {
        if (committed) token += 1;
        committed = null;
        queuedToken = 0;
        mode = 'empty';
        return snapshot(now);
      }

      if (!phoneUsable(sample.phoneRaw)) {
        committed = {
          key,
          token: committed && committed.key === key ? committed.token : (token += 1),
          patient: null,
        };
        committed.patient = copyPatient(sample, committed.token);
        queuedToken = committed.token;
        mode = 'no-phone';
        return snapshot(now);
      }

      if (!committed || committed.key !== key) {
        token += 1;
        committed = { key, token, patient: copyPatient(sample, token) };
        mode = 'awaiting';
        return snapshot(now);
      }

      committed.patient = copyPatient(sample, committed.token);
      return snapshot(now);
    }

    function force(patient, now) {
      pendingKey = null;
      pendingHold = false;
      committed = null;
      queuedToken = 0;
      return note(patient, now || 0, { immediate: true });
    }

    function markLookupQueued(lookupToken) {
      if (committed && committed.token === lookupToken) queuedToken = lookupToken;
    }

    function matchesLookup(message) {
      if (!committed) return false;
      if (mode !== 'awaiting' && mode !== 'settled') return false;
      const messageToken = Number(message?.lookupToken);
      if (!Number.isFinite(messageToken) || messageToken !== committed.token) return false;
      const phone = message?.phoneRaw ?? message?.patient?.phoneRaw ?? '';
      return String(phone) === String(committed.patient.phoneRaw || '');
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
      matchesLookup,
      acceptLookup,
      current,
    };
  }

  return {
    STABLE_MS,
    PHONE_LAG_MS,
    fieldText,
    readPatientFields,
    phoneUsable,
    phoneBlockedMessage,
    createPatientGate,
  };
});
