param(
  [ValidateSet('server', 'multi-room', '200')]
  [string]$Mode = 'multi-room',
  [ValidateRange(1024, 65535)]
  [int]$Port = 3011
)
$ErrorActionPreference = 'Stop'
$seatRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $seatRoot

# Load only the local configuration. Never edit .env files or read production keys.
$seatEnvFile = Join-Path $seatRoot '.env.development.local'
if (-not (Test-Path -LiteralPath $seatEnvFile)) { throw 'Missing .env.development.local' }
foreach ($seatLine in Get-Content -LiteralPath $seatEnvFile) {
  if ($seatLine -match '^([^#=]+)=(.*)$') {
    [Environment]::SetEnvironmentVariable($Matches[1].Trim(), $Matches[2].Trim().Trim('"'), 'Process')
  }
}
if (([uri]$env:NEXT_PUBLIC_SUPABASE_URL).Host -notin @('localhost', '127.0.0.1')) {
  throw 'Refusing non-local Supabase configuration'
}
if (-not $env:SUPABASE_SERVICE_ROLE_KEY -or -not $env:NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  throw 'Local Supabase keys are missing'
}

# Follow the running project's CLI port instead of a stale env-file port.
$seatConfig = Get-Content -LiteralPath (Join-Path $seatRoot 'supabase/config.toml') -Raw
$seatApiSection = [regex]::Match($seatConfig, '(?ms)^\[api\]\s*\r?\n(.*?)(?=^\[|\z)').Groups[1].Value
$seatApiPort = [regex]::Match($seatApiSection, '(?m)^port\s*=\s*(\d+)\s*$').Groups[1].Value
if (-not $seatApiPort) { throw 'Cannot resolve the local Supabase API port' }
$env:NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:$seatApiPort"
$env:BASE_URL = "http://127.0.0.1:$Port"
# These are intentionally public, local-only fixture secrets, shared by server and verifier.
$env:JWT_SECRET = 'designated-seat-local-review-only-20260906-secret'
$env:QR_HMAC_SECRET = 'designated-seat-local-review-only-20260906-qr-secret'
$env:DESIGNATED_SEAT_SECRET = 'designated-seat-local-review-only-20260906-seat-secret'
$env:COOKIE_DOMAIN = ''
$env:KEEP_TEST_DATA = '0'

if ($Mode -eq 'server') {
  # Separate .next-dev artifacts from the user's .next-local-preview server.
  $env:CLASS_PASS_LOCAL_PREVIEW = '0'
  node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port $Port
} elseif ($Mode -eq 'multi-room') {
  node scripts/verify-designated-seat-multi-room-local-workflow.js
} else {
  node scripts/verify-designated-seat-200-local-workflow.js
}
exit $LASTEXITCODE
