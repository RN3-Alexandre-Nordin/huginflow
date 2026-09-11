# Roadmap — Hugin como plataforma (entitlements)

Fonte: prompt `07-prompt-hugin-plataforma`  
Checkpoint de restauração: `checkpoint/pre-core-2026-09-11`  
Como acompanhar: marque `- [x]` nas subtarefas concluídas (no Cursor: clique na caixa).

**Progresso geral**

- [x] Sessão 1 — Contrato + schema (W0 + W1) — PR-A *(W0+W1 DEV ✅ 2026-09-11; commit/push pendente)*
- [x] Sessão 2 — Motor entitlements (W2) — PR-B *(lib ✅ 2026-09-11; commit/push pendente)*
- [x] Sessão 3 — Persistência + UI empresa (W3 + W4) — PR-C *(DEV ✅ 2026-09-11; commit/push pendente)*
- [x] Sessão 4 — Nav + guards + home (W5) — PR-D *(código ✅ 2026-09-11; testes + commit depois)*
- [x] Sessão 5 — API + testes + deploy (W6 + W7) — PR-E + PR-F *(API+E2E escritos; rodar testes antes do commit; prod depois)*
- [x] Sessão 6 — Cadastro de addons / catálogo comercial (W8) — PR-G *(UI ✅; testes + commit depois)*
- [ ] Sessão 7 — Ponte faturamento SaaS RN3 (entitlement ↔ contratos) (W9) — PR-H *(depois do core)*

---

## Visão

Hugin evolui para **plataforma**. Addons ligam/desligam **por empresa**. Workflow deixa de ser obrigatório.  
`empresa_id` canônico = `public.empresas.id`.  
Só **superadmin RN3** cadastra o catálogo, liga entitlements e, no futuro, gera/atualiza faturamento a partir disso.

### Decisão crítica: dois “Financeiros” + onde fica o billing RN3

**Billing SaaS da RN3 permanece no Hugin** (capacidade de plataforma `rn3Only`).  
Não vai para o Bifrost. Não vira sistema à parte nesta fase. Entitlements **nunca** saem do Hugin.

O prompt original misturava **faturamento SaaS da RN3** com um futuro **addon Financeiro do cliente**. Isso gera colisão de nome, menu, tabelas e entitlement. **Separar desde a Sessão 1.**

| | **Billing RN3 (plataforma)** | **Addon Financeiro (produto futuro)** |
|--|------------------------------|----------------------------------------|
| Para quem | RN3 cobra os **clientes da plataforma** | Cliente gerencia o **financeiro da empresa dele** |
| Exemplos | Contrato Hugin, mensalidade Omni/Workflow, AR da RN3 | Contas a pagar/receber do cliente, fluxo de caixa próprio |
| Quem acessa | Só RN3 (`rn3Only` + superadmin) | Usuários da empresa **se** o addon estiver ligado |
| Código no catálogo | **Não é addon vendável** (ou código interno `billing_rn3` se precisar registrar) | `finops` ou `financeiro_cliente` — **nunca** reutilizar o menu RN3 |
| Tabelas | As atuais `finance_*` / `finance_contratos` = **SaaS billing** | Schema **novo** no futuro (`finops_*` ou serviço isolado) — **proibido** misturar com `finance_*` de hoje |
| Menu hoje | `/cockpit/financeiro`, `/cockpit/financeiro/contratos` | Não existe ainda |
| Gate | `rn3Only` (plataforma), **sem** `empresaHasAddon('financeiro')` | `empresaHasAddon('finops')` + RBAC |

**O que certar agora (checklist anti-dívida):**

- [x] **Nome:** no seed **não** criar addon `financeiro` ligado ao menu RN3. Reservar slug futuro `finops` **desligado** e sem páginas. *(decidido W0)*
- [x] **Menu RN3:** itens Financeiro/Contratos ficam só `rn3Only` / plataforma — **sem** `addon: 'financeiro'`. *(decidido W0)*
- [x] **Billing RN3 no Hugin:** não Bifrost; não sistema separado nesta fase. *(decidido W0)*
- [x] **Comentário no código/nav:** “Billing SaaS RN3 ≠ addon FinOps do cliente”. *(Sessão 4)*
- [x] **Tabelas `finance_*`:** documentar como domínio **SaaS billing**; FinOps futuro usa prefixo diferente. *(docs W0)*
- [x] **Sessão 7:** sincroniza `empresa_addons` → `finance_contratos` (RN3 cobra o cliente) — **não** abre o módulo ao tenant.
- [x] **API v1:** não expor rotas de billing RN3 como se fossem o addon do cliente.
- [x] **Foundation:** cobrança de plataforma (se houver) = linha `included` no billing RN3, não “Financeiro” do cliente.

