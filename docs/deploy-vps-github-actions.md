# Deploy automático na VPS (GitHub Actions)

O workflow `docker-publish.yml` publica a imagem no GHCR e, na branch `main`, tenta deploy SSH na VPS.

## Secrets obrigatórios

Em **GitHub → Settings → Secrets and variables → Actions**:

| Secret | Exemplo |
|--------|---------|
| `VPS_HOST` | `123.45.67.89` ou `vps.rn3.tec.br` |
| `VPS_USER` | `root` |
| `VPS_SSH_KEY` | Conteúdo **inteiro** do arquivo de chave **privada** |

## Criar chave para o GitHub Actions (Windows)

```powershell
ssh-keygen -t ed25519 -C "github-actions-ragnar" -f $env:USERPROFILE\.ssh\ragnar_deploy -N '""'
```

1. Copie a **privada** para o secret `VPS_SSH_KEY`:
   ```powershell
   Get-Content $env:USERPROFILE\.ssh\ragnar_deploy | clip
   ```
   Cole no GitHub (inclui `-----BEGIN OPENSSH PRIVATE KEY-----`).

2. Na VPS, adicione a **pública** ao `authorized_keys`:
   ```powershell
   type $env:USERPROFILE\.ssh\ragnar_deploy.pub
   ```
   ```bash
   # na VPS, como VPS_USER:
   mkdir -p ~/.ssh && chmod 700 ~/.ssh
   echo "conteúdo-do-.pub" >> ~/.ssh/authorized_keys
   chmod 600 ~/.ssh/authorized_keys
   ```

3. Teste localmente:
   ```powershell
   ssh -i $env:USERPROFILE\.ssh\ragnar_deploy VPS_USER@VPS_HOST "echo ok"
   ```

## Deploy manual (enquanto secrets não estão prontos)

```bash
cd /opt/ragnar
docker pull ghcr.io/RN3-Alexandre-Nordin/ragnar:latest
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --no-deps app
```

## Erros comuns

- **Colar chave pública** em `VPS_SSH_KEY` → use a **privada**.
- **Quebra de linha faltando** no final do secret → cole o arquivo completo.
- **Usuário errado** em `VPS_USER` → deve ser quem tem a chave no `authorized_keys`.
