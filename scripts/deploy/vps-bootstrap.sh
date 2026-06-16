#!/usr/bin/env bash
# Bootstrap único na VPS de produção (/opt/ragnar).
# Uso: bash vps-bootstrap.sh
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/ragnar}"

echo "==> Diretório de deploy: $DEPLOY_DIR"
mkdir -p "$DEPLOY_DIR"
cd "$DEPLOY_DIR"

if ! docker network inspect rn3net >/dev/null 2>&1; then
  echo "==> Criando rede Docker rn3net (Traefik)"
  docker network create rn3net
fi

if [[ ! -f .env ]]; then
  echo "==> Criando .env a partir do exemplo (preencha os segredos)"
  if [[ -f env.production.example ]]; then
    cp env.production.example .env
  else
    cat > .env <<'EOF'
NODE_ENV=production
RAGNAR_ENV=production
NEXT_PUBLIC_APP_URL=https://app.ragnar.ia.br
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
WHATSAPP_API_URL_PROD=https://evo.rn3.tec.br
WHATSAPP_API_TOKEN_PROD=
RAGNAR_WEBHOOK_URL_PROD=https://app.ragnar.ia.br/api/webhooks/evolution
GEMINI_API_KEY=
NEXT_PUBLIC_LANDING_PAGE_TOKEN=
EOF
  fi
  echo "    Edite: nano $DEPLOY_DIR/.env"
else
  echo "==> .env já existe — mantido"
fi

echo ""
echo "Próximos passos:"
echo "  1. Preencha $DEPLOY_DIR/.env com credenciais de PRODUÇÃO"
echo "  2. Adicione a chave pública ragnar_deploy.pub em ~/.ssh/authorized_keys"
echo "  3. Configure secrets VPS_HOST, VPS_USER, VPS_SSH_KEY no GitHub Actions"
echo "  4. Push em main ou Run workflow — o CI envia docker-compose e faz deploy"
