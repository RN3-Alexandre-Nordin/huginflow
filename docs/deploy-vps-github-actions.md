# Deploy automático na VPS (GitHub Actions)

Fluxo em **`.github/workflows/docker-publish.yml`**:

1. **build-and-push** — build da imagem e push no GHCR (`ghcr.io/rn3-alexandre-nordin/huginflow:latest`)
2. **deploy-prod** (só `main`) — SSH na VPS, `docker pull` e rolling update do service Swarm `huginflow-app_app`

## Arquitetura

| Item | Onde fica |
|------|-----------|
| Chave SSH do CI | GitHub Secret `VPS_SSH_KEY` (privada **sem passphrase**) |
| Orquestração | Docker Swarm stack **huginflow-app** (Portainer) |
| Service | `huginflow-app_app` |
| Variáveis do app | Definidas no stack Portainer; URLs Evolution/webhook atualizadas pelo CI |
| Imagem | `ghcr.io/rn3-alexandre-nordin/huginflow:latest` (sempre minúsculas) |

Produção **não** usa `docker compose` em `/opt/huginflow`. O diretório `/opt/huginflow` é opcional (backup de `.env`).

## Dev vs prod — a chave SSH mistura ambientes?

**Não.** A chave em `VPS_SSH_KEY` só autentica o GitHub na máquina de `VPS_HOST` (produção). O que separa dev e prod:

| | Desenvolvimento | Produção |
|--|-----------------|----------|
| Código / deploy | `npm run dev` local ou imagem `:dev` no GHCR | Push em `main` → imagem `:latest` + SSH na VPS |
| Job SSH no CI | **Não existe** (`develop` só faz build) | `deploy-prod` |
| Credenciais | `.env.local` + Supabase dev | Stack Portainer + Supabase prod |
| Chave SSH sua (PC) | Continua no seu PC para acesso manual | Opcional para você; **não** vai no GitHub |

Use **`huginflow_deploy`** (ou `huginflow_deploy`) só no GitHub + `authorized_keys` da VPS prod. Sua chave de dev **permanece no PC** — não precisa remover nem alterar.

**Repo GitHub:** [`RN3-Alexandre-Nordin/huginflow`](https://github.com/RN3-Alexandre-Nordin/huginflow/settings/secrets/actions)

## Setup único (fazer uma vez)

### 1. Chave SSH dedicada para o CI (`huginflow_deploy`)

No **Windows** (PowerShell):

```powershell
ssh-keygen -t ed25519 -C "github-actions-huginflow" -f $env:USERPROFILE\.ssh\huginflow_deploy -N '""'
Get-Content $env:USERPROFILE\.ssh\huginflow_deploy | clip
```

**O que colar onde** (não inverta):

| Origem (PowerShell) | Destino |
|---------------------|---------|
| `Get-Content ...\huginflow_deploy \| clip` | GitHub → **Secrets → `VPS_SSH_KEY`** (arquivo **sem** `.pub`, chave **privada**) |
| `Get-Content ...\huginflow_deploy.pub` | VPS → `~/.ssh/authorized_keys` (chave **pública**) |

No GitHub: **Settings → Secrets and variables → Actions → `VPS_SSH_KEY` → Update** e cole tudo, incluindo:

```
-----BEGIN OPENSSH PRIVATE KEY-----
...
-----END OPENSSH PRIVATE KEY-----
```

- **Substitua** o valor antigo (chave de dev com passphrase) pelo conteúdo de `huginflow_deploy`
- **Não** configure `VPS_SSH_PASSPHRASE` com a solução `huginflow_deploy`
- **Não** cole o `.pub` no GitHub

Chave pública para a VPS:

```powershell
Get-Content $env:USERPROFILE\.ssh\huginflow_deploy.pub
```

### 2. Secrets no GitHub

| Secret | Valor |
|--------|--------|
| `VPS_HOST` | IP ou hostname da VPS prod |
| `VPS_USER` | Usuário SSH (ex.: `root`) |
| `VPS_SSH_KEY` | Conteúdo de `huginflow_deploy` (privada) |

Secrets de **build** (já existentes): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, etc.

### 3. VPS — authorized_keys

Na VPS, como `VPS_USER`:

```bash
mkdir -p ~/.ssh && chmod 700 ~/.ssh
echo "ssh-ed25519 AAAA... github-actions-huginflow" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

### 4. Validar antes do CI

No Windows:

```powershell
ssh -i $env:USERPROFILE\.ssh\huginflow_deploy root@SEU_HOST "echo ok"
```

Deve retornar `ok` **sem pedir senha**.

## Deploy automático

- **Push em `main`** ou **Actions → Docker Image CI/CD → Run workflow**
- O job `deploy-prod` faz pull da imagem e `docker service update` no service `huginflow-app_app`
- URLs `WHATSAPP_API_URL` e `HUGINFLOW_WEBHOOK_URL` são atualizadas para `evo.rn3.tec.br` e `app.huginflow.com`

## Deploy manual (emergência)

```bash
docker pull ghcr.io/rn3-alexandre-nordin/huginflow:latest
docker service update \
  --image ghcr.io/rn3-alexandre-nordin/huginflow:latest \
  --env-add HUGINFLOW_ENV=production \
  --env-add WHATSAPP_API_URL=https://evo.rn3.tec.br \
  --env-add WHATSAPP_API_URL_PROD=https://evo.rn3.tec.br \
  --env-add HUGINFLOW_WEBHOOK_URL=https://app.huginflow.com/api/webhooks/evolution \
  --env-add HUGINFLOW_WEBHOOK_URL_PROD=https://app.huginflow.com/api/webhooks/evolution \
  huginflow-app_app
docker service ps huginflow-app_app
```

## Erros comuns

| Erro | Causa | Solução |
|------|--------|---------|
| `VPS_SSH_KEY está protegida por passphrase` | Chave pessoal com senha no secret | Use `huginflow_deploy` sem passphrase |
| `must be lowercase` no docker pull | URL com maiúsculas | Use `ghcr.io/rn3-alexandre-nordin/huginflow:latest` |
| `service huginflow-app_app not found` | Stack não existe ou nome mudou | `docker service ls \| grep huginflow` |
| `open /opt/huginflow/.env` | Workflow antigo (compose) | Atualize para versão com Swarm deploy |
