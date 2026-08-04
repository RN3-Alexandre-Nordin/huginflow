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
