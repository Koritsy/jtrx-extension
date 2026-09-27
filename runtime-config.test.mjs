import assert from 'node:assert/strict';
import test from 'node:test';
import { pickRuntimeConfig } from './runtime-config.mjs';

const URL = 'https://xxxx.execute-api.ca-central-1.amazonaws.com/prod';
const KEY = 'test-key-demo';

test('local options are used when no administrator policy is set', () => {
  const picked = pickRuntimeConfig({}, { apiBaseUrl: `${URL}/`, apiKey: KEY });
  assert.deepEqual(picked, { ok: true, source: 'local', apiBaseUrl: URL, apiKey: KEY });
});

test('administrator policy wins over values saved on the Options page', () => {
  const picked = pickRuntimeConfig(
    { apiBaseUrl: URL, apiKey: 'policy-key' },
    { apiBaseUrl: URL, apiKey: 'local-key' },
  );
  assert.equal(picked.source, 'managed');
  assert.equal(picked.apiKey, 'policy-key');
});

test('a partial administrator policy is not replaced by the Options page', () => {
  const picked = pickRuntimeConfig(
    { apiBaseUrl: URL, apiKey: '' },
    { apiBaseUrl: URL, apiKey: KEY },
  );
  assert.deepEqual(picked, { ok: false, source: 'managed' });
});

test('http addresses and keys with spaces are rejected', () => {
  assert.equal(pickRuntimeConfig({}, { apiBaseUrl: 'http://example.com', apiKey: KEY }).ok, false);
  assert.equal(pickRuntimeConfig({}, { apiBaseUrl: URL, apiKey: 'has space' }).ok, false);
  assert.equal(
    pickRuntimeConfig({}, { apiBaseUrl: 'https://user:secret@example.com/prod', apiKey: KEY }).ok,
    false,
  );
});