**Se não travarmos isso:** amanhã ligar `financeiro` para a NASU mostraria os **contratos que a RN3 usa para cobrar a NASU**, ou pior — misturaria AR da RN3 com AR do cliente no mesmo RLS/`empresa_id`.

### Análise: o plano cobre faturamento?

**Veredito:** cobre a **base comercial necessária** (cadastro de produtos/addons + vínculo por cliente), mas **ainda não implementa** a geração de boletos/AR. Isso é intencional: primeiro produto + entitlement; depois ponte com `finance_contratos` (já existe no Hugin).

| Necessidade de faturamento | Coberto? | Onde |
|----------------------------|----------|------|
| Cadastro do que a RN3 vende (SKU/addon) | Sim | Sessão 6 + campos comerciais desde W1 |
| Saber o que cada cliente contratou/ligou | Sim | `empresa_addons` (Sessões 1–3) |
| Preço de lista / modelo de cobrança no catálogo | Sim (schema + UI Sessão 6) | `billable`, `billing_model`, `list_price_*` |
| Plano / preço negociado por empresa | Parcial → completo na Sessão 3/6 | `plano`, `price_override`, `quantity` |
| Vigência comercial (início/fim, trial) | Sim (schema desde W1; UI leve na 3/6) | `starts_at`, `ends_at`, `commercial_status` |
| Separar “pode usar” de “paga” | Sim (regra de domínio) | `enabled` ≠ `billable` / `commercial_status` |
| Gerar mensalidade / AR / OS automaticamente | **Não nesta entrega** | Sessão 7 → `finance_contratos` + extras |
| Nota fiscal / gateway de pagamento | Fora | Futuro pós-Sessão 7 |

**Por que o cadastro de addons é obrigatório também para o financeiro (não só técnico):**

1. Faturamento precisa de **catálogo de produtos** estável (`codigo` = SKU interno).
2. Contrato comercial precisa saber **quais linhas** cobrar (Workflow, Omni, Estoque…).
3. Hoje `finance_contratos` tem mensalidade “pacote” + `servicos_extra` genéricos — **sem vínculo** a addon. Sem registry, cada cliente vira customização.
4. Ligar um addon na ficha **sem** cadastro comercial impede relatório “MRR por produto” e upsell controlado.

**Regra de ouro comercial (não negociável):**

- `enabled = true` → cliente **acessa** o módulo (entitlement técnico).
- `commercial_status` / `billable` → cliente **entra na conta** (ou não: piloto, cortesia, RN3 interno).
- Nunca misturar: piloto pode ter Omni ligado e `commercial_status = trial|courtesy` sem gerar AR.

### Três níveis (não misturar)

| Nível | O quê | Quem | Onde |
|-------|-------|------|------|
| **1. Catálogo** (`addon_registry`) | Produtos/addons que a plataforma oferece (e pode vender) | Superadmin RN3 | Sessão 6 |
| **2. Entitlement** (`empresa_addons`) | O que aquela empresa pode usar (+ dados comerciais por linha) | Superadmin RN3 | Ficha da empresa (Sessão 3) |
| **3. Faturamento** (`finance_contratos` + vínculo) | O que gera cobrança / AR | Superadmin RN3 | Sessão 7 (ponte) |

### Fora de escopo desta entrega (ainda)

- Implementar geração automática de AR na Sessão 1–6 (só preparar schema/contrato)
- Estoque / CRM comercial / parceiros / SKU de negócio do cliente
- Extrair funil ou omni para outro deploy
- SSO / module federation / Redis
- Segundo cadastro mestre de empresas
- NF-e / gateway de pagamento

---

## Sessão 1 — Contrato + schema (W0 + W1) · PR-A

**Critério de saída:** mapa aprovado + migration em DEV; schema já serve entitlement **e** base comercial futura.

### W0 — Contrato e escopo

- [x] Confirmar checkpoint git `checkpoint/pre-core-2026-09-11` acessível no remoto
- [x] Documentar decisões: [plataforma-entitlements-decisoes.md](./plataforma-entitlements-decisoes.md)
- [x] Inventariar `cockpit-nav.ts` → addon: [plataforma-entitlements-inventario-w0.md](./plataforma-entitlements-inventario-w0.md)
- [x] Listar `page.tsx` que receberão guard (mesmo inventário)
- [x] Confirmar defaults técnicos de backfill: `cadastros`/`workflow`/`omni` = on
- [x] Seed **sem** addon `financeiro`; reservar `finops` off / billable / sem rotas
- [x] Defaults comerciais: billable workflow/omni/estoque/crm/finops; cadastros `included`
- [x] Documentar: `finance_*` = billing SaaS RN3; FinOps ≠ essas tabelas
- [x] Registrar migration futura em `docs/supabase-prod-deploy-pending.md`

