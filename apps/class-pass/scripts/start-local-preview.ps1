param([int]$Port = 3002)
$ErrorActionPreference = 'Stop'
$previewRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $previewRoot

# Never read production .env.local credentials into a local preview process.
$localConfigPath = Join-Path $previewRoot '.env.development.local'
if (-not (Test-Path -LiteralPath $localConfigPath)) {
  throw 'Missing .env.development.local. Configure local Supabase credentials first.'
}
Get-Content -LiteralPath $localConfigPath | ForEach-Object {
  if ($_ -match '^([^#=]+)=(.*)$') {
    [Environment]::SetEnvironmentVariable($Matches[1].Trim(), $Matches[2].Trim().Trim('"'), 'Process')
  }
}
$env:NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321'
if (-not $env:SUPABASE_SERVICE_ROLE_KEY -or -not $env:NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  throw 'Local Supabase keys are missing.'
}
$env:CLASS_PASS_LOCAL_PREVIEW = '1'
$env:JWT_SECRET = 'class-pass-local-preview-only-20260905-secret'
$env:QR_HMAC_SECRET = 'class-pass-local-preview-only-qr-20260905'
$env:COOKIE_DOMAIN = ''
Write-Host "Local preview: http://localhost:$Port/police/admin/login (local Supabase only)"
node node_modules/next/dist/bin/next dev --hostname localhost --port $Port
