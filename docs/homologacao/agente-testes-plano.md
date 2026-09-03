# Agente de testes — plano e controle (HuginFlow)

**Decisões (set/2026):**

| # | Decisão |
|---|--------|
| 1 | Começar **só em dev** (`localhost` / `huginflow-local`). Depois de estável, repetir smoke em prod com empresa de teste. |
| 2 | **Dois tipos juntos:** testes de **tela** (Playwright) + **scripts** (blocos já existentes). Relatório único, fácil de ler. |
| 3 | Começar pelo **núcleo do operador** (mais simples). Já existe abaixo o **inventário completo** e o **cronograma de incremento**. |

Este arquivo é o **controle mestre**: o que deve ser testado, o que já está coberto, e em qual fase entra.

---

## 1. Em uma frase

Antes de cada entrega importante, um comando único roda a bateria, gera um **relatório PASS/FAIL** e, se falhar, **não se considera pronto para produção**.

---

## 2. Como rodar (alvo)

```bash
# Um comando só (dev) — Fase 1: scripts SCR-* + UI e2e-core
npm run test:agent:dev

# Só scripts (rápido):
npm run test:agent:scripts

# Gera:
#   docs/homologacao/execucoes/{runId}/report.html + summary.json
#   docs/homologacao/execucoes/agente-latest.html / .json
```

No módulo `/cockpit/testes` (superadmin), escolha a suite **Fase 1 — Agente**.

---

## 3. Formato do relatório (fácil de ler)

Todo run deve caber numa página:

```markdown
# Relatório agente — 2026-09-15 18:40
Ambiente: DEV · Base: https://huginflow-local.rn3.tec.br
Commit: abc1234 · Duração: 6m 12s

## Resultado: ❌ FALHOU (2 falhas)

| Suite | Tipo | Passou | Falhou | Pulou |
|-------|------|--------|--------|-------|
| Core operador (UI) | Tela | 9 | 1 | 0 |
| Auth + health (scripts) | Script | 5 | 1 | 0 |

## O que quebrou
1. **UI-CARD-04** — Botão Anexos (clipe) não apareceu no hub  
   → Screenshot: .../ui-card-04.png  
2. **SCR-AUTH-02** — Login senha errada não retornou erro esperado  

## Próximo passo
Corrigir UI-CARD-04 e SCR-AUTH-02 · reexecutar `npm run test:agent:dev`
```

Regras do relatório:

- Verde só se **zero falhas** (pulo permitido só se marcado “manual / depende WhatsApp real”).
- Cada falha traz **ID do teste** + **o que esperava** + **link/screenshot**.
- Sem jargão no resumo — detalhe técnico fica no JSON / Playwright HTML.

---

## 4. Inventário completo (controle do que deve ser testado)

Legenda de **status**:

| Status | Significado |
|--------|-------------|
| `planejado` | Vai ser automatizado; ainda não existe |
| `coberto` | Já existe spec/script e passou em run recente |
| `fase-N` | Entra na fase N do cronograma |
| `script` | Já existe (ou quase) em `scripts/supabase/block*.mjs` |
| `manual` | Continua humano (QR, áudio real, UAT cliente) |
| `ui` | Será Playwright (tela) |

### 4.1 Núcleo operador — UI (começar aqui)

