# Manual — capturas de tela e vídeos

## O que versionar no Git

Subir para o GitHub (necessário para produção):

- `docs/manual-usuario-huginflow.html`
- `docs/manual/img/**/*.png` (prints gerados por `npm run manual:capture`)
- `docs/manual/README.md` (este arquivo)

**Não** é preciso versionar toda a pasta `docs/` — só o manual e as imagens. Planos de teste internos podem ficar fora do repo (ver `.gitignore`).

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

# Só recapturar capítulo 7 (Chat Omnichannel — aguarda lista e conversa carregarem)
npm run manual:capture:omni
```

Com túnel Cloudflare (`NEXT_PUBLIC_APP_URL` no `.env.local`):

```bash
MANUAL_BASE_URL=https://huginflow-local.rn3.tec.br npm run manual:capture:omni
```

Se o operador de treino não tiver conversas na lista, use o admin da empresa (mesma UI, lista populada):

```bash
MANUAL_EMAIL=admin@montesinaiatacado.com.br MANUAL_PASSWORD='hugin123@2026' npm run manual:capture:omni
```

Opcional — gravar vídeo `.webm` de cada sessão do navegador:

```bash
npm run manual:video
```

Arquivos gerados:

| Pasta | Conteúdo |
|-------|----------|
| `docs/manual/img/*.png` | Figuras principais do manual |
| `docs/manual/img/steps/*.png` | Passo a passo numerado |
| `docs/manual/img/videos/*.webm` | Gravações Playwright (renomear manualmente) |

Variáveis opcionais:

```bash
MANUAL_EMAIL=gestor@empresa.com MANUAL_PASSWORD='...' npm run manual:capture
```

Por padrão o script usa `vendedor@montesinaiatacado.com.br` no dev local (`localhost:3000`) para gerar prints com logo **Hugin Flow** atualizado.

## Vídeos tutoriais (alternativas)

| Ferramenta | Quando usar |
|------------|-------------|
| `npm run manual:video` | Rascunho rápido, fluxo scriptado, sem narração |
| **Loom** / **OBS** | Tutorial com voz para o cliente (go-live) |
| Edição posterior | Cortar, legendas, logo RN3 |

Sugestão de roteiro para 5 vídeos curtos (2–3 min cada): login, WhatsApp+QR, chat takeover, funil/card, base de conhecimento.

## Como o manual usa as imagens

- HTML fonte: `docs/manual-usuario-huginflow.html`
- Servido no app: `/api/ajuda/manual` (paths `manual/img/…` viram `/api/ajuda/img/…`)
- Se o PNG não existir, o manual mostra ilustração SVG de fallback