**W0 concluído em 11/09/2026.**

### W1 — Schema + backfill (técnico + comercial)

Arquivo: `supabase/migrations/202609111200_plataforma_addon_entitlements.sql`  
DEV: **aplicado** 2026-09-11 (5 empresas × 6 addons = 30 linhas; NASU workflow/omni/cadastros on; sem slug `financeiro`).

**`addon_registry` (catálogo / produto vendável)**

- [x] `codigo` text PK (SKU interno estável)
- [x] `nome`, `descricao`
- [x] `tipo` (`foundation` \| `addon`)
- [x] `sort_order`, `ativo`
- [x] `default_enabled` — default técnico ao criar empresa
- [x] `rn3_only` boolean
- [x] `billable` boolean NOT NULL DEFAULT true — entra em faturamento?
- [x] `billing_model` text NOT NULL DEFAULT `'flat'` — `flat` \| `per_seat` \| `usage` \| `included`
- [x] `list_price_cents` int NULL — preço de lista (centavos); null = sob consulta
- [x] `currency` text NOT NULL DEFAULT `'BRL'`
- [x] `sku_externo` text NULL — código para NF/ERP futuro
- [x] `config_schema` jsonb DEFAULT `{}`
- [x] `created_at` / `updated_at` / `updated_by`

**`empresa_addons` (entitlement + linha comercial por cliente)**

- [x] PK (`empresa_id`, `addon_codigo`) FK → registry
- [x] `enabled` boolean — acesso técnico
- [x] `plano` text NULL — nome do plano comercial (starter/pro/…)
- [x] `commercial_status` text NOT NULL DEFAULT `'active'` — `active` \| `trial` \| `courtesy` \| `suspended` \| `ended`
- [x] `quantity` int NOT NULL DEFAULT 1 — seats/unidades quando `per_seat`
- [x] `price_override_cents` int NULL — preço negociado; null = usa list_price
- [x] `starts_at` / `ends_at` timestamptz NULL — vigência da linha
- [x] `config_json` jsonb DEFAULT `{}`
- [x] `updated_at` / `updated_by`
- [x] Seed códigos iniciais: `cadastros`, `workflow`, `omni`, `estoque`, `crm`, `finops` (reservado)
- [x] **Não** seedar `financeiro` como alias do menu RN3
- [x] Seed com `default_enabled` alinhado ao backfill (`cadastros`/`workflow`/`omni` true; `finops` false)
- [x] RLS entitlement: SELECT próprio tenant; escrita só service role
- [x] Registry: leitura ok; escrita só service role
- [x] Aplicar em DEV + validar NASU/RN3
- [ ] Commit PR-A em `develop` + push

**Aceite Sessão 1**

- [x] Nenhuma empresa perdeu funil/omni
- [x] Schema comporta cadastro + cobrança futura sem nova tabela mestre
- [x] Nenhuma UI nesta sessão
- [ ] Commit/push da migration + docs

---

## Sessão 2 — Motor entitlements (W2) · PR-B

**Critério de saída:** helpers técnicos únicos; catálogo do banco; hooks comerciais sem gerar fatura ainda.

### W2 — Lib

- [x] `src/lib/addons/entitlements.ts`
- [x] `codigo: string` validado no registry
- [x] `listAddonRegistry({ onlyActive?, onlyBillable? })`
- [x] `isFoundationAddon` / foundation sempre accessible
- [x] `getEmpresaAddons` / `empresaHasAddon` / `assertEmpresaAddon` (eixo técnico)
- [x] `getEmpresaAddonLines(empresaId)` — linhas com plano/status/preço (para UI e futura fatura)
- [x] `defaultsFromRegistry()` para createEmpresa
- [x] Dois eixos: entitlement **e** RBAC; documentar terceiro eixo (comercial) como leitura
- [x] Superadmin não bloqueado no menu; dados com `empresa_id` *(regra no header do módulo; UI na Sessão 4)*
- [x] Smoke DEV: registry dinâmico + NASU workflow/cadastros on, finops off
- [ ] Commit PR-B

**Aceite Sessão 2**

