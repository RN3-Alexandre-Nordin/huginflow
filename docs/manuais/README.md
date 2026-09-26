# Manuais do Hugin Flow

## Estrutura

```
docs/manuais/                     ← HTML dos manuais (fonte)
  manual-administrador.html
  manual-estoque.html
  treinamento-operadores.html
  README.md                       ← este arquivo

docs/manual/img/                  ← prints e vídeos (assets)
  *.png · steps/ · treinamento/ · videos/
```

## O que versionar no Git

- `docs/manuais/*.html`
- `docs/manuais/README.md`
- `docs/manual/img/**/*.png` (prints gerados por `npm run manual:capture`)

## Manuais no app (menu ?)

No Cockpit, ícone **?** → **Manuais** (submenu):

| Item | HTML fonte | Rota app | API |
|------|------------|----------|-----|
| Manual do administrador | `docs/manuais/manual-administrador.html` | `/cockpit/ajuda` | `/api/ajuda/manual` |
| Manual de Estoque | `docs/manuais/manual-estoque.html` | `/cockpit/ajuda/estoque` | `/api/ajuda/manual-estoque` |
| Treinamento do operador | `docs/manuais/treinamento-operadores.html` | `/cockpit/ajuda/treinamento` | `/api/ajuda/treinamento-operadores` |

## Manual do administrador

- HTML: `docs/manuais/manual-administrador.html`
- Servido no app: `/api/ajuda/manual` (menu **?** → Manuais → Manual do administrador)
- **Acesso:** somente `role_global` `admin` ou `superadmin` (menu oculto, página → acesso-negado, API 403)
- Rev. **set/2026** — empresa, departamentos, grupos/matriz RBAC, usuários, canais WhatsApp,
  addons e checklist de onboarding. Sem fluxos de operador (chat/cards).

## Manual do operador (treinamento)

- HTML: `docs/manuais/treinamento-operadores.html`
- Servido no app: `/api/ajuda/treinamento-operadores` (menu **?** → Manuais → Treinamento)
- Rev. **set/2026** — Chat Omnichannel, cards, chat interno e chamados Bifrost.

## Manual de Estoque

- HTML: `docs/manuais/manual-estoque.html`
- Servido no app: `/api/ajuda/manual-estoque` (menu **?** → Manuais → Manual de Estoque)
- Rev. **set/2026** — locais, configuração, entradas, retiradas, transferências, ajustes,
  requisições, remessas, saldos, cardex e relatórios.

## Prints automáticos (recomendado)

Gera PNGs reais do sistema rodando em dev e salva em `docs/manual/img/`.

```bash
# 1. Instalar Playwright (uma vez)
npm install -D playwright
npx playwright install chromium

# 2. Subir o app
npm run dev

# 3. Capturar telas
npm run manual:capture

# Só recapturar capítulo 7 (Chat Omnichannel)
npm run manual:capture:omni

# Só recapturar §8.1 — badge vermelho no chat interno
npm run manual:capture:chat-badge

# Recapturar imagens do manual do operador (§6–9)
npm run manual:capture:treinamento
```

Com túnel Cloudflare (`NEXT_PUBLIC_APP_URL` no `.env.local`):

```bash
MANUAL_BASE_URL=https://huginflow-local.rn3.tec.br npm run manual:capture:omni
```

Arquivos gerados:

| Pasta | Conteúdo |
|-------|----------|
| `docs/manual/img/*.png` | Figuras principais |
| `docs/manual/img/steps/*.png` | Passo a passo numerado |
| `docs/manual/img/videos/*.webm` | Gravações Playwright |

## Como o app resolve imagens

- Nos HTML: `src="manual/img/..."`
- `prepareHelpHtml` reescreve para `/api/ajuda/img/...`
- Assets físicos em `docs/manual/img/`
