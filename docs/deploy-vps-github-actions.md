# Deploy automático na VPS (GitHub Actions)

Fluxo em **`.github/workflows/docker-publish.yml`**:

1. **build-and-push** — build da imagem e push no GHCR (`ghcr.io/rn3-alexandre-nordin/ragnar:latest`)
2. **deploy-prod** (só `main`) — envia `docker-compose*.yml` para `/opt/ragnar`, `docker pull` e `compose up`

## Arquitetura

| Item | Onde fica |
|------|-----------|
| Chave SSH do CI | GitHub Secret `VPS_SSH_KEY` (privada **sem passphrase**) |
| Variáveis do app | `/opt/ragnar/.env` na VPS (nunca no GitHub) |
| Compose | Enviado pelo CI a cada deploy; `.env` permanece na VPS |
| Imagem | `ghcr.io/rn3-alexandre-nordin/ragnar:latest` (sempre minúsculas) |

## Setup único (fazer uma vez)

### 1. Chave SSH dedicada para o CI (`ragnar_deploy`)

No **Windows** (PowerShell):

```powershell
ssh-keygen -t ed25519 -C "github-actions-ragnar" -f $env:USERPROFILE\.ssh\ragnar_deploy -N '""'
Get-Content $env:USERPROFILE\.ssh\ragnar_deploy | clip
```

- Cole no GitHub → **Settings → Secrets → Actions → `VPS_SSH_KEY`** (chave **privada** completa)
- **Não** use chave com passphrase no CI — não configure `VPS_SSH_PASSPHRASE`

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

### 3. VPS — authorized_keys + bootstrap

Na VPS, como `VPS_USER`:

```bash
mkdir -p ~/.ssh && chmod 700 ~/.ssh
echo "ssh-ed25519 AAAA... github-actions-ragnar" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

Bootstrap de `/opt/ragnar` (rede `rn3net` + `.env`):

```bash
mkdir -p /opt/ragnar && cd /opt/ragnar
curl -fsSL -o vps-bootstrap.sh \
  https://raw.githubusercontent.com/RN3-Alexandre-Nordin/ragnar/main/scripts/deploy/vps-bootstrap.sh
curl -fsSL -o env.production.example \
  https://raw.githubusercontent.com/RN3-Alexandre-Nordin/ragnar/main/env.production.example
bash vps-bootstrap.sh
nano /opt/ragnar/.env
```

Ou copie `scripts/deploy/vps-bootstrap.sh` do repositório e execute localmente.

### 4. Validar antes do CI

No Windows:

```powershell
ssh -i $env:USERPROFILE\.ssh\ragnar_deploy root@SEU_HOST "echo ok"
```

Deve retornar `ok` **sem pedir senha**.

## Deploy automático

- **Push em `main`** ou **Actions → Docker Image CI/CD → Run workflow**
- O job `deploy-prod` copia os compose, faz pull e sobe o container `ragnar-app`

## Deploy manual (emergência)

```bash
cd /opt/ragnar
docker pull ghcr.io/rn3-alexandre-nordin/ragnar:latest
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --no-deps app
```

Requer `docker-compose.yml`, `docker-compose.prod.yml` e `.env` em `/opt/ragnar`.

## Erros comuns

| Erro | Causa | Solução |
|------|--------|---------|
| `VPS_SSH_KEY está protegida por passphrase` | Chave pessoal com senha no secret | Use `ragnar_deploy` sem passphrase |
| `must be lowercase` no docker pull | URL com maiúsculas | Use `ghcr.io/rn3-alexandre-nordin/ragnar:latest` |
| `docker-compose.yml: no such file` | Compose ausente na VPS | CI envia automaticamente após setup correto |
| `open /opt/ragnar/.env` | `.env` não criado | Rode bootstrap e preencha `.env` |
| `network rn3net not found` | Rede Traefik ausente | `docker network create rn3net` ou bootstrap |
