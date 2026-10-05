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
# Um comando só (dev) — Fases 1–3: scripts SCR-* + UI e2e-core
npm run test:agent:dev

# Só scripts (rápido):
npm run test:agent:scripts

# Gera:
#   docs/homologacao/execucoes/{runId}/report.html + summary.json
#   docs/homologacao/execucoes/agente-latest.html / .json
```

No módulo `/cockpit/testes` (superadmin), escolha a suite **Fases 1–3 — Agente**.

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
| UI-DASH-01 | KPIs e filtros do dashboard gestor | §10 | `fase-4` `ui` |

### 4.1b Cadastros mestres (F1)

| ID | O que valida | Status |
|----|--------------|--------|
| UI-CAD-01 | Hub Cadastros: Pessoas, SKUs, Famílias, Conversões, De-para, Ativos | `coberto` `ui` |
| UI-CAD-02 | Lista Pessoas carrega | `coberto` `ui` |
| UI-CAD-03 | Lista SKUs carrega | `coberto` `ui` |
| UI-CAD-04 | Lista Famílias SKU carrega | `coberto` `ui` |
| UI-CAD-05 | Lista Conversões UM carrega | `coberto` `ui` |
| UI-CAD-06 | Lista De-para carrega | `coberto` `ui` |
| UI-CAD-07 | Lista Ativos carrega | `coberto` `ui` |
| SCR-CAD-01 | CRUD cadeia família→SKU→UM→pessoa→de-para→ativo + cleanup | `coberto` `script` |

Comando script: `npm run test:agent:scripts:cadastros` (também entra em `test:agent:scripts` / `test:agent:dev`).

### 4.1c Entitlements / addons (F0)

| ID | O que valida | Status |
|----|--------------|--------|
| UI-ENT-01 | `workflow` off → menu/URL Funis bloqueados | `coberto` `ui` |
| UI-ENT-02 | `omni` off → menu/URL Chat bloqueados | `coberto` `ui` |
| UI-ENT-03 | Financeiro permanece `rn3Only` para admin de tenant | `coberto` `ui` |
| API-ENT-01 | `/api/v1/addons` Bearer + catálogo sem slug `financeiro` | `coberto` `ui` |

Specs: `e2e/core/entitlements.spec.ts` (já na suíte Playwright do `test:agent:dev`). Exige `TEST_ALLOW_MUTATIONS=1` nos casos que desligam addon.

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

### 4.3 Expansões implementadas

| ID | Tema | Status |
|----|------|--------|
| UI-BI-01 | Módulo Relatórios / BI | `fase-5` `implementado` |
| UI-FIN-01 | Financeiro restrito ao RN3 | `fase-5` `implementado` |
| SCR-ANALYTICS-01 | RPCs `fn_analytics_*` | `fase-5` `implementado` |
| UI-OMNI-DEPT | ACL por departamento somente no Omnichannel | `fase-5` `implementado` |
| UI-BIFROST-01 | Abrir formulário e consultar chamados via SSO | `fase-5` `implementado` |
| UI-BIFROST-02 | Acesso direto ao formulário e consulta no domínio Bifrost | `fase-5` `implementado` |
| UI-OMNI-MULTI | Duas sessões mesmo lead (deptos) | `fase-3` |
| UI-CARD-MOVE | Arrastar card de coluna | `fase-3` |

### 4.4 Módulo Estoque (Fase 6) — inventário

**Fontes:** [desenvolvimento-modulo-estoque.md](../specs-aplicadas/desenvolvimento-modulo-estoque.md) (§12 rotas, §13 RBAC, §16 aceite) · pacotes SQL em [MIGRACAO-SUPABASE.md](../MIGRACAO-SUPABASE.md) § Pacote Estoque · smoke de volume em [smoke-relatorios-monte-sinai-dev.md](../testes/smoke-relatorios-monte-sinai-dev.md).

**Pré-condições do tenant de teste:** addon `estoque` ligado · SKUs com `controla_estoque` · Pessoas (fornecedor/destinatário/requisitante) · local `BRANCO` (+ 2º local para transferência) · de-para e conversão UM quando o caso de entrada exigir · `TEST_ALLOW_MUTATIONS=1` + cleanup por `empresa_id` / marcador do run.

**REGRA DE OURO (obrigatória em todo SCR-EST que movimente):** após sucesso, existe linha em `est_movimentos` **e** `est_saldos` coerente; em falha parcial, nenhum dos dois fica gravado. Preferir RPC `est_registrar_movimento_atomico` / fluxos de lote já usados pela UI.

#### 4.4.1 UI — hub, cadastros e consultas

| ID | O que valida | Aceite / spec | Status |
|----|--------------|---------------|--------|
| UI-EST-ADDON-01 | Sem addon `estoque` → menu oculto e URL `/cockpit/estoque` bloqueada | §16.1 | `coberto` `fase-6` `ui` |
| UI-EST-NAV-01 | Com addon + `estoque.view`: menu Estoque → hub com cards operacionais | §12 | `coberto` `fase-6` `ui` |
| UI-EST-LOC-01 | CRUD Locais; cria/mantém principal `BRANCO` (`eh_principal`); bloqueia 2º principal | §5 · §16.2 | `coberto` `fase-6` `ui` (smoke lista; CRUD completo ainda manual) |
| UI-EST-CFG-01 | Configuração: path NFe (rede local), modo saldo req., aprovador; botão reconstruir saldos visível a quem pode | §4.1 · §16.3 | `coberto` `fase-6` `ui` (smoke tela) |
| UI-EST-SAL-01 | Tela Saldos carrega posição (`est_saldos` / consolidado) com paginação | F4.5 parcial | `coberto` `fase-6` `ui` (smoke tela) |
| UI-EST-CAR-01 | Cardex lista movimentos; painel OK sem “Erro ao carregar” / timeout | §2.1 · §4.0 | `coberto` `fase-6` `ui` |
| UI-EST-CAR-02 | Busca `?q=` com código hifenizado (regressão DEST-011 / OR ilike+sku) | Performance SaaS | `coberto` `fase-6` `ui` |
| UI-EST-REL-01 | Hub `/cockpit/estoque/relatorios` abre slugs; 1ª página ≤50 linhas | F4.5 · smoke MS | `coberto` `fase-6` `ui` (smoke hub) |

#### 4.4.2 UI — entradas

| ID | O que valida | Aceite / spec | Status |
|----|--------------|---------------|--------|
| UI-EST-ENT-01 | Entrada lote na tela: justificativa obrigatória; grava lote + sobe saldo | §6 · §16.4–5 | `planejado` `fase-6` `ui` |
| UI-EST-ENT-02 | Entrada por planilha (template) com erros por linha e itens OK gravados | §6 canal B | `planejado` `fase-6` `ui` |
| UI-EST-ENT-03 | Entrada XML NFe (fixture em `docs/testes/*.xml`): parse + motor V1–V4 + status | §6 canal C · §16.4 | `planejado` `fase-6` `ui` |
| UI-EST-ENT-04 | Bloqueios de cadastro: sem fornecedor / sem de-para / UM sem conversão → mensagem aponta Cadastros | §16.6–8 | `planejado` `fase-6` `ui` |

#### 4.4.3 UI — saídas operacionais (retirada, transferência, ajuste)

| ID | O que valida | Aceite / spec | Status |
|----|--------------|---------------|--------|
| UI-EST-RET-01 | Retirada lote tabular (só manual): SKU+qtd+justificativa; default `BRANCO`; bloqueia saldo insuficiente | §8 · §16.12–15 | `planejado` `fase-6` `ui` |
| UI-EST-TRF-01 | Transferência multi-SKU: origem≠destino; consulta saldo origem; UM estoque só | §7 · §16.10–11 | `planejado` `fase-6` `ui` |
| UI-EST-AJU-01 | Ajuste lote tabular (+/−): justificativa; não gera saldo negativo | §9 · §16.14–15 | `planejado` `fase-6` `ui` |

#### 4.4.4 UI — remessa (poder de terceiros)

| ID | O que valida | Aceite / spec | Status |
|----|--------------|---------------|--------|
| UI-EST-REM-01 | Envio: destinatário Pessoas + motivo catálogo; baixa local + sobe poder de terceiros | §11 · §16.23 | `planejado` `fase-6` `ui` |
| UI-EST-REM-02 | Retorno parcial/total: devolve ao local e reduz poder; não mistura com entrada de compra | §11 · §16.24 | `planejado` `fase-6` `ui` |
| UI-EST-REM-03 | Baixa definitiva / liquidação (quando aplicável): Cardex `remessa_baixa` em TERCEIROS | hist. 2026-09-13 | `planejado` `fase-6` `ui` |

#### 4.4.5 UI — requisições

| ID | O que valida | Aceite / spec | Status |
|----|--------------|---------------|--------|
| UI-EST-REQ-01 | Requisição manual: requisitante Pessoas + itens SKU/qtd | §10 · §16.16 | `planejado` `fase-6` `ui` |
| UI-EST-REQ-02 | Import planilha (Hugin e/ou adapter ATC se addon); origem rastreável | §10.8 · hist. adapter | `planejado` `fase-6` `ui` |
| UI-EST-REQ-03 | Fila aprovação interna (aprovador config / admin); auditoria | §10.5 | `planejado` `fase-6` `ui` |
| UI-EST-REQ-04 | Atendimento gera `saida`/`origem=requisicao` e respeita `req_saldo_insuficiente_modo` | §10.4 · §16.17–19 | `planejado` `fase-6` `ui` |

#### 4.4.6 Scripts / API (mutáveis, tenant-safe)

| ID | O que valida | Aceite / spec | Status |
|----|--------------|---------------|--------|
| SCR-EST-GOLD-01 | Movimento atômico: Cardex + Saldo no mesmo commit; falha → rollback | §16.21 · Regra de Ouro | `coberto` `fase-6` `script` |
| SCR-EST-BATCH-01 | `est_reconstruir_saldos_from_cardex` reconcilia por `empresa_id` sem divergência residual | §16.22 | `coberto` `fase-6` `script` |
| SCR-EST-TENANT-01 | Empresa A não lê lotes/saldos/movimentos/reqs/remessas da B (RLS) | §16.20 | `coberto` `fase-6` `script` |
| SCR-EST-ENT-01 | Entrada via service/RPC com fixture mínima sobe saldo e cardex `entrada` | §6 · §16.9 | `coberto` `fase-6` `script` |
| SCR-EST-SALDO-01 | Retirada/transferência/ajuste negativo bloqueados com saldo insuficiente | §16.10 · §16.15 | `coberto` `fase-6` `script` |
| SCR-EST-TRF-01 | Transferência redistribui saldos (total empresa estável; origem↓ destino↑) | §7 | `coberto` `fase-6` `script` |
| SCR-EST-REM-01 | Envio/retorno atualizam `est_saldos` + `est_saldos_poder_terceiros` juntos | §11 · §16.23–24 | `coberto` `fase-6` `script` (envio; retorno UI ainda planejado) |
| SCR-EST-REQ-01 | Ciclo req → (aprovação) → atendimento parcial/total conforme modo config | §10 · §16.17–19 | `coberto` `fase-6` `script` (req aprovada + saida; fila aprovacao UI ainda planejada) |
| SCR-EST-RPC-01 | `est_rpc_relatorio`: `total_count` estável, page 50 + offset, isolamento tenants | smoke MS · F4.5 | `coberto` `fase-6` `script` |
| SCR-EST-RBAC-01 | Slugs `estoque_*` / matriz: usuário sem perm não cria lote; com perm cria | §13 | `coberto` `fase-6` `script` |
| SCR-EST-CAR-01 | Busca Cardex por SKU hifenizado: plano `sku_ids`, query < 8s, rejeita OR(ilike+id) | Performance SaaS · cardex-filters | `coberto` `fase-6` `script` |
| SCR-EST-LOTE-01 | SKU `controla_lote`: entrada/saída com `lote_produto_id`; SKU sem flag grão NULL | lote/validade kernel | `coberto` `fase-6` `script` |
| SCR-EST-LOTE-02 | Dois lotes FEFO + remessa preserva `lote_produto_id` no poder | lote/validade | `coberto` `fase-6` `script` |
| SCR-EST-SERIE-01 | Placeholder `controla_serie` (skip até kernel série) | série unitária futura | `planejado` `fase-6` `script` (skip) |
| UI-EST-LOTE-01 | Config FEFO + saldos validade + relatório `validade-lotes` | lote/validade | `coberto` `fase-6` `ui` |
| UI-EST-LOTE-02 | Smoke rotas com LotePicker (retirada/ajuste/transf/remessa) | lote/validade | `coberto` `fase-6` `ui` |
| UI-EST-SERIE-01 | Reservado UI série unitária | série futura | `planejado` `fase-6` `ui` (skip) |

#### 4.4.7 Manual / smoke de volume (não bloqueiam verde da suíte até estabilizar)

| ID | O que valida | Ref. | Status |
|----|--------------|------|--------|
| MAN-EST-NFE-AGENT | Agente on-prem lê pasta UNC e envia XML (não roda na VPS) | §2 · §6 | `manual` |
| MAN-EST-SMOKE-MS | Paginação/cálculo/perf nos 11 slugs + BI (Monte Sinai scale) | [smoke-relatorios-monte-sinai-dev.md](../testes/smoke-relatorios-monte-sinai-dev.md) | `manual` `fase-6` |
| MAN-EST-UAT | Piloto Atlas: 2 admins + amostra departamental | F5 · §15 | `manual` |

---

## 5. Cronograma de incremento (schedule)

| Fase | Quando (orientação) | Entrega | Comando alvo |
|------|---------------------|---------|--------------|
| **0 — Fundação** | Agora (1–2 dias) | Pasta `e2e/`, Playwright Test, login helper, relatório MD+JSON, `data-testid` mínimos no hub/omni/chat | `npm run test:e2e:core` (só UI) |
| **1 — Núcleo verde** | Em seguida (~1 semana) | Todos os IDs `fase-1` (UI + SCR-INFRA/AUTH) + relatório unificado | `npm run test:agent:dev` |
| **2 — Card + chat + funil scripts** | +1–2 semanas | UI-OMNI-03/04, UI-CARD-06/07, UI-CHAT-02, SCR-FUNIL, SCR-CHAT, SCR-EMP | mesma suíte, mais casos |
| **3 — Segurança e leads** | +2 semanas | RBAC UI, tenant, menções, leads, canais, multi-sessão, drag card | — |
| **4 — IA / WhatsApp / RAG** | Após núcleo estável | Scripts 7–10; WhatsApp sem QR; simulador | `npm run test:agent:scripts:phase4` |
| **5 — Prod smoke + BI** | Quando fase 1–2 confiáveis | Mesma bateria apontando prod (tenant teste) + analytics/BI | `npm run test:agent:prod-smoke` |
| **6 — Estoque MVP** | Após Fases 1–5 verdes; módulo já em DEV | UI smoke hub/consultas + scripts SCR-EST-* §4.4 | `npm run test:agent:scripts:phase6` · incluso em `test:agent:scripts` / `test:agent:dev` |

**Regra de ouro:** só avança de fase se a anterior estiver **verde 3 runs seguidos** em dev.

---

## 6. Ordem do dia a dia (dev)

1. Subir app: `npm run dev:turbo`
2. Rodar agente: `npm run test:agent:dev` (ou `/cockpit/testes` → Fases 1–5)
3. Ler o **HTML** em `docs/homologacao/execucoes/agente-latest.html`
4. Se vermelho → corrige → roda de novo
5. Só então merge / preparação de deploy
6. Fase 6: `npm run test:agent:scripts:phase6` (ou a suíte completa já inclui) + UI Estoque no mesmo relatório E2E

---

## 7. Relação com o que já existe

| Já temos | Papel no agente |
|----------|-----------------|
| `docs/homologacao/plano-homologacao-versao.md` | Checklist humano + mapa dos blocos |
| `docs/homologacao/agente-testes-plano.md` §4.4 | Inventário Estoque (Fase 6) — espelha aceite §16 da spec |
| `docs/specs-aplicadas/desenvolvimento-modulo-estoque.md` | Spec + critérios de aceite do módulo Estoque |
| `docs/MIGRACAO-SUPABASE.md` | Pacotes SQL Estoque/Cadastros ⏳ PROD |
| `docs/testes/smoke-relatorios-monte-sinai-dev.md` | Smoke manual de volume/paginação (relatórios) |
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

**Próximo:** manter a suíte Fases 1–6 verde (3 runs); completar UI mutável Estoque ainda `planejado`.

---

## 11. Fase 2 — status

| Item | Status |
|------|--------|
| UI `UI-NAV-02`, `UI-OMNI-03/04`, `UI-CARD-06/07`, `UI-CHAT-02` | ✅ implementado |
| Seletores estáveis para contexto, encaminhar, anexos e thread de card | ✅ |
| Scripts `SCR-EMP-01`, `SCR-FUNIL-01`, `SCR-CHAT-01` | ✅ implementado |
| Cleanup de funil/card/anexo/chat filtrado por `empresa_id` | ✅ |
| Runner e relatório unificados Fases 1–2 | ✅ |
| Três execuções DEV verdes consecutivas | ✅ 26/26 em cada run |

Os scripts mutáveis exigem `TEST_ALLOW_MUTATIONS=1`, credenciais explícitas
`TEST_EMAIL`/`TEST_PASSWORD` e chave de service role para cleanup. É obrigatório
fixar `TEST_TENANT_ID`; se a credencial pertencer a outro tenant, o preflight aborta antes
de qualquer escrita.

---

## 12. Fase 3 — status

| Item | Status |
|------|--------|
| UI menções, RBAC, tenant, multi-sessão e drag de card | ✅ implementado |
| Scripts `SCR-LEAD-01`, `SCR-CANAL-01`, `SCR-RBAC-01` | ✅ implementado |
| Endpoint inbound valida canal → tenant → funil → etapa e faz rollback | ✅ |
| Migration `202609071530_phase3_permission_rls.sql` | ✅ aplicada em DEV via MCP |
| Runner e catálogo Fases 1–3 | ✅ |
| Três execuções DEV verdes consecutivas | ✅ 34/34 em cada run |

Runs verdes finais: `905b7593-5922-4905-a895-b9ac3806f9c4`,
`591b085c-8662-4e3d-af1c-237f007209a0` e
`80ebda2b-784c-4cb0-ac08-2435bf6a82d9`.

---

## 13. Fase 4 — status

| Item | Status |
|------|--------|
| Scripts `SCR-RAG-01`, `SCR-SIM-01`, `SCR-WA-01`, `SCR-DASH-01` | ✅ implementados |
| RAG determinístico com vetor 3072, storage, busca semântica e cleanup | ✅ |
| Simulador fora de escopo pela UI, com sessão e reasoning auditável | ✅ |
| Webhook Evolution sintético com IA desligada e sem envio externo | ✅ |
| Dashboard por deltas de cards, vendas, chats e gargalo | ✅ |
| UI `UI-DASH-01` e seletores estáveis | ✅ implementados |
| Migration `202609071900_phase4_knowledge_rbac.sql` | ✅ aplicada em DEV via MCP |
| Runner, catálogo e módulo Fases 1–4 | ✅ |
| Três execuções DEV verdes consecutivas | ✅ 39/39 em cada run |

QR escaneado (`SCR-WA-QR`) e áudio WhatsApp real (`SCR-WA-AUDIO`) continuam
manuais. A bateria obrigatória não cria instância Evolution, não envia mensagens
externas e não realiza chamadas pagas de IA.

Runs verdes finais: `5e6bc7c2-b927-4e77-9694-256d8757af2f`,
`0888e776-79ae-4d5c-a3d6-018af0b17725` e
`6059c3f7-9268-46ec-b9f5-6b02c86c8e29`.

---

## 14. Fase 5 — status

| Item | Status |
|------|--------|
| Tela `/cockpit/relatorios` com KPIs, série, heatmap e filtro de departamento | ✅ implementada |
| UI `UI-BI-01`, `UI-FIN-01`, `UI-OMNI-DEPT`, `UI-BIFROST-01` e `UI-BIFROST-02` | ✅ implementadas |
| Script `SCR-ANALYTICS-01` com fixture determinística e cleanup exato | ✅ implementado |
| `test_runs.organization_id` e filtros tenant no runner/API/UI | ✅ migration aplicada em DEV |
| Helpers analytics internos sem EXECUTE público/anon/authenticated | ✅ migration aplicada em DEV |
| Filtros de departamento consistentes nas mensagens/KPIs/série/heatmap | ✅ |
| Operador lê somente a própria associação `usuarios_departamentos` | ✅ migration aplicada em DEV |
| RPCs analytics exigem `relatorios.view` na mesma matriz da UI | ✅ migration aplicada em DEV |
| Smoke de produção separado, read-only e protegido por opt-ins | ✅ preparado; não executado |
| Três execuções DEV verdes consecutivas | ✅ 43/43 em cada run |

### Matriz de isolamento revisada

- Toda operação em tabela que possui tenant usa `empresa_id`, `organization_id`
  ou `org_id` explicitamente. `pipeline_stages` permanece isolada pelo `pipeline_id`
  previamente validado no tenant, pois não possui coluna própria de empresa.
- `TEST_TENANT_ID` é obrigatório em scripts e E2E; credenciais padrão foram removidas.
- Tenants negativos são criados de forma efêmera; nenhum teste escolhe uma empresa real
  arbitrária com `neq(...).limit(1)`.
- Isolamento por departamento pertence somente ao Chat Omnichannel. Funis, leads,
  cards, chat interno, RAG, dashboard, BI e Financeiro não receberam ACL departamental global.
- Em Omni, `UI-OMNI-DEPT` comprova que admin do tenant vê as duas sessões e cada
  operador vê apenas a sessão associada ao próprio departamento.

O smoke de produção exige `TEST_TARGET_ENV=prod`, `TEST_PROD_SMOKE=1`,
`TEST_PROD_SUPABASE_REF`, HTTPS e credencial canário. Ele aborta na presença de
service role ou `TEST_ALLOW_MUTATIONS=1` e não executa qualquer escrita.

Runs verdes finais: `276e926f-0ad8-47fb-a58f-68a9ecbdfc90`,
`e8e0a19a-4339-44e9-83f3-57b0e0f61f66` e
`fb69121e-6ae5-486c-9927-266a269f7a00`.

---

## 15. Fase 6 — Estoque

| Item | Status |
|------|--------|
| Inventário §4.4 (UI + SCR + manual) alinhado à spec e ao aceite §16 | ✅ documentado |
| Spec / histórico DEV (F4.1–F4.4 + remessa + aprovação + relatórios RPC) | ✅ em DEV · PROD ⏳ |
| Specs Playwright `e2e/core/estoque.spec.ts` (ADDON/NAV/LOC/CFG/SAL/CAR-01+02/REL) | ✅ smoke + busca Cardex |
| Scripts `scripts/agent/phase6-scripts.mjs` (… + SCR-EST-CAR-01) | ✅ coberto |
| Unit `src/lib/estoque/cardex-filters.test.mjs` (estratégia busca / anti-timeout) | ✅ `npm run test:unit:estoque` |
| Catálogo `UI-EST-*` / `SCR-EST-*` em `src/lib/testes/catalog.ts` | ✅ entradas adicionadas |
| Fixture XML/planilha já em `docs/testes/` (NFe + modelo req) | ✅ reutilizar |
| UI mutável entradas/retiradas/remessa/req (UI-EST-ENT/RET/TRF/AJU/REM/REQ) | `planejado` |
| Smoke volume Monte Sinai (paginação/cálculo) | `manual` — doc dedicado |
| Incluir Fase 6 em `test:agent:dev` / suite `/cockpit/testes` | ✅ scripts no runner · UI via `e2e/core` |
| Três execuções DEV verdes consecutivas | ⏳ |

### Ordem sugerida de implementação (automação)

1. ~~**Foundation:** `UI-EST-ADDON-01`, `UI-EST-NAV-01`, `UI-EST-LOC-01`, `UI-EST-CFG-01` + `SCR-EST-TENANT-01` / `SCR-EST-GOLD-01`.~~ ✅
2. ~~**Movimentações SCR:** entrada / saldo / transferência / remessa envio.~~ ✅ · UI mutável ainda planejada
3. **Requisições UI:** criar → aprovar → atender (modos de saldo).
4. ~~**Consultas:** saldos, cardex, `SCR-EST-RPC-01` + amostra de `UI-EST-REL-01`.~~ ✅ smoke
5. ~~**RBAC:** `SCR-EST-RBAC-01` + smoke de menu oculto.~~ ✅
6. Exigir 3 verdes consecutivos da bateria Fase 6 antes de tratar como homologável.

### Critério de “Estoque pronto para homolog/piloto”

- [ ] Todos os IDs `fase-6` marcados `coberto` (exceto `manual`)
- [ ] Zero divergência Cardex×Saldo nos runs mutáveis
- [ ] Isolamento tenant comprovado (`SCR-EST-TENANT-01`)
- [ ] Checklist pré-prod Estoque em [MIGRACAO-SUPABASE.md](../MIGRACAO-SUPABASE.md) preenchível
- [ ] Cutover PROD **somente** com pedido explícito (regra `develop` ≠ `main`)
