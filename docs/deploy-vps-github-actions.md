# Deploy automático na VPS (GitHub Actions)

Fluxo em **`.github/workflows/docker-publish.yml`**:

1. **build-and-push** — build da imagem e push no GHCR (`ghcr.io/rn3-alexandre-nordin/ragnar:latest`)
2. **deploy-prod** (só `main`) — SSH na VPS, `docker pull` e rolling update do service Swarm `ragnar-app_app`

## Arquitetura

| Item | Onde fica |
|------|-----------|
| Chave SSH do CI | GitHub Secret `VPS_SSH_KEY` (privada **sem passphrase**) |
| Orquestração | Docker Swarm stack **ragnar-app** (Portainer) |
| Service | `ragnar-app_app` |
| Variáveis do app | Definidas no stack Portainer; URLs Evolution/webhook atualizadas pelo CI |
| Imagem | `ghcr.io/rn3-alexandre-nordin/ragnar:latest` (sempre minúsculas) |

Produção **não** usa `docker compose` em `/opt/ragnar`. O diretório `/opt/ragnar` é opcional (backup de `.env`).

## Dev vs prod — a chave SSH mistura ambientes?

**Não.** A chave em `VPS_SSH_KEY` só autentica o GitHub na máquina de `VPS_HOST` (produção). O que separa dev e prod:

| | Desenvolvimento | Produção |
|--|-----------------|----------|
| Código / deploy | `npm run dev` local ou imagem `:dev` no GHCR | Push em `main` → imagem `:latest` + SSH na VPS |
| Job SSH no CI | **Não existe** (`develop` só faz build) | `deploy-prod` |
| Credenciais | `.env.local` + Supabase dev | Stack Portainer + Supabase prod |
| Chave SSH sua (PC) | Continua no seu PC para acesso manual | Opcional para você; **não** vai no GitHub |

Use **`ragnar_deploy`** só no GitHub + `authorized_keys` da VPS prod. Sua chave de dev **permanece no PC** — não precisa remover nem alterar.

## Setup único (fazer uma vez)

### 1. Chave SSH dedicada para o CI (`ragnar_deploy`)

No **Windows** (PowerShell):

```powershell
ssh-keygen -t ed25519 -C "github-actions-ragnar" -f $env:USERPROFILE\.ssh\ragnar_deploy -N '""'
Get-Content $env:USERPROFILE\.ssh\ragnar_deploy | clip
```

**O que colar onde** (não inverta):

| Origem (PowerShell) | Destino |
|---------------------|---------|
| `Get-Content ...\ragnar_deploy \| clip` | GitHub → **Secrets → `VPS_SSH_KEY`** (arquivo **sem** `.pub`, chave **privada**) |
| `Get-Content ...\ragnar_deploy.pub` | VPS → `~/.ssh/authorized_keys` (chave **pública**) |

No GitHub: **Settings → Secrets and variables → Actions → `VPS_SSH_KEY` → Update** e cole tudo, incluindo:

```
-----BEGIN OPENSSH PRIVATE KEY-----
...
-----END OPENSSH PRIVATE KEY-----
```

- **Substitua** o valor antigo (chave de dev com passphrase) pelo conteúdo de `ragnar_deploy`
- **Não** configure `VPS_SSH_PASSPHRASE` com a solução `ragnar_deploy`
- **Não** cole o `.pub` no GitHub

Chave pública para a VPS:

```powershell
Get-Content $env:USERPROFILE\.ssh\ragnar_deploy.pub
```

### 2. Secrets no GitHub

| Secret | Valor |
|--------|--------|
| `VPS_HOST` | IP ou hostname da VPS prod |
| `VPS_USER` | Usuário SSH (ex.: `root`) |
| `VPS_SSH_KEY` | Conteúdo de `ragnar_deploy` (privada) |

Secrets de **build** (já existentes): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, etc.

### 3. VPS — authorized_keys

Na VPS, como `VPS_USER`:

```bash
mkdir -p ~/.ssh && chmod 700 ~/.ssh
echo "ssh-ed25519 AAAA... github-actions-ragnar" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

### 4. Validar antes do CI

No Windows:

```powershell
ssh -i $env:USERPROFILE\.ssh\ragnar_deploy root@SEU_HOST "echo ok"
```

Deve retornar `ok` **sem pedir senha**.

## Deploy automático

- **Push em `main`** ou **Actions → Docker Image CI/CD → Run workflow**
- O job `deploy-prod` faz pull da imagem e `docker service update` no service `ragnar-app_app`
- URLs `WHATSAPP_API_URL` e `RAGNAR_WEBHOOK_URL` são atualizadas para `evo.rn3.tec.br` e `app.ragnar.ia.br`

## Deploy manual (emergência)

```bash
docker pull ghcr.io/rn3-alexandre-nordin/ragnar:latest
docker service update \
  --image ghcr.io/rn3-alexandre-nordin/ragnar:latest \
  --env-add RAGNAR_ENV=production \
  --env-add WHATSAPP_API_URL=https://evo.rn3.tec.br \
  --env-add WHATSAPP_API_URL_PROD=https://evo.rn3.tec.br \
  --env-add RAGNAR_WEBHOOK_URL=https://app.ragnar.ia.br/api/webhooks/evolution \
  --env-add RAGNAR_WEBHOOK_URL_PROD=https://app.ragnar.ia.br/api/webhooks/evolution \
  ragnar-app_app
docker service ps ragnar-app_app
```

## Erros comuns

| Erro | Causa | Solução |
|------|--------|---------|
| `VPS_SSH_KEY está protegida por passphrase` | Chave pessoal com senha no secret | Use `ragnar_deploy` sem passphrase |
| `must be lowercase` no docker pull | URL com maiúsculas | Use `ghcr.io/rn3-alexandre-nordin/ragnar:latest` |
| `service ragnar-app_app not found` | Stack não existe ou nome mudou | `docker service ls \| grep ragnar` |
| `open /opt/ragnar/.env` | Workflow antigo (compose) | Atualize para versão com Swarm deploy |
