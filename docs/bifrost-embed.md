# Bifrost — abrir chamado embutido (Hugin → iframe SSO)

Integração do Hugin Flow com o embed Bifrost (`/embed/sso`) para o usuário do tenant abrir chamado com sistema/empresa/usuário pré-preenchidos via JWT RS256.

## Endpoints Hugin

| Método | Path | Auth | Uso |
|--------|------|------|-----|
| `GET` | `/api/bifrost/jwks` | público (bypass no `proxy.ts`) | JWKS (`kid`, `n`, `e`, `alg: RS256`) |
| `POST` | `/api/bifrost/embed-token` | sessão logada | Emite JWT (TTL 60s) + URL do iframe |

## Cadastro no Bifrost (`sistemas_origem`)

| Campo | Valor |
|-------|--------|
| `codigo` | `hugin_flow` |
| `audience` | `bifrost` |
| `issuer` | `https://app.huginflow.com/bifrost` (ou o valor de `BIFROST_JWT_ISSUER`) |
| `jwks_url` | `{APP_PUBLIC_URL}/api/bifrost/jwks` |

Exemplos de `jwks_url`:

- Local (Hugin na porta do app): `http://localhost:3001/api/bifrost/jwks` (ajuste a porta)
- Túnel / staging: `https://huginflow-local.rn3.tec.br/api/bifrost/jwks`
- Produção: `https://app.huginflow.com/api/bifrost/jwks`

## Variáveis de ambiente (Hugin)

```env
BIFROST_URL=http://localhost:3000
BIFROST_ORIGIN=http://localhost:3000
BIFROST_JWT_ISSUER=https://app.huginflow.com/bifrost
BIFROST_JWT_KID=hugin-1
BIFROST_JWT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
# opcional (se omitido, JWKS deriva da privada no server):
# BIFROST_JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
```

Gerar chaves locais:

```bash
node scripts/bifrost/generate-keypair.mjs
```

**Não** committe `scripts/bifrost/.keys/`.

## UX

Menu **?** (header do Cockpit) → **Chamados**:

| Item | Embed |
|------|--------|
| **Abrir chamado** | `/embed/sso?token=…&origin=…&next=/embed/chamados/novo` |
| **Meus chamados** | `/embed/sso?token=…&origin=…&next=/embed/chamados` |

`POST /api/bifrost/embed-token` aceita body `{ "next": "/embed/chamados" | "/embed/chamados/novo" | … }` (só paths `/embed/...`).

Na **lista**, o usuário navega no iframe (lista → detalhe); o modal **não** fecha por `postMessage`.

Ao receber `postMessage` `{ source: "bifrost", type: "chamado-criado", protocolo, message }` (**só no Abrir chamado**) com `event.origin === BIFROST_ORIGIN`, o Hugin mostra confirmação com o protocolo e só fecha no botão **Fechar**.

## Segurança

- Privada só no server; emissão apenas em `POST /api/bifrost/embed-token`.
- JWT: `iss`, `aud=bifrost`, `jti`, `exp` (+60s), claims `user_id`, `email`, `name`, `tenant`, `empresa`, `sistema_origem=hugin_flow`.
- Listener valida `event.origin`.
