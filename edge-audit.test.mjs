import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('./', import.meta.url);

function sourceFiles() {
  return readdirSync(root)
    .filter((name) => /\.(js|mjs|html|json|md)$/.test(name) && !name.endsWith('.test.mjs'))
    .map((name) => ({
      name,
      text: readFileSync(new URL(name, root), 'utf8'),
    }));
}

test('manifest stays on Manifest V3 APIs that Chromium Edge implements', () => {
  const manifest = JSON.parse(readFileSync(new URL('./manifest.json', root), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.minimum_chrome_version, '109');
  assert.equal(manifest.browser_action, undefined);
  assert.equal(manifest.minimum_edge_version, undefined);
  assert.equal(manifest.browser_specific_settings, undefined);
  assert.equal(manifest.update_url, undefined);
  assert.equal(manifest.key, undefined);
  assert.equal(manifest.background.service_worker, 'background.js');
  assert.equal(manifest.background.type, 'module');
  assert.equal(manifest.storage.managed_schema, 'managed_schema.json');
  assert.equal(manifest.incognito, 'not_allowed');
  assert.deepEqual(manifest.permissions, ['storage']);
  assert.equal(manifest.action.default_title, 'NotiRx');
  const readme = readFileSync(new URL('./README.md', root), 'utf8');
  assert.equal(readme.includes('edge://extensions'), true);
  assert.equal(readme.includes('ExtensionInstallForcelist'), true);
  assert.equal(readme.includes('edge.microsoft.com/extensionwebstorebase/v1/crx'), true);
  assert.equal(readme.includes('clients2.google.com/service/update2/crx'), true);
});

test('extension scripts use only chrome APIs that Edge shares', () => {
  const allowed = new Set(['runtime', 'storage', 'tabs', 'action']);
  const banned = [
    'tabGroups',
    'sidePanel',
    'offscreen',
    'userScripts',
    'declarativeNetRequest',
    'fontSettings',
    'downloads',
    'devtools',
    'identity',
    'gcm',
    'debugger',
    'browsingData',
    'scripting',
  ];
  const used = new Set();
  for (const file of sourceFiles()) {
    if (!/\.(js|mjs|html)$/.test(file.name)) continue;
    for (const match of file.text.matchAll(/\bchrome\.([A-Za-z0-9_]+)/g)) {
      used.add(match[1]);
    }
    for (const name of banned) {
      assert.equal(file.text.includes(`chrome.${name}`), false, `${file.name} chrome.${name}`);
    }
    assert.equal(file.text.includes('browser.runtime'), false, file.name);
  }
  for (const name of used) {
    assert.equal(allowed.has(name), true, `chrome.${name}`);
  }
  assert.deepEqual([...used].sort(), ['action', 'runtime', 'storage', 'tabs']);
});
