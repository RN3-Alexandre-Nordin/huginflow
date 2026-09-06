# Bifrost — abrir chamado embutido (Hugin → iframe SSO)

Integração do Hugin Flow com o embed Bifrost (`/embed/sso`) para o usuário do tenant abrir chamado com sistema/empresa/usuário pré-preenchidos via JWT RS256.

**Dual-ambiente:** Hugin **prod** e Hugin **dev/treino** usam o **mesmo** Bifrost (`https://bifrost.rn3.tec.br`), com `sistema_origem` e JWKS distintos.

## Endpoints Hugin

| Método | Path | Auth | Uso |
|--------|------|------|-----|
| `GET` | `/api/bifrost/jwks` | público (bypass no `proxy.ts`) | JWKS (`kid`, `n`, `e`, `alg: RS256`) |
| `POST` | `/api/bifrost/embed-token` | sessão logada | Emite JWT (TTL 60s) + URL do iframe |

## Cadastro no Bifrost (`sistemas_origem`)

Dois registros no Bifrost produção:

| Ambiente Hugin | `codigo` / claim `sistema_origem` | `issuer` | `jwks_url` |
|----------------|-------------------------------------|----------|------------|
| Produção (`app.huginflow.com`) | `hugin_flow` | `https://app.huginflow.com/bifrost` | `https://app.huginflow.com/api/bifrost/jwks` |
| Dev / treinamento | `hugin_flow_dev` | issuer do ambiente de treino (ex. `https://dev.huginflow.com/bifrost` ou túnel) | JWKS **público** desse ambiente (não o de prod) |

`audience` em ambos: `bifrost`.

## Variáveis de ambiente (Hugin)

### Produção

```env
BIFROST_URL=https://bifrost.rn3.tec.br
BIFROST_ORIGIN=https://bifrost.rn3.tec.br
BIFROST_SISTEMA_ORIGEM=hugin_flow
BIFROST_JWT_ISSUER=https://app.huginflow.com/bifrost
BIFROST_JWT_KID=hugin-1
BIFROST_JWT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
```

### Dev / treinamento (stack Portainer ou `.env.local`)

```env
BIFROST_URL=https://bifrost.rn3.tec.br
BIFROST_ORIGIN=https://bifrost.rn3.tec.br
BIFROST_SISTEMA_ORIGEM=hugin_flow_dev
BIFROST_JWT_ISSUER=https://dev.huginflow.com/bifrost
BIFROST_JWT_KID=hugin-dev-1
BIFROST_JWT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
```

Defaults no código (se a env faltar):

| Variável | Default |
|----------|---------|
| `BIFROST_URL` / `BIFROST_ORIGIN` | `https://bifrost.rn3.tec.br` |
| `BIFROST_SISTEMA_ORIGEM` | `hugin_flow` se `HUGINFLOW_ENV=production` ou app URL de prod; senão `hugin_flow_dev` |
| `BIFROST_JWT_ISSUER` | derivado do `sistema_origem` + `NEXT_PUBLIC_APP_URL` |
| `BIFROST_JWT_KID` | `hugin-1` (prod) / `hugin-dev-1` (dev) |

**Não** use `sistema_origem=hugin_flow` no treino se o Bifrost prod valida esse código com JWKS/chave de `app.huginflow.com`.

Local com Bifrost no PC: sobrescreva `BIFROST_URL` / `BIFROST_ORIGIN` para `http://localhost:3001` (ou a porta do Bifrost).

Gerar chaves locais:

```bash
node scripts/bifrost/generate-keypair.mjs
node scripts/bifrost/inject-env-local.mjs
```

**Não** committe `scripts/bifrost/.keys/`.

### Produção via GitHub Actions

Secrets no repositório (Settings → Secrets → Actions), injetadas no Swarm pelo job `deploy-prod`:

| Secret | Obrigatório |
|--------|-------------|
| `BIFROST_JWT_PRIVATE_KEY` | sim |
| `BIFROST_JWT_PUBLIC_KEY` | não |
| `BIFROST_JWT_KID` | não (default `hugin-1`) |
| `BIFROST_JWT_ISSUER` | não (default `https://app.huginflow.com/bifrost`) |

URL/ORIGIN/`sistema_origem` de prod são fixos no workflow (`bifrost.rn3.tec.br` / `hugin_flow`).

## UX

Menu **?** (header do Cockpit) → **Chamados**:

| Item | Embed |
|------|--------|
| **Abrir chamado** | `{BIFROST_URL}/embed/sso?token=…&origin=…&next=/embed/chamados/novo` |
| **Meus chamados** | `{BIFROST_URL}/embed/sso?token=…&origin=…&next=/embed/chamados` |

`POST /api/bifrost/embed-token` aceita body `{ "next": "/embed/chamados" | "/embed/chamados/novo" | … }` (só paths `/embed/...`).

Na **lista**, o usuário navega no iframe (lista → detalhe); o modal **não** fecha por `postMessage`.

Ao receber `postMessage` `{ source: "bifrost", type: "chamado-criado", protocolo, message }` (**só no Abrir chamado**) com `event.origin === BIFROST_ORIGIN`, o Hugin mostra confirmação com o protocolo e só fecha no botão **Fechar**.

## Segurança

- Privada só no server; emissão apenas em `POST /api/bifrost/embed-token`.
- JWT: `iss`, `aud=bifrost`, `jti`, `exp` (+60s), claims `user_id`, `email`, `name`, `tenant`, `empresa`, `sistema_origem` (env).
- JWKS público em prod e em dev (sem redirect para login).
- Listener valida `event.origin`.
