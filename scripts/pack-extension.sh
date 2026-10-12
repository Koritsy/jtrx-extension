#!/bin/sh
# Build dist/notirx-<version>.zip. Does not publish anything.
# Node.js 18 or newer is required (the same runtime as the tests).
set -eu
cd "$(dirname "$0")/.."
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 18 or newer is required to build the store zip." >&2
  exit 1
fi
exec node scripts/package.mjs
