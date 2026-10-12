// Build dist/notirx-<version>.zip for the Chrome Web Store or Edge Add-ons.
// Does not publish anything. The manifest sits at the root of the zip.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deflateRawSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export const RUNTIME_FILES = [
  'manifest.json',
  'background.js',
  'priorx-search.js',
  'priorx-lock.js',
  'priorx-language.js',
  'poll-schedule.js',
  'confirmation-list.js',
  'patient-watch.js',
  'content.js',
  'consent-opt-out.mjs',
  'notify-errors.mjs',
  'api-contract.mjs',
  'runtime-config.mjs',
  'options.html',
  'options.js',
  'managed_schema.json',
  'icons/icon16.png',
  'icons/icon32.png',
  'icons/icon48.png',
  'icons/icon128.png',
];

const PRIORX = 'https://4502812786.priorx.ca/*';
const API = 'https://*.execute-api.ca-central-1.amazonaws.com/*';

export function assertStoreManifest(manifest) {
  const matches = manifest.content_scripts?.[0]?.matches;
  const hosts = manifest.host_permissions;
  if (matches?.length !== 1 || matches[0] !== PRIORX) {
    throw new Error('content_scripts.matches must be only https://4502812786.priorx.ca/* (no *.priorx.ca).');
  }
  if (hosts?.length !== 2 || hosts[0] !== PRIORX || hosts[1] !== API) {
    throw new Error('host_permissions must be this Priorx host plus https://*.execute-api.ca-central-1.amazonaws.com/*.');
  }
  if (JSON.stringify(manifest).includes('*.priorx.ca')) {
    throw new Error('Refusing a wildcard across priorx.ca.');
  }
  if (manifest.key != null) {
    throw new Error('Remove the key field. The store assigns the extension id.');
  }
  if (manifest.manifest_version !== 3) {
    throw new Error('manifest_version must be 3.');
  }
  const description = String(manifest.description ?? '');
  if (description.length === 0 || description.length > 132) {
    throw new Error(`description must be 1 to 132 characters (got ${description.length}).`);
  }
  for (const size of ['16', '32', '48', '128']) {
    const expected = `icons/icon${size}.png`;
    if (manifest.icons?.[size] !== expected) {
      throw new Error(`icons.${size} must be ${expected}.`);
    }
  }
  const referenced = new Set(['manifest.json']);
  if (manifest.background?.service_worker) referenced.add(manifest.background.service_worker);
  if (manifest.options_ui?.page) referenced.add(manifest.options_ui.page);
  if (manifest.storage?.managed_schema) referenced.add(manifest.storage.managed_schema);
  for (const script of manifest.content_scripts?.[0]?.js ?? []) referenced.add(script);
  for (const icon of Object.values(manifest.icons ?? {})) referenced.add(icon);
  for (const icon of Object.values(manifest.action?.default_icon ?? {})) referenced.add(icon);
  const packed = new Set(RUNTIME_FILES);
  for (const file of referenced) {
    if (!packed.has(file)) throw new Error(`Manifest references ${file}, which is not in the store zip.`);
  }
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (~crc) >>> 0;
}

function dosDateTime(date) {
  const year = Math.max(date.getFullYear(), 1980);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  return { dosDate, dosTime };
}

function u16(n) {
  const buf = Buffer.alloc(2);
  buf.writeUInt16LE(n);
  return buf;
}

function u32(n) {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(n >>> 0);
  return buf;
}

export function zipStoreFiles(files, { date = new Date() } = {}) {
  const { dosDate, dosTime } = dosDateTime(date);
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name.replaceAll('\\', '/'), 'utf8');
    const data = file.data;
    const compressed = deflateRawSync(data);
    const crc = crc32(data);
    const local = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(8),
      u16(dosTime),
      u16(dosDate),
      u32(crc),
      u32(compressed.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      name,
      compressed,
    ]);
    const central = Buffer.concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(8),
      u16(dosTime),
      u16(dosDate),
      u32(crc),
      u32(compressed.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      name,
    ]);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const centralDir = Buffer.concat(centrals);
  const end = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(centralDir.length),
    u32(offset),
    u16(0),
  ]);
  return Buffer.concat([...locals, centralDir, end]);
}

export function collectRuntimeFiles(dir = root) {
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
  assertStoreManifest(manifest);
  return {
    version: manifest.version,
    files: RUNTIME_FILES.map((name) => ({
      name,
      data: readFileSync(join(dir, name)),
    })),
  };
}

export function writeStoreZip(dir = root, distDir = process.env.NOTIRX_DIST || join(dir, 'dist')) {
  const { version, files } = collectRuntimeFiles(dir);
  const zip = zipStoreFiles(files);
  mkdirSync(distDir, { recursive: true });
  const out = join(distDir, `notirx-${version}.zip`);
  writeFileSync(out, zip);
  return out;
}

function invokedDirectly() {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(entry).href;
}

if (invokedDirectly()) {
  const out = writeStoreZip();
  const hash = createHash('sha256').update(readFileSync(out)).digest('hex').slice(0, 12);
  console.log(`Wrote ${out}`);
  console.log(`sha256 ${hash}… (first 12 hex digits)`);
  console.log('Upload this file yourself from the store dashboard. This script does not publish it.');
}
