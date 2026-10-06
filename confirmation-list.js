// Réponses list helpers for the Fait button.
//
// The row is removed in the page before the dismiss POST returns. A poll that
// started earlier can still bring that row back, so the id stays suppressed
// for the rest of the page session: while the POST is in flight, after it
// fails, and after it succeeds. A failed POST is not shown again.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module && module.exports) {
    module.exports = api;
  }
  root.NotiRxConfirmations = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function confirmationKey(value) {
    if (value && typeof value === 'object') {
      return String(value.confirmation_id ?? '').trim();
    }
    return String(value ?? '').trim();
  }

  // Returns ok:false when the click should be ignored (empty id, or a second
  // click on an id already removed). The id is added before the POST is sent.
  function beginDismiss(suppressed, confirmationId) {
    const id = confirmationKey(confirmationId);
    if (!id) return { ok: false, reason: 'invalid' };
    if (!suppressed || typeof suppressed.has !== 'function' || typeof suppressed.add !== 'function') {
      return { ok: false, reason: 'invalid' };
    }
    if (suppressed.has(id)) return { ok: false, reason: 'duplicate' };
    suppressed.add(id);
    return { ok: true, id };
  }

  function visibleConfirmations(items, suppressed) {
    const list = Array.isArray(items) ? items : [];
    if (!suppressed || typeof suppressed.has !== 'function') return list.slice();
    return list.filter((item) => {
      const id = confirmationKey(item);
      return !id || !suppressed.has(id);
    });
  }

  return {
    confirmationKey,
    beginDismiss,
    visibleConfirmations,
  };
});
