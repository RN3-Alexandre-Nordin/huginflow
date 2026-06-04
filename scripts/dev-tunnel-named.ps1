# Tunel Cloudflare NOMEADO (URL fixa: ragnar-local.rn3.tec.br).
# Requer setup: npm run tunnel:setup
# Uso: npm run tunnel:fixed

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$config = Join-Path $root "cloudflared\config.yml"

$cloudflared = $null
@(
  "D:\cloudflare\cloudflared.exe",
  "$env:USERPROFILE\cloudflared\cloudflared.exe",
  "cloudflared"
) | ForEach-Object {
  if ($_ -eq "cloudflared") {
    $cmd = Get-Command cloudflared -ErrorAction SilentlyContinue
    if ($cmd) { $cloudflared = $cmd.Source }
  } elseif (Test-Path $_) {
    $cloudflared = $_
  }
  if ($cloudflared) { return }
}

if (-not $cloudflared) {
  Write-Host "cloudflared nao encontrado." -ForegroundColor Red
  exit 1
}

if (-not (Test-Path $config)) {
  Write-Host "Falta cloudflared\config.yml - rode: npm run tunnel:setup" -ForegroundColor Red
  exit 1
}

if ((Get-Content $config -Raw) -match "COLE-O-UUID") {
  Write-Host "Edite cloudflared\config.yml com o credentials-file correto." -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "Tunel fixo -> http://localhost:3000" -ForegroundColor Green
Write-Host "URL publica: https://ragnar-local.rn3.tec.br" -ForegroundColor Green
Write-Host "Webhook: https://ragnar-local.rn3.tec.br/api/webhooks/evolution" -ForegroundColor Cyan
Write-Host "Ctrl+C para encerrar." -ForegroundColor DarkGray
Write-Host ""

& $cloudflared tunnel --config $config run