- [x] Defaults pós-backfill OK
- [x] `cadastros` nunca false no acesso
- [x] Helper comercial retorna linhas sem exigir finance_contratos

---

## Sessão 3 — Persistência + UI empresa (W3 + W4) · PR-C

**Critério de saída:** superadmin liga acesso **e** registra dados comerciais mínimos por linha.

### W3 — Server actions

- [x] `createEmpresa` → `ensureEmpresaAddonRows` / `defaultsFromRegistry()`
- [x] `updateEmpresaAddons` upsert só superadmin (ação dedicada; não misturar com `updateEmpresa` cadastral)
- [x] Payload dinâmico: enabled + plano + commercial_status + quantity + price_override + vigência
- [x] Ignorar / rejeitar se não for superadmin
- [x] `updated_by` / `updated_at`
- [x] POST forjado admin/operador não altera (smoke: role gate na action)

### W4 — UI ficha da empresa

- [x] Seção Addons dinâmica via registry/lines (`EmpresaAddonsSection`)
- [x] Toggle `enabled` (acesso)
- [x] Campos comerciais por linha (colapsáveis): plano, status, quantidade, preço negociado, início/fim
- [x] Indicar se addon é `billable` (badge) — sem calcular fatura ainda
- [x] Foundation sem toggle de cobrança (`included` / enabled fixo)
- [x] Helper text: “Ligar ≠ faturar automaticamente (faturamento na Sessão 7)”
- [x] Não-superadmin: sem edição
- [x] Não quebrar CNPJ/IA/contrato/StatusToggle (seção separada acima do EditForm)
- [ ] (Opcional) chips na lista de empresas
- [ ] Commit PR-C

**Aceite Sessão 3**

- [x] Flags técnicos persistem
- [x] Linha comercial mínima persiste (plano/status)
- [x] Addon novo no registry aparece na ficha sem alterar React (`ensureEmpresaAddonRows` no load)

---

## Sessão 4 — Nav + guards + home (W5) · PR-D

**Critério de saída:** menu/URL respeitam **enabled** (não o status comercial).

### W5

- [x] Nav com `addon?: string` / `addonsAny` + filter
- [x] Guards das páginas (funis, omni, leads, etc.)
- [x] Financeiro/Contratos RN3: gate **só** `rn3Only` — **nunca** `empresaHasAddon('finops')` nem `addon: 'financeiro'`
- [x] Comentário no `cockpit-nav.ts`: billing SaaS RN3 ≠ addon FinOps
- [x] Home empty state se workflow+omni off
- [x] Documentar: `commercial_status=suspended` **pode** no futuro cortar acesso — nesta entrega o gate é só `enabled` *(header require-addon + nav)*
- [ ] Commit PR-D *(após testes)*

**Aceite Sessão 4**

- [ ] Cenários workflow/omni off *(teste pendente)*
- [ ] Superadmin vê billing RN3; tenant **não** vê `/cockpit/financeiro` mesmo com `finops` reservado no catálogo
- [ ] Superadmin menu completo

---

## Sessão 5 — API + testes + deploy (W6 + W7) · PR-E + PR-F

### W6 — API interna

- [x] `GET /api/v1/empresas/:id`
- [x] `GET /api/v1/empresas/:id/addons` (enabled + commercial_status + plano; preços só com `include_prices=1`)
- [x] `GET /api/v1/addons` (catálogo; `include_prices=1` para RN3)
- [x] Bearer `HUGIN_ADDONS_INTERNAL_SECRET`
- [x] Bifrost `tenant = empresas.id` intacto (`tenant_id` no JSON)
- [ ] Commit PR-E *(após testes)*

### W7 — Testes / docs / deploy

- [x] E2E entitlements + isolamento (`e2e/core/entitlements.spec.ts`) — **ainda não executado**
- [ ] Smoke ficha dinâmica *(manual)*
- [x] Docs: catálogo vs entitlement vs faturamento (seção API em decisoes.md; Sessão 7 permanece depois)
- [ ] Migration PROD + smokes
- [ ] Tag checkpoint pós-entitlements
- [ ] Commit PR-F *(após testes verdes)*

**Aceite final (1–5)**

- [ ] Checklist técnico do prompt
- [ ] Campos comerciais existem e persistem (mesmo sem gerar AR)

---

## Sessão 6 — Cadastro de addons / catálogo comercial (W8) · PR-G

**Critério de saída:** RN3 mantém o **cardápio de produtos** (técnico + comercial) sem migration.

### W8 — Tela `/cockpit/addons` (superadmin RN3)