| ID | O que valida | Manual ref. | Status |
|----|--------------|-------------|--------|
| UI-AUTH-01 | Login com credencial válida → Cockpit | §4 | `coberto` `fase-1` `ui` |
| UI-AUTH-02 | Senha errada → mensagem de erro | §4 | `coberto` `fase-1` `ui` |
| UI-AUTH-03 | Sem sessão, `/cockpit` → login | §4 | `coberto` `fase-1` `ui` |
| UI-NAV-01 | Menu lateral: Cockpit, Omni, Funis | §6 | `coberto` `fase-1` `ui` |
| UI-NAV-02 | Menu hambúrguer recolhe/expande | §6.1 | `fase-2` `ui` |
| UI-OMNI-01 | Abrir Chat Omnichannel + lista carrega | §7 | `coberto` `fase-1` `ui` |
| UI-OMNI-02 | Selecionar conversa + campo responder | §7.1 | `coberto` `fase-1` `ui` |
| UI-OMNI-03 | Abrir Contexto do cliente | §7.3 | `fase-2` `ui` |
| UI-OMNI-04 | Botão Encaminhar visível com conversa | §7.5 | `fase-2` `ui` |
| UI-FUNIL-01 | Lista Funis → Abrir Kanban | §9 | `coberto` `fase-1` `ui` |
| UI-FUNIL-02 | Colunas do board visíveis | §9 | `coberto` `fase-1` `ui` |
| UI-CARD-01 | Abrir modal (Gestão do Card / lápis) | §9.0 | `coberto` `fase-1` `ui` |
| UI-CARD-02 | Hub: Responsável, Prazo, Cliente | §9.0 | `coberto` `fase-1` `ui` |
| UI-CARD-03 | Hub: Observações + Salvar | §9.0 | `coberto` `fase-1` `ui` |
| UI-CARD-04 | Hub: painel Anexos (clipe + Ver) | §9.6 | `coberto` `fase-1` `ui` |
| UI-CARD-05 | Hub: 4 ações na mesma linha (Encaminhar, WhatsApp, Editar, Chat) | §9.0 | `coberto` `fase-1` `ui` |
| UI-CARD-06 | Tela Anexos: área de upload | §9.6 | `fase-2` `ui` |
| UI-CARD-07 | Encaminhar: Departamento destino | §9.2 | `fase-2` `ui` |
| UI-CHAT-01 | Botão flutuante abre Conversas | §8 | `coberto` `fase-1` `ui` |
| UI-CHAT-02 | Thread Card + Gestão do Card | §8.2 | `fase-2` `ui` |
| UI-CHAT-03 | Mencionar `@` abre lista | §8.3 | `fase-3` `ui` |
| UI-PERM-01 | Usuário sem permissão → Acesso Interditado / oculto | RBAC | `fase-3` `ui` |
| UI-TENANT-01 | Não vazar funil de outra empresa | Multi-tenant | `fase-3` `ui` |

### 4.2 Scripts / API (homologação existente → adaptados a **dev**)

| ID | Bloco homologação | O que valida | Status |
|----|-------------------|--------------|--------|
| SCR-INFRA-01 | 1 | `/login` 200, health omnichannel | `coberto` `fase-1` `script` |
| SCR-AUTH-01 | 2 | Login correto (dev) | `coberto` `fase-1` `script` |
| SCR-AUTH-02 | 2 | Senha errada | `coberto` `fase-1` `script` |
| SCR-EMP-01 | 3 | Empresa / usuários teste | `fase-2` `script` |
| SCR-FUNIL-01 | 4 | Funil + card CRUD + mover + anexo | `fase-2` `script` |
| SCR-LEAD-01 | 5 | Leads CRUD | `fase-3` `script` |
| SCR-CANAL-01 | 6 | Canal inbound + token | `fase-3` `script` |
| SCR-RAG-01 | 7 | Base de conhecimento | `fase-4` `script` |
| SCR-SIM-01 | 8 | Simulador IA | `fase-4` `script` |
| SCR-WA-01 | 9 | WhatsApp (exceto QR) | `fase-4` `script` |
| SCR-WA-QR | 9.2 | QR escaneado | `manual` |
| SCR-WA-AUDIO | 9.8 | Áudio real | `manual` |
| SCR-DASH-01 | 10 | Dashboard gestor | `fase-4` `script` |
| SCR-CHAT-01 | 10a | Chat interno (API/dados) | `fase-2` `script` |
| SCR-RBAC-01 | 11 | Permissões | `fase-3` `script` |
| SCR-UAT | 12 | UAT cliente real | `manual` |

### 4.3 Expansões futuras (já no radar)

| ID | Tema | Status |
|----|------|--------|
| UI-BI-01 | Módulo Relatórios / BI (quando front existir) | `fase-5` |
| UI-FIN-01 | Financeiro / contratos (se operador usa) | `fase-5` |
| SCR-ANALYTICS-01 | RPCs `fn_analytics_*` | `fase-5` |
| UI-OMNI-MULTI | Duas sessões mesmo lead (deptos) | `fase-3` |
| UI-CARD-MOVE | Arrastar card de coluna | `fase-3` |

---

## 5. Cronograma de incremento (schedule)

