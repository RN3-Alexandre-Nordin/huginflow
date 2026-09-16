# Plano de Cutover para Produção — Release Setembro 2026 (v0.3.0)

> **Documento Vivo de Subida para Produção**  
> **Data de Compilação:** 13 de Setembro de 2026 (atualizado 16/09 — migrations 17–**27**)  
> **Ambiente Origem (DEV):** `vujqukqsfwmoezwyuoum` ([huginflow-dev](https://supabase.com/dashboard/project/vujqukqsfwmoezwyuoum))  
> **Ambiente Destino (PROD):** `zmypzexefjbovuknjlid` ([huginflow-prod](https://supabase.com/dashboard/project/zmypzexefjbovuknjlid))  
> **Branch de Trabalho:** `develop` | **Branch de Produção:** `main`  
> **VPS Produção:** Docker Swarm em `vps.rn3.tec.br` / Portainer / Traefik  
> **Status do código (16/09):** SQL homologado em DEV até `202609161910_crm_thread_sla_writers` · **PROD: aguardando pedido explícito**

---

## 1. Diretriz de Governança e Regra Suprema

> **LEI ABSOLUTA (`develop` ≠ `main`):**  
> Nenhum `push`, `merge` ou `commit` deve ser feito na branch `main` sem autorização explícita do responsável.  
> Qualquer alteração no banco de produção (Supabase Prod) via SQL/MCP só pode ser executada mediante **pedido explícito**.

---

## 2. Resumo Executivo das Entregas (11/09 a 13/09/2026)

Este cutover consolida **grandes ondas** de evolução do sistema desenvolvidas e homologadas no ambiente de DEV:

1. **Plataforma & Entitlements (Addons):**
   - Sistema dinâmico de catálogo e licenciamento de módulos por organização (`addon_registry` + `empresa_addons`).
   - Proteção de rotas, componentes e APIs via verificação de entitlement ativo.
2. **Cadastros Mestres Unificados:**
   - **Pessoas:** Mestre de contatos multi-papel (Clientes, Fornecedores, Transportadoras, Terceiros, Funcionários e Parceiros) com dados fiscais e bancários.
   - **SKUs (Materiais / Serviços):** Cadastro mestre de itens, conversões de unidade de medida (genéricas e por produto), de-para de códigos externos de fornecedores/clientes e tributação alinhada à Reforma Tributária (IBS, CBS, IS, NBS).
   - **Ativos / Patrimônio:** Gestão patrimonial com vínculo obrigatório de Centro de Custo a Departamentos e stub de fórmulas de depreciação.
3. **Módulo Completo de Estoque (Fase 4.1 + remessas avançadas):**
   - **15+ tabelas especializadas** e policies RLS tenant-isolated.
   - **Regra de Ouro:** Cardex + saldo na mesma transação via RPC `est_registrar_movimento_atomico` (inclui fix de decremento sem INSERT negativo).
   - **Operações:** Locais (BRANCO), entradas (manual / planilha / NF-e XML), retiradas, **transferências em lote multi-SKU**, ajustes, **remessas a terceiros** e requisições.
   - **Remessas (13/09):** local de saída **por linha**; observação no **lote**; nº `REM-…`; tela de **retorno/liquidação** com SKU de volta (ex.: industrialização), **baixa definitiva** do que não retorna (consignação) e fechamento do lote quando `retornada + baixada ≥ enviada`.
   - **29 permissões granulares RBAC** na categoria "Estoque".
   - **Aprovação interna (15/09):** parâmetros em `est_config` + fila `/requisicoes/aprovacao` (aprovador configurado, sem toggle RBAC).
   - **Home Estoque (16/09):** template pronto `operador_estoque` via `grupos_acesso.cockpit_template` (PME, sem builder de KPI).
   - **Planilha de requisição (16/09):** formato canônico + adapters cobráveis (ex.: ATC via addon `estoque_req_adapter_atc`); `crm_leads.codigo_externo`; rastreio `codigo_origem`/`sistema_origem`/`requisitante_nome_origem`; param `req_planilha_auto_atender` (apenas receber vs receber+baixar com atendimento parcial).
   - **Relatórios de Estoque (16/09):** hub `/cockpit/estoque/relatorios` — 11 KPIs (valor, críticos, fill-rate, DOH/giro, sem movimento, excesso, terceiros, remessa, lead-time, ajustes) via RPC `est_rpc_relatorio` (agregação/paginação no Postgres; Excel/PDF da página). Cutover **25**.
4. **Remodelação de Empresas & Contato Financeiro:**
   - Reestruturação visual no padrão dos novos cadastros (sistema de 6 abas dedicadas: Corporativo, Contato & Sede, Financeiro, Representante, Módulos & Addons, Cérebro IA).
   - Novos campos em aba própria para o contato financeiro/faturamento (`financeiro_nome`, `financeiro_email`, `financeiro_telefone`, `financeiro_chave_pix`) para automação de boletos, NF-e e cobrança.
5. **Workflows & Funis (Gestão do Ciclo de Vida e Exclusão Inteligente):**
   - **Exclusão com Inteligência de Negócio:** Se o funil não possuir cards, realiza exclusão física definitiva com etapas e permissões. Se possuir cards, converte automaticamente para **Inativação** (`ativo = false`) para preservar o histórico operacional e a integridade referencial dos atendimentos, com suporte à reativação.
   - **Filtro de Status:** Listagem de funis com filtros rápidos `Ativos` (padrão), `Inativos` e `Todos` com contadores em tempo real.
   - **Integração Estoque ↔ Workflow:** A opção de aprovação de requisição de materiais via card Kanban só é visível se a organização tiver o addon de `workflow` habilitado.
   - **Relatórios Workflow + Omnichannel (16/09):** Centro de Inteligência `/cockpit/relatorios` — 6 KPIs omni (fila, SLA, volume, heatmap, handover, por canal) + 8 workflow (receita, carteira, velocidade, conversão, dwell, forecast, gargalos, produtividade) via RPC `crm_rpc_relatorio`; triggers SLA em threads (`first_response_at` / `handover_at` / `closed_at` / `message_count_*`). Cutover **26–27**. RBAC `relatorios.view` + addon `workflow`.
6. **Diretriz de Design System (Abas Temáticas Canônicas):**
   - Formalização da regra de proibição de "tripas verticais compridas" de campos empilhados (`.cursor/rules/ui-design-system-abas.mdc`).
   - Refatoração da tela de Configurações de Estoque (`/cockpit/estoque/configuracao`) para a arquitetura canônica de abas (`Importação NF-e`, `Requisições Internas` e `Fluxo de Aprovação`).
7. **Performance SaaS:** regra `.cursor/rules/saas-performance.mdc` (agregar no Postgres, paginar, índice com `empresa_id`).

---

## 3. Dependências e Pré-Requisitos de Infraestrutura

### 3.1 Dependência NPM Nova
- **`fast-xml-parser`**: Adicionada versão `^5.11.1` em `package.json` (necessária para importação de XML de NF-e no módulo de estoque).
  - *Ação no deploy:* Executar `npm install` ou build Docker padrão já contemplará pelo lockfile.

### 3.2 Variáveis de Ambiente
Nenhuma nova variável de ambiente é obrigatória. As conexões existentes com Supabase Prod e Evolution API permanecem inalteradas:
- `NEXT_PUBLIC_SUPABASE_URL` (URL Prod)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Anon Key Prod)
- `SUPABASE_SERVICE_ROLE_KEY` (Service Role Prod)
- `NEXT_PUBLIC_APP_URL` (`https://app.huginflow.com` ou URL oficial)

---

## 4. Roteiro Sequencial de Migrations SQL (Banco Prod)

As migrations devem ser executadas **estritamente na ordem numérica indicada**, no SQL Editor do projeto de Produção (`zmypzexefjbovuknjlid`) ou via MCP Supabase Prod (somente sob autorização explícita).

| Ordem | Arquivo de Migration | Escopo / Conteúdo | Verificação Pós-Execução |
|---|---|---|---|
| **01** | `supabase/migrations/202609111200_plataforma_addon_entitlements.sql` | Cria tabelas `addon_registry` e `empresa_addons`; seed dos 8 módulos centrais; RLS tenant. | `SELECT count(*) FROM addon_registry;` (deve retornar >= 8) |
| **02** | `supabase/migrations/202609111400_crm_leads_pessoas_campos.sql` | Adiciona campos mestre de Pessoas em `crm_leads` (papéis multi, PF/PJ, fiscal, bancário). | `SELECT column_name FROM information_schema.columns WHERE table_name = 'crm_leads' AND column_name = 'papeis';` |
| **03** | `supabase/migrations/202609111500_cad_skus_mestre_unidades_depara.sql` | Cria `cad_skus`, `cad_sku_conversoes_um`, `cad_sku_depara`; policies RLS e RBAC `skus`. | `SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'cad_sku%';` (3 tabelas) |
| **04** | `supabase/migrations/202609111600_cad_sku_conversao_generica.sql` | Torna `sku_id` nullable em `cad_sku_conversoes_um` para suporte a fatores de conversão padrão. | `SELECT is_nullable FROM information_schema.columns WHERE table_name = 'cad_sku_conversoes_um' AND column_name = 'sku_id';` (YES) |
| **05** | `supabase/migrations/202609111700_cad_skus_reforma_fiscal.sql` | Adiciona colunas da Reforma Tributária em `cad_skus` (IBS, CBS, IS, alíquotas e NBS). | `SELECT column_name FROM information_schema.columns WHERE table_name = 'cad_skus' AND column_name = 'ibs_aliquota';` |
| **06** | `supabase/migrations/202609111800_cad_ativos_patrimonio.sql` | Cria `cad_ativos` com `departamento_id`, campos de depreciação e stub de fórmulas. | `SELECT table_name FROM information_schema.tables WHERE table_name = 'cad_ativos';` |
| **07** | `supabase/migrations/202609111900_cad_ativos_departamento_cc.sql` | Garante que Centro de Custo aponte para `departamentos.id` (idempotente). | `\d cad_ativos` (sem coluna `centro_custo` texto) |
| **08** | `supabase/migrations/202609121200_empresas_contato_financeiro.sql` | Adiciona `financeiro_nome`, `financeiro_email`, `financeiro_telefone`, `financeiro_chave_pix` em `empresas`. | `SELECT column_name FROM information_schema.columns WHERE table_name = 'empresas' AND column_name = 'financeiro_email';` |
| **09** | `supabase/migrations/202609121000_estoque_modulo_tabelas_rls.sql` | **Fundação do Estoque:** Cria 15 tabelas operacionais + 60 policies RLS por tenant/RBAC. | `SELECT count(*) FROM information_schema.tables WHERE table_name LIKE 'est_%' OR table_name = 'cad_locais_estoque';` (15 tabelas) |
| **10** | `supabase/migrations/202609121100_estoque_rpcs_movimento_e_batch.sql` | **Regra de Ouro:** RPC `est_registrar_movimento_atomico` e RPC batch `est_reconstruir_saldos_from_cardex`. | `SELECT routine_name FROM information_schema.routines WHERE routine_name = 'est_registrar_movimento_atomico';` |
| **11** | `supabase/migrations/202609121300_pipelines_ativo_soft_delete.sql` | **Ciclo de Vida de Funis:** coluna `ativo` em `pipelines`. | `SELECT column_name FROM information_schema.columns WHERE table_name = 'pipelines' AND column_name = 'ativo';` |
| **12** | `supabase/migrations/202609131400_est_vw_saldos_consolidados.sql` | View de saldos consolidados (posição por SKU na empresa). | `SELECT to_regclass('public.est_vw_saldos_consolidados');` |
| **13** | `supabase/migrations/202609131500_fix_rpc_saldo_decremento_check.sql` | Fix RPC: decremento de saldo via UPDATE (evita `est_saldos_quantidade_check`). | Reexecutar saída/transferência smoke em DEV. |
| **14** | `supabase/migrations/202609131600_est_transferencia_lotes.sql` | Lotes multi-SKU de transferência + vínculo no Cardex. | `SELECT to_regclass('public.est_transferencia_lotes');` |
| **15** | `supabase/migrations/202609131700_est_remessa_item_local_obs_lote.sql` | Remessa: `local_origem_id` por item + `observacao` no lote. | `SELECT column_name FROM information_schema.columns WHERE table_name = 'est_remessa_itens' AND column_name = 'local_origem_id';` |
| **16** | `supabase/migrations/202609131800_est_remessa_baixa_e_retorno_sku.sql` | Remessa: `quantidade_baixada`; tipo `remessa_baixa`; retorno com `sku_poder_id` / `quantidade_poder`. | `SELECT column_name FROM information_schema.columns WHERE table_name = 'est_remessa_itens' AND column_name = 'quantidade_baixada';` |
| **17** | `supabase/migrations/202609151900_est_locais_padrao_branco_terceiros.sql` | Locais sistema BRANCO + TERCEIROS; `eh_terceiros`; seed ao criar empresa. | `SELECT column_name FROM information_schema.columns WHERE table_name = 'cad_locais_estoque' AND column_name = 'eh_terceiros';` |
| **18** | `supabase/migrations/202609151910_est_remessa_cardex_dual_terceiros.sql` | Dual Cardex próprio↔TERCEIROS; poder por `remessa_id`. | Smoke remessa envio (2 linhas Cardex) ou `SELECT column_name FROM information_schema.columns WHERE table_name = 'est_saldos_poder_terceiros' AND column_name = 'remessa_id';` |
| **19** | `supabase/migrations/202609152000_est_req_aprovacao_parametros.sql` | Aprovação interna: `req_aprovacao_*` em `est_config` + auditoria em `est_requisicoes`. | `SELECT column_name FROM information_schema.columns WHERE table_name = 'est_config' AND column_name = 'req_aprovador_usuario_id';` |
| **20** | `supabase/migrations/202609161200_grupos_acesso_cockpit_template.sql` | Home pronta por grupo: `cockpit_template` (`auto` \| `atendente_omni` \| `operador_estoque`). | `SELECT column_name FROM information_schema.columns WHERE table_name = 'grupos_acesso' AND column_name = 'cockpit_template';` |
| **21** | `supabase/migrations/202609161400_crm_leads_codigo_externo_req_adapter_atc.sql` | `crm_leads.codigo_externo` (matrícula) + addon `estoque_req_adapter_atc`. | `SELECT column_name FROM information_schema.columns WHERE table_name = 'crm_leads' AND column_name = 'codigo_externo';` · `SELECT 1 FROM addon_registry WHERE codigo = 'estoque_req_adapter_atc';` |
| **22** | `supabase/migrations/202609161500_est_requisicoes_rastreio_origem.sql` | Rastreio planilha/integração: `codigo_origem`, `sistema_origem`, `requisitante_nome_origem` + unique idempotente. | `SELECT column_name FROM information_schema.columns WHERE table_name = 'est_requisicoes' AND column_name = 'codigo_origem';` |
| **23** | `supabase/migrations/202609161600_est_config_req_planilha_auto_atender.sql` | Param: import planilha recebe+baixa (`req_planilha_auto_atender`) vs só recebe. | `SELECT column_name FROM information_schema.columns WHERE table_name = 'est_config' AND column_name = 'req_planilha_auto_atender';` |
| **24** | `supabase/migrations/202609161700_cad_sku_familias.sql` | Famílias de SKU (`cad_sku_familias` + `cad_skus.familia_id`) + RLS. | `SELECT to_regclass('public.cad_sku_familias');` |
| **25** | `supabase/migrations/202609161800_est_rpc_relatorios.sql` | Relatórios SaaS: RPC `est_rpc_relatorio` (filtros/`GROUP BY`/paginação no Postgres). | `SELECT routine_name FROM information_schema.routines WHERE routine_name = 'est_rpc_relatorio';` |
| **26** | `supabase/migrations/202609161900_crm_rpc_relatorio.sql` | BI Workflow+Omni: RPC `crm_rpc_relatorio` (14 slugs). | `SELECT routine_name FROM information_schema.routines WHERE routine_name = 'crm_rpc_relatorio';` |
| **27** | `supabase/migrations/202609161910_crm_thread_sla_writers.sql` | Triggers SLA thread (FRT, handover, closed, message_count). | `SELECT tgname FROM pg_trigger WHERE tgname LIKE 'trg_crm_%thread%';` |

> **Observação:** 01–08 = Onda Cadastros · 09–10 + 12–19 = Onda Estoque · 11 = Funis · **20 = Cockpit templates** · **21–23 = Planilha requisição** · **24 = Família SKU** · **25 = Relatórios estoque RPC** · **26–27 = BI Workflow/Omni**. Em **DEV** as migrations até **27** já foram aplicadas via MCP. **PROD:** só com pedido explícito.

---

## 5. Arquivos de Código Envolvidos no Release

### 5.1 Novos Módulos e Componentes Criados
- **Estoque Front-end:**
  - `src/app/(app)/cockpit/estoque/**` (locais, entradas, retiradas, transferências, ajustes, remessas + `/retorno`, requisições + `/aprovacao` + `/import`, saldos, cardex, configuração, **`relatorios` + `[slug]`**).
  - `src/components/estoque/**` (nav, paginação, **`relatorios/`** filtros/export).
  - `src/lib/estoque/**` (`operacoes-avancadas.ts`, `aprovacao-requisicao.ts`, `rpc-movimento.ts`, `requisicao-planilha/**`, **`relatorios/`** catalog/queries/format).
- **Relatórios BI (Workflow + Omnichannel):**
  - `src/app/(app)/cockpit/relatorios/**` (hub + `[slug]`).
  - `src/components/relatorios/**` (`BiReportFiltersForm`, `BiReportExportBar`).
  - `src/lib/relatorios/**` (catalog 14 slugs, queries → `crm_rpc_relatorio`, format).
- **Cockpit templates (home):**
  - `src/lib/cockpit/templates.ts`
  - `src/app/(app)/cockpit/_components/EstoqueOperatorDashboard.tsx`
  - `src/app/(app)/cockpit/estoque-cockpit-actions.ts`
  - `src/app/(app)/cockpit/page.tsx` (resolve template)
- **Cadastros Front-end:**
  - `src/app/(app)/cockpit/cadastros/**` (hubs e CRUDs de SKUs, Conversões UM, SKU De-Para e Ativos).
  - `src/components/skus/**`, `src/components/ativos/AtivoForm.tsx`, `src/components/pessoas/PessoaForm.tsx`.
  - `src/lib/skus/**`, `src/lib/ativos/**`, `src/lib/pessoas/**`.
- **Workflows & Funis:**
  - `src/app/(app)/cockpit/crm/funis/FunilRowActions.tsx` (e espelho em `src/components/crm/` se aplicável).
- **Entitlements & Addons / Empresas:**
  - `src/components/empresas/EmpresaForm.tsx`, `src/constants/empresa-form.ts`.
- **Regras de Governança & Design System:**
  - `.cursor/rules/ui-design-system-abas.mdc`
  - `.cursor/rules/saas-performance.mdc`
  - `.cursor/rules/git-main-e-producao.mdc`

### 5.2 Arquivos Alterados
- `package.json` / `package-lock.json` (`fast-xml-parser`, versão SemVer).
- `.cursorrules` / `AGENTS.md` (governança Git + UI).
- `src/constants/permissions.ts` (RBAC estoque).
- `src/app/(app)/cockpit/cockpit-nav.ts`, `CockpitShell.tsx`, actions de empresas/CRM.
- Docs: `docs/desenvolvimento-modulo-estoque.md`, `docs/MIGRACAO-SUPABASE.md`, `docs/supabase-prod-deploy-pending.md`, este cutover.

### 5.3 Arquivos Obsoletos Removidos
- `src/app/(app)/cockpit/empresas/[id]/StatusToggle.tsx`
- `src/app/(app)/cockpit/empresas/[id]/editar/EditForm.tsx`
- `src/app/(app)/cockpit/empresas/[id]/editar/EmpresaAddonsSection.tsx`

---

## 6. Procedimento Passo a Passo de Execução do Cutover

```
[ETAPA 0: SMOKE DEV] ──> [ETAPA 1: PREPARAÇÃO] ──> [ETAPA 2: BANCO PROD] ──> [ETAPA 3: GIT & DEPLOY] ──> [ETAPA 4: SMOKE PROD]
```

### Etapa 0: Smoke em DEV (14/09 — antes de qualquer prod)
1. Remessa multi-local + obs de lote + geração `REM-…`.
2. Retorno mesmo SKU; retorno com SKU diferente (industrialização); baixa definitiva parcial fechando lote.
3. Conferir Cardex (`remessa_saida` / `remessa_retorno` / `remessa_baixa`) e saldos / poder de terceiros.
4. Transferência lote, entradas, retiradas e requisições (regressão rápida).
5. **Relatórios Estoque:** `/cockpit/estoque/relatorios` — abrir `valor-estoque` e `consumo-doh`; filtros + paginação; Excel/PDF; RPC `est_rpc_relatorio` retorna `rows`/`resumo` (`total_count`).
6. **Relatórios Workflow/Omni:** `/cockpit/relatorios` — abrir `omni-fila`, `omni-sla`, `wf-receita`, `wf-gargalos`; permissão `relatorios.view`; RPC `crm_rpc_relatorio`; triggers SLA (nova msg → `first_response_at` / handover → `handover_at`).

### Etapa 1: Preparação e Janela de Manutenção
1. Agendar janela de baixo tráfego (ou notificar equipe de operações).
2. **Backup Imediato do Banco de Produção:**
   - Dashboard Supabase Prod → **Database** → **Backups** → snapshot manual.
3. Garantir `develop` com smoke verde e `npx tsc --noEmit` limpo.

### Etapa 2: Aplicação do Banco de Dados (Supabase Prod)
*Somente executar com o OK formal do responsável.*
1. Abrir o SQL Editor do Supabase Prod.
2. Executar as migrations de **01 a 27** na ordem da Seção 4.
3. Validar queries pós-execução (addons, cadastros, famílias SKU, 15+ tabelas estoque, RPCs, colunas remessa/aprovação/planilha, `grupos_acesso.cockpit_template`, `crm_leads.codigo_externo`, funis `ativo`).
4. **Validar RPCs de relatórios:**
   ```sql
   SELECT routine_name FROM information_schema.routines
   WHERE routine_name IN ('est_rpc_relatorio', 'crm_rpc_relatorio');
   SELECT tgname FROM pg_trigger WHERE tgname LIKE 'trg_crm_%thread%';
   ```

### Etapa 3: Git, Versionamento e Deploy VPS
1. Código e tag `v0.3.0` já versionados em **`develop`** (GitHub).
2. Solicitar autorização expressa para merge/push em `main` (deploy VPS):
   - *"Posso fazer o merge de develop para main e disparar o deploy de produção?"*
3. Após aprovação expressa:
   ```bash
   git checkout main
   git pull origin main
   git merge develop --ff-only
   git push origin main
   git checkout develop
   ```

### Etapa 4: Smoke Test Pós-Deploy (produção)
- Cadastros (Pessoas, SKUs, Ativos), Empresas (aba Financeiro), Funis (ativo/inativo).
- Estoque: locais, entrada, remessa envio/retorno/baixa, cardex, saldos, aprovação de requisição, **import planilha** (receber / receber+baixar).
- **Relatórios Estoque** (`estoque_relatorios.view`): hub + 1–2 slugs Wave 1 com filtros/export.
- **Relatórios BI** (`relatorios.view` + addon workflow): hub omni + workflow; fila/SLA e receita/gargalos.
- Configuração estoque em abas; home `/cockpit` com template Omni vs Estoque conforme grupo.
- Entitlement workflow nas requisições (card Kanban); addon `estoque_req_adapter_atc` se cliente ATC.

---

## 7. Plano de Rollback e Contingência

### 7.1 Rollback de Código (Front-end / App)
1. No Portainer / Docker Swarm: reverter `huginflow_app` para a imagem/tag anterior.
2. No Git: só `reset`/`push --force` em `main` se **expressamente** ordenado; voltar imediatamente para `develop`.

### 7.2 Rollback de Banco de Dados (Supabase Prod)
- Migrations são aditivas; reverter código não quebra CRM/Omni/Finance pré-existente.
- Expurgo só com snapshot da Etapa 1 ou script de drop ordenado (pedido explícito).

---

## 8. Histórico de Versões e Sign-Off

| Versão | Data | Responsável | Status | Descrição |
|---|---|---|---|---|
| `v0.1.0` | 2026-09-06 | Alexandre Nordin | Em Produção | Baseline estável Omnichannel, CRM e Finance/AR. |
| `v0.2.0` | 2026-09-11 | Alexandre Nordin | Em DEV | Entitlements, Cadastros Mestres e spec Estoque. |
| `v0.2.1` | 2026-09-11 | Alexandre Nordin | Em DEV | Regras estritas de governança Git e spec remessas. |
| **`v0.3.0`** | **2026-09-13** | **Alexandre Nordin** | **Em DEV (GitHub `develop`)** | Estoque Fase 4.1 + remessa multi-local/liquidação (SKU diferente + baixa) + empresas/funis/abas. Smoke 14/09; cutover prod sob pedido explícito. |
| `v0.3.x` | 2026-09-15/16 | Alexandre Nordin | Em DEV | Locais BRANCO/TERCEIROS + Cardex dual; aprovação req.; cockpit_template; planilha req; famílias SKU; **relatórios estoque (`est_rpc_relatorio`)** + **BI workflow/omni (`crm_rpc_relatorio` + SLA writers)**. Incluir migrations **17–27** no go-live. |
