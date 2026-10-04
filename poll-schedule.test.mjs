import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const poll = require('./poll-schedule.js');

test('a healthy poll waits 20 seconds plus or minus 5 seconds', () => {
  assert.equal(poll.pollDelayMs(0, () => 0), 15000);
  assert.equal(poll.pollDelayMs(0, () => 0.5), 20000);
  assert.equal(poll.pollDelayMs(0, () => 1), 25000);
  assert.equal(poll.pollDelayMs(0, () => -4), 15000);
  assert.equal(poll.pollDelayMs(0, () => 8), 25000);
});

test('5xx and 429 back off exponentially and cap around 2 minutes', () => {
  assert.equal(poll.nextFailureStreak(0, 503), 1);
  assert.equal(poll.nextFailureStreak(1, 500), 2);
  assert.equal(poll.nextFailureStreak(2, 429), 3);
  assert.equal(poll.nextFailureStreak(3, 599), 4);

  assert.equal(poll.pollDelayMs(1, () => 0), 40000);
  assert.equal(poll.pollDelayMs(2, () => 0), 80000);
  assert.equal(poll.pollDelayMs(3, () => 0), 120000);
  assert.equal(poll.pollDelayMs(8, () => 1), 120000);

  assert.equal(poll.nextFailureStreak(4, 200), 0);
  assert.equal(poll.nextFailureStreak(2, 204), 0);
  assert.equal(poll.pollDelayMs(poll.nextFailureStreak(4, 200), () => 0.5), 20000);
});

test('other status codes do not change the backoff streak', () => {
  assert.equal(poll.nextFailureStreak(2, 404), 2);
  assert.equal(poll.nextFailureStreak(2, 400), 2);
  assert.equal(poll.nextFailureStreak(2, 403), 2);
  assert.equal(poll.nextFailureStreak(2, 0), 2);
  assert.equal(poll.nextFailureStreak(2, undefined), 2);
});

test('the three unlock calls are staggered by a few hundred milliseconds', () => {
  const offsets = poll.staggerOffsets(3);
  assert.deepEqual(offsets, [0, 400, 800]);
  assert.equal(new Set(offsets).size, offsets.length);
  assert.ok(offsets[1] - offsets[0] >= 300);
  assert.ok(offsets[2] - offsets[1] >= 300);
  assert.deepEqual(poll.staggerOffsets(0), []);
});

test('hidden tabs wait a short random delay before polling again', () => {
  assert.equal(poll.resumeDelayMs(() => 0), 250);
  assert.equal(poll.resumeDelayMs(() => 1), 750);
  assert.equal(poll.leadDelayMs(() => 0), 0);
  assert.equal(poll.leadDelayMs(() => 1), 400);
  assert.equal(poll.unlockLeadMs(() => 0), 0);
  assert.equal(poll.unlockLeadMs(() => 1), 1000);
  assert.equal(poll.shouldPollNow({ visible: true, locked: false, isLeader: true }), true);
  assert.equal(poll.shouldPollNow({ visible: false, locked: false, isLeader: true }), false);
  assert.equal(poll.shouldPollNow({ visible: true, locked: true, isLeader: true }), false);
  assert.equal(poll.shouldPollNow({ visible: true, locked: false, isLeader: false }), false);
});

test('one tab holds the poll lease and a hidden tab can give it up', () => {
  const now = 1_000_000;
  const first = poll.claimLeader(null, { id: 'tab-a', now, leaseMs: poll.LEASE_MS });
  assert.equal(first.won, true);
  assert.equal(poll.isLeaderRecord(first.record, { id: 'tab-a', now: now + 1000 }), true);

  const second = poll.claimLeader(first.record, { id: 'tab-b', now: now + 1000 });
  assert.equal(second.won, false);
  assert.equal(second.record.id, 'tab-a');

  const expired = poll.claimLeader(first.record, { id: 'tab-b', now: first.record.until + 1 });
  assert.equal(expired.won, true);
  assert.equal(expired.record.id, 'tab-b');

  assert.equal(poll.releaseLeader(first.record, 'tab-b'), first.record);
  assert.equal(poll.releaseLeader(first.record, 'tab-a'), null);
  assert.equal(poll.isLeaderRecord(first.record, { id: 'tab-a', now: first.record.until }), false);
});

test('a backoff keeps the lease until that wait is over', () => {
  assert.equal(poll.leaseMsForDelay(20000), 25000);
  assert.equal(poll.leaseMsForDelay(40000), 45000);
  assert.equal(poll.leaseMsForDelay(120000), 125000);
});