| Fase | Quando (orientação) | Entrega | Comando alvo |
|------|---------------------|---------|--------------|
| **0 — Fundação** | Agora (1–2 dias) | Pasta `e2e/`, Playwright Test, login helper, relatório MD+JSON, `data-testid` mínimos no hub/omni/chat | `npm run test:e2e:core` (só UI) |
| **1 — Núcleo verde** | Em seguida (~1 semana) | Todos os IDs `fase-1` (UI + SCR-INFRA/AUTH) + relatório unificado | `npm run test:agent:dev` |
| **2 — Card + chat + funil scripts** | +1–2 semanas | UI-OMNI-03/04, UI-CARD-06/07, UI-CHAT-02, SCR-FUNIL, SCR-CHAT, SCR-EMP | mesma suíte, mais casos |
| **3 — Segurança e leads** | +2 semanas | RBAC UI, tenant, menções, leads, canais, multi-sessão, drag card | — |
| **4 — IA / WhatsApp / RAG** | Após núcleo estável | Scripts 7–10; WhatsApp sem QR; simulador | — |
| **5 — Prod smoke + BI** | Quando fase 1–2 confiáveis | Mesma bateria apontando prod (tenant teste) + analytics/BI | `npm run test:agent:prod-smoke` |

**Regra de ouro:** só avança de fase se a anterior estiver **verde 3 runs seguidos** em dev.

---

## 6. Ordem do dia a dia (dev)

1. Subir app: `npm run dev:turbo`
2. Rodar agente: `npm run test:agent:dev` (ou `/cockpit/testes` → Fase 1)
3. Ler o **HTML** em `docs/homologacao/execucoes/agente-latest.html`
4. Se vermelho → corrige → roda de novo
5. Só então merge / preparação de deploy

---

## 7. Relação com o que já existe

| Já temos | Papel no agente |
|----------|-----------------|
| `docs/homologacao/plano-homologacao-versao.md` | Checklist humano + mapa dos blocos |
| `scripts/supabase/block*-prod.mjs` | Viram camada **script**; espelhos **dev** quando necessário |
| `scripts/manual/capture-screenshots.mjs` | Referência de login/navegação Playwright (não é a suíte) |
| Manual do operador | Fonte dos casos UI `UI-*` |

Não jogamos fora a homologação: o agente **automatiza e reporta**; o checklist continua para itens `manual`.

---

## 8. Critérios de “pronto para produção” (depois que houver prod-smoke)

- [ ] `test:agent:dev` verde no commit a liberar  
- [ ] (Futuro) `test:agent:prod-smoke` verde  
- [ ] Itens `manual` da release marcados no checklist da execução  
- [ ] Relatório da execução salvo em `docs/homologacao/execucoes/`

---

## 9. Fase 0 — status

| Item | Status |
|------|--------|
| `e2e/` + `playwright.config.ts` | ✅ |
| Credenciais via `TEST_*` / `MANUAL_*` (tenant teste) | ✅ |
| Specs `UI-AUTH-*`, `UI-NAV-01`, `UI-OMNI-01/02`, `UI-FUNIL-*`, `UI-CARD-01..05`, `UI-CHAT-01` | ✅ |
| Relatório **HTML** + JSON em `docs/homologacao/execucoes/` | ✅ |
| Módulo UI `/cockpit/testes` (superadmin) + `test_runs` | ✅ |
| `data-testid` hub / omni / chat / nav | ✅ |
| Comando `npm run test:e2e:core` | ✅ |

**Como validar:** com `npm run dev:turbo` e `TEST_RUNNER_ENABLED=true` → abrir `/cockpit/testes` como superadmin → Rodar núcleo → ler HTML.

---

## 10. Fase 1 — status

| Item | Status |
|------|--------|
| Scripts `SCR-INFRA-01`, `SCR-AUTH-01`, `SCR-AUTH-02` (`scripts/agent/phase1-scripts.mjs`) | ✅ |
| Runner unificado `npm run test:agent:dev` | ✅ |
| Relatório HTML unificado (scripts + UI) | ✅ |
| Suite `agent-dev` no módulo `/cockpit/testes` | ✅ |
| Catálogo SCR-* em `src/lib/testes/catalog.ts` | ✅ |
| UI `fase-1` (e2e-core) no mesmo relatório | ✅ |

**Como validar:** `npm run dev:turbo` → `npm run test:agent:dev` → abrir `docs/homologacao/execucoes/agente-latest.html`.

**Próximo:** Fase 2 — card anexos/upload, encaminhar, chat thread, scripts SCR-EMP/FUNIL/CHAT.
