# Build dist/notirx-<version>.zip on Windows. Does not publish anything.
# Node.js 18 or newer is required (the same runtime as the tests).
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw 'Node.js 18 or newer is required to build the store zip.'
}
& node (Join-Path $PSScriptRoot 'package.mjs')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
