// J.T.Rx content script — runs on Priorx, reads DOM only, never modifies it.

(function () {
  // Verify we're actually inside Priorx before doing anything
  if (!document.getElementById('BA01_LastName')) return;

  let currentPatient = null;

  // ── Patient detection ──────────────────────────────────────────────────────

  function readPatientFromDOM() {
    const lastName  = document.getElementById('BA01_LastName')?.textContent?.trim() || '';
    // BA01_FirstName contains ", Josianne" (leading comma from Priorx) — strip it
    const firstName = (document.getElementById('BA01_FirstName')?.textContent?.trim() || '').replace(/^,\s*/, '');
    const info2     = document.getElementById('BA01_Info2')?.textContent?.trim() || '';
    const user      = document.getElementById('LoginName1')?.textContent?.trim() || '';

    // BA01_Info2 format confirmed: "438.524.6123 - 168 rue Louise-Bernard, Beloeil"
    // Split on " - " first to isolate phone from address, then strip non-digits.
    const phonePart = info2.split(' - ')[0].trim();
    const phoneRaw  = phonePart.replace(/\D/g, '');

    return { lastName, firstName, phoneRaw, user };
  }

  function onPatientChanged() {
    const patient = readPatientFromDOM();

    // Ignore blank / cleared patient
    if (!patient.lastName && !patient.firstName) {
      currentPatient = null;
      chrome.runtime.sendMessage({ type: 'PATIENT_CLEARED' });
      return;
    }

    // Ignore if same patient as before
    if (
      currentPatient &&
      currentPatient.lastName  === patient.lastName &&
      currentPatient.firstName === patient.firstName
    ) return;

    currentPatient = patient;
    chrome.runtime.sendMessage({ type: 'PATIENT_CHANGED', data: patient });
  }

  // Watch for patient name changes in the sidebar card
  const nameTarget = document.getElementById('BA01_LastName');
  if (nameTarget) {
    const observer = new MutationObserver(onPatientChanged);
    observer.observe(nameTarget, { childList: true, subtree: true, characterData: true });
  }

  // Also watch BA01_Info2 in case phone loads after name
  const info2Target = document.getElementById('BA01_Info2');
  if (info2Target) {
    const observer2 = new MutationObserver(() => {
      if (currentPatient) onPatientChanged();
    });
    observer2.observe(info2Target, { childList: true, subtree: true, characterData: true });
  }

  // ── Prescription validation detection ─────────────────────────────────────
  //
  // Priorx uses ASP.NET WebForms. Validation goes through __doPostBack or AJAX.
  // We intercept XHR to detect when a validation succeeds.
  //
  // TODO: at the pharmacy, open DevTools → Network, perform a validation,
  // and note the request URL + a unique key in the response JSON.
  // Then update VALIDATION_URL_PATTERN and VALIDATION_SUCCESS_KEY below.

  const VALIDATION_URL_PATTERN = /index\.aspx/i;  // matches all Priorx calls for now
  const VALIDATION_SUCCESS_KEY = '__VALIDATION_SUCCESS__';  // TODO: replace with real key

  const OriginalXHR = window.XMLHttpRequest;
  function InterceptedXHR() {
    const xhr = new OriginalXHR();
    let requestUrl = '';

    const origOpen = xhr.open.bind(xhr);
    xhr.open = function (method, url, ...rest) {
      requestUrl = url;
      return origOpen(method, url, ...rest);
    };

    xhr.addEventListener('load', function () {
      if (!VALIDATION_URL_PATTERN.test(requestUrl)) return;
      try {
        const text = xhr.responseText || '';
        // TODO: replace VALIDATION_SUCCESS_KEY with the actual field/value
        // that appears in the response only after a successful validation.
        if (text.includes(VALIDATION_SUCCESS_KEY)) {
          chrome.runtime.sendMessage({ type: 'PRESCRIPTION_VALIDATED' });
        }
      } catch (_) {}
    });

    return xhr;
  }
  InterceptedXHR.prototype = OriginalXHR.prototype;
  window.XMLHttpRequest = InterceptedXHR;

  // Also intercept __doPostBack to watch for validation targets
  // TODO: replace 'VALIDATE_TARGET' with the real eventTarget string
  const origDoPostBack = window.__doPostBack;
  if (typeof origDoPostBack === 'function') {
    window.__doPostBack = function (eventTarget, eventArgument) {
      // TODO: inspect eventTarget values during validation at the pharmacy
      // e.g. if (eventTarget.includes('Validate') || eventTarget.includes('Confirm'))
      if (eventTarget && eventTarget.includes('TODO_VALIDATION_TARGET')) {
        chrome.runtime.sendMessage({ type: 'PRESCRIPTION_VALIDATED' });
      }
      return origDoPostBack.call(this, eventTarget, eventArgument);
    };
  }

})();
