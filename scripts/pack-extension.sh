#!/bin/sh
# Build the zip to upload to the Chrome Web Store or Edge Add-ons.
# Does not publish anything. Refuses to pack while the Priorx host is still the placeholder.
set -eu
cd "$(dirname "$0")/.."

if grep -q 'FILL-IN-PRIORX-HOST.example' manifest.json; then
  echo "Replace FILL-IN-PRIORX-HOST.example in both manifest.json lines before packing a store zip." >&2
  exit 1
fi

version=$(python3 -c 'import json; print(json.load(open("manifest.json"))["version"])')
mkdir -p dist
out="dist/notirx-${version}.zip"
rm -f "$out"

# Paths must sit at the root of the zip. manifest.json cannot be inside an extra folder.
zip -r "$out" \
  manifest.json \
  background.js \
  content.js \
  api-contract.mjs \
  runtime-config.mjs \
  options.html \
  options.js \
  managed_schema.json \
  icons

echo "Wrote $out"
echo "Upload this file yourself from the store dashboard. This script does not publish it."
