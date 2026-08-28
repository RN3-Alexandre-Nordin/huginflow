# Guia interativo — secrets GitHub Actions para deploy prod (huginflow)
# Uso: powershell -ExecutionPolicy Bypass -File scripts/deploy/github-secrets-setup.ps1

$KeyPrivate = "$env:USERPROFILE\.ssh\huginflow_deploy"
$KeyPublic  = "$env:USERPROFILE\.ssh\huginflow_deploy.pub"
$Repo       = "RN3-Alexandre-Nordin/huginflow"
$SecretsUrl = "https://github.com/$Repo/settings/secrets/actions"

Write-Host ""
Write-Host "=== Deploy automatico HuginFlow -> GitHub Secrets ===" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path $KeyPrivate)) {
  Write-Host "Chave huginflow_deploy nao encontrada. Gerando..." -ForegroundColor Yellow
  ssh-keygen -t ed25519 -C "github-actions-huginflow" -f $KeyPrivate -N '""'
}

Write-Host "1) Abra no navegador:" -ForegroundColor Green
Write-Host "   $SecretsUrl"
Write-Host ""
Write-Host "2) Crie ou atualize estes Repository secrets:" -ForegroundColor Green
Write-Host ""
Write-Host "   VPS_HOST" -ForegroundColor White
Write-Host "   Valor sugerido: 37.27.15.135  (IP da VPS prod — confirme no Portainer/DNS)"
Write-Host ""
Write-Host "   VPS_USER" -ForegroundColor White
Write-Host "   Valor sugerido: root"
Write-Host ""
Write-Host "   VPS_SSH_KEY" -ForegroundColor White
Write-Host "   Cole o conteudo INTEIRO do arquivo (chave PRIVADA, sem .pub):"
Write-Host "   $KeyPrivate"
Write-Host ""

$copy = Read-Host "Copiar VPS_SSH_KEY para a area de transferencia agora? (s/N)"
if ($copy -eq 's' -or $copy -eq 'S') {
  Get-Content $KeyPrivate | Set-Clipboard
  Write-Host "Chave privada copiada. Cole em GitHub -> VPS_SSH_KEY -> Update" -ForegroundColor Green
}

Write-Host ""
Write-Host "3) Na VPS, adicione a chave PUBLICA em authorized_keys (se ainda nao estiver):" -ForegroundColor Green
Write-Host ""
Get-Content $KeyPublic
Write-Host ""
Write-Host "   Na VPS (como root):"
Write-Host "   mkdir -p ~/.ssh && chmod 700 ~/.ssh"
Write-Host "   echo 'COLE_A_LINHA_ACIMA' >> ~/.ssh/authorized_keys"
Write-Host "   chmod 600 ~/.ssh/authorized_keys"
Write-Host ""
Write-Host "4) Teste local (deve retornar 'ok' sem pedir senha):" -ForegroundColor Green
Write-Host "   ssh -i `"$KeyPrivate`" root@SEU_VPS_HOST `"echo ok`""
Write-Host ""
Write-Host "5) Re-dispare o deploy:" -ForegroundColor Green
Write-Host "   GitHub -> Actions -> Docker Image CI/CD (GHCR) -> Run workflow -> branch main"
Write-Host "   Ou: git commit --allow-empty -m 'ci: redeploy prod' && git push huginflow main"
Write-Host ""
Write-Host "6) Confirme no run: job deploy-prod deve executar 'Deploy Swarm na VPS' (~30s+),"
Write-Host "   SEM aviso 'Deploy SSH ignorado'." -ForegroundColor Yellow
Write-Host ""
