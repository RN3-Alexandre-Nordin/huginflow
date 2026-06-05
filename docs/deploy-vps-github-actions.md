# Deploy automático na VPS (GitHub Actions)

O workflow `docker-publish.yml` publica a imagem no GHCR e, na branch `main`, tenta deploy SSH na VPS.

## Secrets obrigatórios

Em **GitHub → Settings → Secrets and variables → Actions**:

| Secret | Exemplo |
|--------|---------|
| `VPS_HOST` | `123.45.67.89` ou `vps.rn3.tec.br` |
| `VPS_USER` | `root` |
| `VPS_SSH_KEY` | Conteúdo **inteiro** do arquivo de chave **privada** |

## Criar chave nova (recomendado para CI)

Use um par **dedicado** só para GitHub Actions → VPS prod (não interfere na chave que você já usa no dia a dia).

```powershell
ssh-keygen -t ed25519 -C "github-actions-ragnar" -f $env:USERPROFILE\.ssh\ragnar_deploy -N '""'
```

## Reutilizar a chave que você já usa no dev

**Sim, pode.** Não precisa gerar outra no PC.

1. **VPS prod** — adicione a **mesma chave pública** que já funciona no dev em `~/.ssh/authorized_keys` do usuário de `VPS_USER` (se ainda não estiver lá).
2. **GitHub** — secret `VPS_SSH_KEY` = conteúdo da **mesma chave privada** que você usa no dev (arquivo local, ex. `id_ed25519` ou o path que já usa).

```powershell
# exemplo: copiar a privada que você já usa
Get-Content $env:USERPROFILE\.ssh\id_ed25519 | clip
```

3. Teste antes de salvar o secret:
   ```powershell
   ssh -i $env:USERPROFILE\.ssh\id_ed25519 VPS_USER@IP_OU_HOST_PROD "echo ok"
   ```

**Prós:** mais simples, uma chave só para gerenciar.  
**Contras:** a privada fica também no GitHub (secret); se vazar, afeta dev e prod — por isso muitos times preferem chave só para CI.

---

## Passos (chave nova ou reutilizada)

1. Copie a **privada** para o secret `VPS_SSH_KEY` no GitHub (inclui `-----BEGIN OPENSSH PRIVATE KEY-----`).

2. Na **VPS prod**, adicione a **pública** correspondente ao `authorized_keys` (pule se já estiver lá):
   ```bash
   # na VPS, como VPS_USER:
   mkdir -p ~/.ssh && chmod 700 ~/.ssh
   echo "conteúdo-do-arquivo-.pub" >> ~/.ssh/authorized_keys
   chmod 600 ~/.ssh/authorized_keys
   ```

3. Teste localmente antes de reexecutar o workflow:
   ```powershell
   ssh -i CAMINHO_DA_SUA_CHAVE_PRIVADA VPS_USER@VPS_HOST "echo ok"
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
