#!/bin/sh
# Build the zip to upload to the Chrome Web Store or Edge Add-ons.
# Does not publish anything. Refuses to pack unless both match patterns are this store only.
set -eu
cd "$(dirname "$0")/.."

python3 - <<'PY'
import json, sys
manifest = json.load(open("manifest.json"))
expected = "https://4502812786.priorx.ca/*"
hosts = manifest.get("host_permissions")
matches = manifest.get("content_scripts", [{}])[0].get("matches")
if hosts != [expected] or matches != [expected]:
    sys.exit("manifest.json must match only https://4502812786.priorx.ca/* (no *.priorx.ca).")
if "*.priorx.ca" in json.dumps(manifest):
    sys.exit("Refusing a wildcard across priorx.ca.")
PY

version=$(python3 -c 'import json; print(json.load(open("manifest.json"))["version"])')
mkdir -p dist
out="dist/notirx-${version}.zip"
rm -f "$out"

# Paths must sit at the root of the zip. manifest.json cannot be inside an extra folder.
zip -r "$out" \
  manifest.json \
  background.js \
  priorx-search.js \
  priorx-lock.js \
  priorx-language.js \
  content.js \
  api-contract.mjs \
  runtime-config.mjs \
  options.html \
  options.js \
  managed_schema.json \
  icons

echo "Wrote $out"
echo "Upload this file yourself from the store dashboard. This script does not publish it."
