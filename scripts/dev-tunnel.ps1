# Expoe o Next.js local (porta 3000) na internet via Cloudflare Quick Tunnel.
# Uso: npm run tunnel   (em um terminal SEPARADO de npm run dev)

$ErrorActionPreference = "Stop"

$cloudflaredCandidates = @(
  "$env:USERPROFILE\cloudflared\cloudflared.exe",
  "D:\cloudflare\cloudflared.exe",
  "cloudflared"
)

$cloudflared = $null
foreach ($candidate in $cloudflaredCandidates) {
  if ($candidate -eq "cloudflared") {
    $found = Get-Command cloudflared -ErrorAction SilentlyContinue
    if ($found) { $cloudflared = $found.Source; break }
  } elseif (Test-Path $candidate) {
    $cloudflared = $candidate
    break
  }
}

if (-not $cloudflared) {
  Write-Host "cloudflared nao encontrado. Instale: winget install Cloudflare.cloudflared" -ForegroundColor Red
  exit 1
}

$port = $env:HUGINFLOW_DEV_PORT
if (-not $port) { $port = "3000" }
$target = "http://localhost:$port"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Hugin Flow - Tunel de desenvolvimento" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Deixe npm run dev rodando em outro terminal." -ForegroundColor Yellow
Write-Host "2. Quando aparecer a URL https://....trycloudflare.com, copie-a." -ForegroundColor Yellow
Write-Host "3. No .env.local, defina:" -ForegroundColor Yellow
Write-Host '   HUGINFLOW_WEBHOOK_URL_DEV=https://SUA-URL/api/webhooks/evolution' -ForegroundColor White
Write-Host "4. Reinicie o npm run dev e crie/reconecte o canal WhatsApp." -ForegroundColor Yellow
Write-Host ""
Write-Host "Encerre com Ctrl+C quando terminar de testar." -ForegroundColor DarkGray
Write-Host ('Redirecionando: ' + $target) -ForegroundColor Green
Write-Host ""

& $cloudflared tunnel --url $target
