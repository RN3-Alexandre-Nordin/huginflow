# Configuracao inicial do tunel nomeado Cloudflare (uma vez).
# Uso: npm run tunnel:setup

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$configExample = Join-Path $root "cloudflared\config.example.yml"
$configReal = Join-Path $root "cloudflared\config.yml"
$hostname = "ragnar-local.rn3.tec.br"
$tunnelName = "ragnar-dev-local"

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
  Write-Host "Instale cloudflared: winget install Cloudflare.cloudflared" -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Setup tunel fixo: $hostname" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path $configReal)) {
  Copy-Item $configExample $configReal
  Write-Host "Criado: cloudflared\config.yml (a partir do example)" -ForegroundColor Green
} else {
  Write-Host "Ja existe: cloudflared\config.yml" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Execute estes comandos NA ORDEM (copie um por vez):" -ForegroundColor Yellow
Write-Host ""
Write-Host "1) Login na Cloudflare (abre o navegador):" -ForegroundColor White
Write-Host "   & `"$cloudflared`" tunnel login" -ForegroundColor Gray
Write-Host ""
Write-Host "2) Criar o tunel (anote o UUID do arquivo .json criado):" -ForegroundColor White
Write-Host "   & `"$cloudflared`" tunnel create $tunnelName" -ForegroundColor Gray
Write-Host ""
Write-Host "3) Edite cloudflared\config.yml:" -ForegroundColor White
Write-Host "   - credentials-file = caminho do .json em %USERPROFILE%\.cloudflared\" -ForegroundColor Gray
Write-Host "   - confirme hostname: $hostname" -ForegroundColor Gray
Write-Host ""
Write-Host "4) Criar DNS no dominio rn3.tec.br (CNAME automatico):" -ForegroundColor White
Write-Host "   & `"$cloudflared`" tunnel route dns $tunnelName $hostname" -ForegroundColor Gray
Write-Host ""
Write-Host "5) No .env.local:" -ForegroundColor White
Write-Host "   RAGNAR_WEBHOOK_URL_DEV=https://$hostname/api/webhooks/evolution" -ForegroundColor Gray
Write-Host ""
Write-Host "6) Subir o tunel fixo (deixe aberto ao desenvolver):" -ForegroundColor White
Write-Host "   npm run tunnel:fixed" -ForegroundColor Gray
Write-Host ""
Write-Host "URL fixa - nao muda ao reiniciar (diferente do npm run tunnel rapido)." -ForegroundColor Green
Write-Host ""
