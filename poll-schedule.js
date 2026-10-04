// Poll spacing for the Priorx widget.
//
// Each visible tab used to call the API on the same 20 second clock, and
// unlocking a tab fired consent lookup, message history, and confirmations
// together. The helpers here are pure so the delays can be tested without
// Chrome. content.js applies them.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module && module.exports) {
    module.exports = api;
  }
  root.NotiRxPoll = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const BASE_POLL_MS = 20000;
  const JITTER_MS = 5000;
  const BACKOFF_CAP_MS = 120000;
  const STAGGER_MS = 400;
  const LEAD_MAX_MS = 400;
  const UNLOCK_LEAD_MAX_MS = 1000;
  const RESUME_MIN_MS = 250;
  const RESUME_SPAN_MS = 500;
  const LEASE_MS = 25000;

  function unitRandom(random) {
    const roll = typeof random === 'function' ? random() : Math.random();
    const n = Number(roll);
    if (!Number.isFinite(n)) return 0;
    return Math.min(1, Math.max(0, n));
  }

  function pollDelayMs(failureStreak, random) {
    const streak = Math.max(0, failureStreak | 0);
    if (streak > 0) {
      const raw = BASE_POLL_MS * (2 ** streak);
      return Math.min(BACKOFF_CAP_MS, raw);
    }
    const offset = Math.round(unitRandom(random) * (JITTER_MS * 2)) - JITTER_MS;
    return BASE_POLL_MS + offset;
  }

  function nextFailureStreak(failureStreak, status) {
    const streak = Math.max(0, failureStreak | 0);
    const code = Number(status);
    if (!Number.isFinite(code) || code === 0) return streak;
    if (code === 429 || (code >= 500 && code <= 599)) return streak + 1;
    if (code >= 200 && code <= 299) return 0;
    return streak;
  }

  function staggerOffsets(count, stepMs) {
    const n = Math.max(0, count | 0);
    const step = stepMs == null ? STAGGER_MS : stepMs;
    const offsets = [];
    for (let i = 0; i < n; i += 1) offsets.push(i * step);
    return offsets;
  }

  function leadDelayMs(random) {
    return Math.round(unitRandom(random) * LEAD_MAX_MS);
  }

  function unlockLeadMs(random) {
    return Math.round(unitRandom(random) * UNLOCK_LEAD_MAX_MS);
  }

  function resumeDelayMs(random) {
    return RESUME_MIN_MS + Math.round(unitRandom(random) * RESUME_SPAN_MS);
  }

  function leaseMsForDelay(delayMs, leaseMs) {
    const lease = leaseMs == null ? LEASE_MS : leaseMs;
    const delay = Math.max(0, Number(delayMs) || 0);
    return Math.max(lease, delay + 5000);
  }

  function shouldPollNow({ visible, locked, isLeader }) {
    return visible === true && locked !== true && isLeader === true;
  }

  function claimLeader(current, options = {}) {
    const id = options.id;
    const now = Number(options.now);
    const leaseMs = options.leaseMs == null ? LEASE_MS : options.leaseMs;
    if (!id || !Number.isFinite(now)) return { won: false, record: current || null };
    const holder = current && typeof current.id === 'string' ? current.id : '';
    const until = Number(current && current.until);
    if (holder && holder !== id && Number.isFinite(until) && until > now) {
      return { won: false, record: { id: holder, until } };
    }
    return { won: true, record: { id, until: now + leaseMs } };
  }

  function releaseLeader(current, id) {
    if (!current || !id || current.id !== id) return current || null;
    return null;
  }

  function isLeaderRecord(current, options = {}) {
    const id = options.id;
    const now = Number(options.now);
    return Boolean(
      current &&
      id &&
      current.id === id &&
      Number.isFinite(now) &&
      Number(current.until) > now,
    );
  }

  return {
    BASE_POLL_MS,
    JITTER_MS,
    BACKOFF_CAP_MS,
    STAGGER_MS,
    LEAD_MAX_MS,
    UNLOCK_LEAD_MAX_MS,
    RESUME_MIN_MS,
    RESUME_SPAN_MS,
    LEASE_MS,
    pollDelayMs,
    nextFailureStreak,
    staggerOffsets,
    leadDelayMs,
    unlockLeadMs,
    resumeDelayMs,
    leaseMsForDelay,
    shouldPollNow,
    claimLeader,
    releaseLeader,
    isLeaderRecord,
  };
});