- [x] Menu Administração → Addons (`rn3Only`)
- [x] CRUD: codigo, nome, descricao, tipo, ativo, sort_order
- [x] Campos comerciais: billable, billing_model, list_price, currency, sku_externo, default_enabled, rn3_only
- [x] Não apagar foundation; desativar com `ativo=false` (foundation bloqueado de desativar)
- [x] Ao criar: backfill opcional de `empresa_addons` com `default_enabled`
- [x] Auditoria updated_by/at
- [x] Bloquear não-superadmin
- [ ] Commit PR-G *(após testes)*

### W8 — Aceite comercial do catálogo

- [ ] Dá para cadastrar “Estoque” com preço de lista sem ter o app *(smoke manual)*
- [ ] Dá para marcar `cadastros` como `billable=false` / `billing_model=included`
- [ ] Ficha da empresa reflete o novo item automaticamente
- [ ] Commit PR-G

---

## Sessão 7 — Ponte faturamento SaaS RN3 (W9) · PR-H *(após core estável)*

**Critério de saída:** a partir das linhas `empresa_addons` billable, RN3 gera/atualiza **contrato SaaS** (`finance_contratos`) — cobrança da plataforma ao cliente.  
**Não** entrega o addon FinOps. Não abre `/cockpit/financeiro` para o tenant.

### W9 — Contrato de dados (billing RN3)

- [ ] Decidir modelo: 1 contrato SaaS por empresa **ou** 1 contrato com N linhas de addon
- [ ] Ligar extras/`finance_contrato_addons` a `addon_codigo` do **catálogo**
- [ ] Mapear: list_price / price_override / quantity → valor da linha
- [ ] Filtrar só `billable=true` e status comercial aprovado pela RN3
- [ ] Foundation `included` não vira linha cobrável
- [ ] Explicitar no doc: estas linhas alimentam AR **da RN3**, não o ledger do cliente

### W9 — UX Billing RN3

- [ ] Ação “Sincronizar addons → contrato SaaS” (ficha ou contrato)
- [ ] Preview das linhas antes de gravar
- [ ] Não sobrescrever serviços manuais sem confirmação
- [ ] Reusar `sp_finance_gerar_contas_do_contrato` para AR RN3
- [ ] Garantir que sync **não** depende nem habilita addon `finops`

### W9 — Fora / depois (addon FinOps do cliente)

- [ ] App FinOps em schema/serviço separado (`finops_*`), entitlement `finops`
- [ ] Menu e rotas novas — **não** reutilizar `/cockpit/financeiro` atual
- [ ] Reajuste automático de mensalidade SaaS (opcional)
- [ ] NF-e / gateway
- [ ] Commit PR-H quando for prioridade de receita

**Aceite Sessão 7**

- [ ] Empresa com Omni+Workflow billable gera linhas no **contrato SaaS RN3**
- [ ] Cortesia/trial não entra no AR (ou valor 0, conforme regra)
- [ ] Tenant continua sem acesso ao billing RN3

---

## Mapa menu → addon (módulos core)

| Item | Addon |
|------|-------|
| Cockpit home | plataforma |
| Pessoas (rota `/crm/leads`) | `workflow \|\| omni` (mestre compartilhado; menu Cadastros) |
| Chat Omnichannel | `omni` |
| Relatórios | plataforma / `workflow` |
| Empresas | plataforma |
| Financeiro / Contratos (**billing RN3**) | plataforma / `rn3Only` — **sem** addon |
| FinOps do cliente (futuro) | `finops` — rotas novas, não as atuais |
| Módulo de Testes | `rn3Only` |
| Simulador / Conhecimento / Canais | `omni` |
| Departamentos / Usuários / Grupos | plataforma |
| Funis | `workflow` |
| Addons (catálogo) | plataforma / `rn3Only` (Sessão 6) |

---

## Como usar este arquivo

1. Sessões **1→5** = plataforma + entitlement (entrega do prompt).
2. Sessão **6** = cadastro de addons (obrigatório para produto **e** para faturar depois).
3. Sessão **7** = ponte **billing SaaS RN3** (cobrar o cliente por linha de addon).
4. Addon **FinOps** do cliente = futuro (`finops` + schema próprio); não misturar com `/cockpit/financeiro`.
5. Marque `[x]` nas subtarefas; feche a sessão no topo só com o Aceite completo.
6. Rollback: `checkpoint/pre-core-2026-09-11`.

**Próximo:** bateria de testes (E2E entitlements + smoke Addons/ficha). **Sem commit até verde.**
