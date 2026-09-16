# Migração Supabase — registro vivo (dev → produção)

> 🚀 **Documento Consolidado de Cutover:** Consulte o roteiro completo de subida para produção em [CUTOVER-PROD-SET-2026.md](./CUTOVER-PROD-SET-2026.md), contendo passo a passo, ordem das migrations, dependências e validações pós-deploy.

> **Atualize este documento a cada alteração de schema**, migration aplicada no dev, ou item incluído no bundle de produção.

| Ambiente | Project ref | Dashboard |
|----------|-------------|-----------|
| **Dev** | `vujqukqsfwmoezwyuoum` | [huginflow-dev](https://supabase.com/dashboard/project/vujqukqsfwmoezwyuoum) |
| **Prod** | `zmypzexefjbovuknjlid` | [huginflow-prod](https://supabase.com/dashboard/project/zmypzexefjbovuknjlid) |

**Última migration no prod (intencional):** pacote até `test_runs`/Analytics BI via MCP em 2026-09-06.  
**Gate prod (combinado 2026-09-11):** aplicar SQL/código em produção **somente** com pedido explícito do responsável. Até lá: documentar e homologar em DEV.

**Última migration no dev:** `202609161700_cad_sku_familias` (além de planilha req 161400–161600, cockpit_template, aprovação req. e anteriores de estoque).

**Gerar bundle SQL consolidado:**

```bash
node scripts/supabase/prod-deploy/build-bundle.mjs
```

**Saída:** `scripts/supabase/prod-deploy/out/huginflow-prod-pending.sql`

---

## Changelog (mais recente primeiro)

| Data | Migration / alteração | Dev | Prod | Arquivo | Notas |
|------|----------------------|-----|------|---------|-------|
| 2026-09-16 | `crm_thread_sla_writers` | ✅ | ⏳ | `supabase/migrations/202609161910_crm_thread_sla_writers.sql` | Triggers FRT/handover/closed_at + message_count; cutover **27** |
| 2026-09-16 | `crm_rpc_relatorio` | ✅ | ⏳ | `supabase/migrations/202609161900_crm_rpc_relatorio.sql` | BI omni+workflow RPC (14 slugs); cutover **26** |
| 2026-09-16 | `est_rpc_relatorios` | ✅ | ⏳ | `supabase/migrations/202609161800_est_rpc_relatorios.sql` | RPC `est_rpc_relatorio` (11 slugs, agregação+paginação); cutover **25** |
| 2026-09-16 | `cad_sku_familias` | ✅ | ⏳ | `supabase/migrations/202609161700_cad_sku_familias.sql` | Famílias SKU + `familia_id`; cutover **24**; seed Monte Sinai DEV |
| 2026-09-16 | `est_config_req_planilha_auto_atender` | ✅ | ⏳ | `supabase/migrations/202609161600_est_config_req_planilha_auto_atender.sql` | Import planilha: receber+baixar vs só receber; cutover **23** |
| 2026-09-16 | `est_requisicoes_rastreio_origem` | ✅ | ⏳ | `supabase/migrations/202609161500_est_requisicoes_rastreio_origem.sql` | `codigo_origem`/`sistema_origem`/`requisitante_nome_origem` + unique; cutover **22** |
| 2026-09-16 | `crm_leads_codigo_externo_req_adapter_atc` | ✅ | ⏳ | `supabase/migrations/202609161400_crm_leads_codigo_externo_req_adapter_atc.sql` | `codigo_externo` + addon `estoque_req_adapter_atc`; cutover **21** |
| 2026-09-16 | `grupos_acesso_cockpit_template` | ✅ | ⏳ | `supabase/migrations/202609161200_grupos_acesso_cockpit_template.sql` | Home pronta: `cockpit_template` (`auto` \| `atendente_omni` \| `operador_estoque`); cutover **20** |
| 2026-09-15 | `est_req_aprovacao_parametros` | ✅ | ⏳ | `supabase/migrations/202609152000_est_req_aprovacao_parametros.sql` | Aprovação interna req.; `req_aprovacao_*` + auditoria; cutover **19** |
| 2026-09-15 | `est_remessa_cardex_dual_terceiros` | ✅ | ⏳ | `supabase/migrations/202609151910_est_remessa_cardex_dual_terceiros.sql` | Dual Cardex próprio↔TERCEIROS; tipos `remessa_entrada_terceiros` / `remessa_saida_terceiros`; poder por `remessa_id`; rebuild + backfill |
| 2026-09-15 | `est_locais_padrao_branco_terceiros` | ✅ | ⏳ | `supabase/migrations/202609151900_est_locais_padrao_branco_terceiros.sql` | `eh_terceiros`; RPC `est_garantir_locais_padrao`; trigger ao criar empresa + backfill BRANCO/TERCEIROS |
| 2026-09-13 | `est_remessa_baixa_e_retorno_sku` | ✅ | ⏳ | `supabase/migrations/202609131800_est_remessa_baixa_e_retorno_sku.sql` | `quantidade_baixada`; tipo `remessa_baixa`; retorno com `sku_poder_id` / `quantidade_poder` |
| 2026-09-13 | `est_remessa_item_local_obs_lote` | ✅ | ⏳ | `supabase/migrations/202609131700_est_remessa_item_local_obs_lote.sql` | Local de saída por item + `observacao` no lote de remessa |
| 2026-09-12 | `empresas_contato_financeiro` | ✅ | ⏳ | `supabase/migrations/202609121200_empresas_contato_financeiro.sql` | Adiciona colunas `financeiro_nome`, `financeiro_email`, `financeiro_telefone`, `financeiro_chave_pix` na tabela `public.empresas` |
| 2026-09-13 | `est_transferencia_lotes` | ✅ | ⏳ | `supabase/migrations/202609131600_est_transferencia_lotes.sql` | Lotes multi-SKU de transferência + FK Cardex |
| 2026-09-13 | `fix_rpc_saldo_decremento_check` | ✅ | ⏳ | `supabase/migrations/202609131500_fix_rpc_saldo_decremento_check.sql` | Fix RPC: decremento via UPDATE (evita `est_saldos_quantidade_check` em transferência/saída) |
| 2026-09-12 | `estoque_rpcs_movimento_e_batch` | ✅ | ⏳ | `supabase/migrations/202609121100_estoque_rpcs_movimento_e_batch.sql` | RPC atômica `est_registrar_movimento_atomico` (REGRA DE OURO Cardex+Saldo) + batch de reconciliação `est_reconstruir_saldos_from_cardex` |
| 2026-09-12 | `estoque_modulo_tabelas_rls` | ✅ | ⏳ | `supabase/migrations/202609121000_estoque_modulo_tabelas_rls.sql` | Módulo Estoque Fase 4.1: 15 tabelas (`cad_locais_estoque`, `est_config`, `est_saldos`, `est_saldos_poder_terceiros`, `est_movimentos`, lotes/itens de entrada, retirada, ajuste, remessa terceiros, requisições) + 60 policies RLS por tenant/RBAC |
| 2026-09-11 | Rollback SQL precoce Cadastros | — | ✅ desfeito | MCP `rollback_premature_cadastros_wave_parcial` | Removeu `addon_registry`/`empresa_addons` + colunas Pessoas; limpou `schema_migrations` das duas entries precoces |
| 2026-09-11 | `cad_ativos_departamento_cc` | ✅ | ⏳ | `supabase/migrations/202609111900_cad_ativos_departamento_cc.sql` | CC = `departamento_id`; drop `centro_custo` texto. Locais estoque **fora** (addon `estoque`) |
| 2026-09-11 | `cad_ativos_patrimonio` | ✅ | ⏳ | `supabase/migrations/202609111800_cad_ativos_patrimonio.sql` | `cad_ativos` + stub fórmulas; greenfield já com `departamento_id` |
| 2026-09-11 | `cad_skus_reforma_fiscal` | ✅ | ⏳ | `supabase/migrations/202609111700_cad_skus_reforma_fiscal.sql` | IBS/CBS/IS + NBS |
| 2026-09-11 | `cad_sku_conversao_generica` | ✅ | ⏳ | `supabase/migrations/202609111600_cad_sku_conversao_generica.sql` | `sku_id` nullable |
| 2026-09-11 | `cad_skus_mestre_unidades_depara` | ✅ | ⏳ | `supabase/migrations/202609111500_cad_skus_mestre_unidades_depara.sql` | SKU + UM + de-para |
| 2026-09-11 | `crm_leads_pessoas_campos` | ✅ | ⏳ | `supabase/migrations/202609111400_crm_leads_pessoas_campos.sql` | Homologar DEV; cutover só com pedido explícito |
| 2026-09-11 | `plataforma_addon_entitlements` | ✅ | ⏳ | `supabase/migrations/202609111200_plataforma_addon_entitlements.sql` | Homologar DEV; cutover só com pedido explícito |
| 2026-09-07 | `phase5_analytics_rbac` | ✅ | ⏳ | `supabase/migrations/202609072045_phase5_analytics_rbac.sql` | RPCs Analytics exigem `relatorios.view` no backend |
| 2026-09-07 | `phase5_omni_department_membership` | ✅ | ⏳ | `supabase/migrations/202609072030_phase5_omni_department_membership.sql` | Operador lê somente sua associação departamental same-tenant para ACL Omni |
| 2026-09-07 | `phase5_isolation_analytics` | ✅ | ⏳ | `supabase/migrations/202609072000_phase5_isolation_analytics.sql` | `test_runs.organization_id`, hardening analytics/finance e filtros de departamento |
| 2026-09-07 | `phase4_knowledge_rbac` | ✅ | ⏳ | `supabase/migrations/202609071900_phase4_knowledge_rbac.sql` | RAG RBAC, integridade source/tenant e grants |
| 2026-09-07 | `phase3_permission_rls` | ✅ | ⏳ | `supabase/migrations/202609071530_phase3_permission_rls.sql` | RBAC/RLS leads, canais e roteamento |
| 2026-09-02 | `revert_handover_structured` | ✅ | ✅ | `supabase/migrations/202609021000_revert_handover_structured.sql` | Remove `crm_handover_config`, `handover_ja_feito`, `handover_pendencias` — resumo IA em `observacao` |
| 2026-09-01 | `crm_cards_handover_structured` | ↩️ revertido | ↩️ revertido | `supabase/migrations/202609011400_crm_cards_handover_structured.sql` | Substituído por resumo IA |
| 2026-09-01 | `empresas_crm_handover_config` | ↩️ revertido | ↩️ revertido | `supabase/migrations/202609011200_empresas_crm_handover_config.sql` | Substituído por resumo IA |
| 2026-08-31 | `crm_chat_threads_active_speaker` | ✅ | ⏳ | `supabase/migrations/202608311800_crm_chat_threads_active_speaker.sql` | Threads + falante ativo |
| 2026-08-31 | Sessões por departamento / falante ativo (MVP) | ✅ MVP | ⏳ | código + migration acima | Implementado em dev |
| 2026-08-31 | Chat: notificar responsável em alteração de card | ✅ | ⏳ | `src/lib/crm/notifyCardResponsavel.ts` (+ actions/triage) | Só código |
| 2026-08-31 | Kanban: data/hora criação no card | ✅ | ⏳ | `KanbanItem.tsx` | Só código |
| 2026-08-31 | Documentos: ensurer + heurística boleto | ✅ | ⏳ | `DocumentCardEnsurer.ts` | Só código — cutover documentos |
| 2026-08-31 | `crm_card_files_whatsapp_inbound` | ✅ | ⏳ | `supabase/migrations/202608311400_crm_card_files_whatsapp_inbound.sql` | source / provider_message_id |
| 2026-08-31 | `crm_cards_realtime` | ✅ | ⏳ | `supabase/migrations/202608311230_crm_cards_realtime.sql` | publication realtime |
| 2026-08-31 | `chat_inbox_rpc` | ✅ | ⏳ | `supabase/migrations/202608311200_chat_inbox_rpc.sql` | RPC inbox + índices |
| 2026-06-21 | `finance_contrato_os_testemunhas` | ✅ | ⏳ | `supabase/migrations/202606211400_finance_contrato_os_testemunhas.sql` | `numero_os` auto OS-AAAA-NNNN + testemunhas 1/2 (nome, CPF) |
| 2026-06-21 | `finance_contrato_limite_usuarios` | ✅ | ⏳ | `supabase/migrations/202606211200_finance_contrato_limite_usuarios.sql` | Coluna `limite_usuarios` em `finance_contratos` (quadro comercial OS/PDF) |
| 2026-06-20 | `finance_meses_vigencia_fix` | ✅ | ⏳ | `supabase/migrations/202606201200_finance_meses_vigencia_fix.sql` | Fix 13 mensalidades: `fn_finance_meses_vigencia` |
| 2026-06-19 | `finance_contrato_vencimento_meio` | ✅ | ⏳ | `supabase/migrations/202606191200_finance_contrato_vencimento_meio.sql` | `meio_pagamento_setup`, `mensalidades_total`, vencimento |
| 2026-06-18 | `finance_contrato_ar_fixes` | ✅ | ⏳ | `supabase/migrations/202606181200_finance_contrato_ar_fixes.sql` | `numero_documento` único, RPC gerar contas |
| 2026-06-17 | `finance_contrato_gerar_ar` | ✅ | ⏳ | `supabase/migrations/202606171200_finance_contrato_gerar_ar.sql` | `contrato_id` em AR + RPC gerar contas |
| 2026-06-16 | `finance_contratos` | ✅ | ⏳ | `supabase/migrations/202606161200_finance_contratos.sql` | Cadastro comercial: contrato + serviços extras |
| 2026-06-15 | `finance_ar_parcelas` | ✅ | ⏳ | `supabase/migrations/202606041200_finance_ar_parcelas.sql` | Parcelas/mensalidades no AR |
| 2026-06-15 | Módulo AR etapas 1–3 | ✅ | ⏳ | `supabase/migrations/202606031*.sql` | Contas a receber, RPCs, triggers, RLS |
| 2026-06-13 | `empresas_campos_contrato` | ✅ | ⏳ | `scripts/migrations/empresas_campos_contrato.sql` | Campos jurídicos MSA em `empresas` |

**Legenda:** ✅ aplicado · ⏳ pendente · ❌ não necessário

---

## Pacote pendente para produção (ordem de execução)

| # | ID | Arquivo |
|---|-----|---------|
| 1 | `empresas_campos_contrato` | `scripts/migrations/empresas_campos_contrato.sql` |
| 2 | `finance_ar_step1` | `supabase/migrations/202606031200_finance_ar_step1.sql` |
| 3 | `finance_ar_step2_routines` | `supabase/migrations/202606031400_finance_ar_step2_routines.sql` |
| 4 | `etapa3_helpers` | `supabase/migrations/202606031600_etapa3_helpers.sql` |
| 5 | `etapa3_outbox` | `supabase/migrations/202606031601_etapa3_outbox.sql` |
| 6 | `etapa3_auditoria` | `supabase/migrations/202606031602_etapa3_auditoria.sql` |
| 7 | `etapa3_triggers` | `supabase/migrations/202606031603_etapa3_triggers.sql` |
| 8 | `etapa3_rls` | `supabase/migrations/202606031604_etapa3_rls.sql` |
| 9 | `etapa3_grants` | `supabase/migrations/202606031605_etapa3_grants.sql` |
| 10 | `finance_ar_parcelas` | `supabase/migrations/202606041200_finance_ar_parcelas.sql` |
| 11 | `finance_contratos` | `supabase/migrations/202606161200_finance_contratos.sql` |
| 12 | `finance_contrato_gerar_ar` | `supabase/migrations/202606171200_finance_contrato_gerar_ar.sql` |
| 13 | `finance_contrato_ar_fixes` | `supabase/migrations/202606181200_finance_contrato_ar_fixes.sql` |
| 14 | `finance_contrato_vencimento_meio` | `supabase/migrations/202606191200_finance_contrato_vencimento_meio.sql` |
| 15 | `finance_meses_vigencia_fix` | `supabase/migrations/202606201200_finance_meses_vigencia_fix.sql` |
| 16 | `finance_contrato_limite_usuarios` | `supabase/migrations/202606211200_finance_contrato_limite_usuarios.sql` |
| 17 | `finance_contrato_os_testemunhas` | `supabase/migrations/202606211400_finance_contrato_os_testemunhas.sql` |

### Pacote CRM / omni (ago/2026) — fora do bundle finance

Aplicar após o pacote finance (ou em cutover CRM dedicado). Detalhes: [supabase-prod-deploy-pending.md](./supabase-prod-deploy-pending.md).

| # | ID | Arquivo |
|---|-----|---------|
| 18 | `chat_inbox_rpc` | `supabase/migrations/202608311200_chat_inbox_rpc.sql` |
| 19 | `crm_cards_realtime` | `supabase/migrations/202608311230_crm_cards_realtime.sql` |
| 20 | `crm_card_files_whatsapp_inbound` | `supabase/migrations/202608311400_crm_card_files_whatsapp_inbound.sql` |
| 21 | `crm_chat_threads_active_speaker` | `supabase/migrations/202608311800_crm_chat_threads_active_speaker.sql` |

Código associado (sem SQL): documentos WhatsApp, ensurer, kanban data/hora, notify responsável — ver changelog em [supabase-prod-deploy-pending.md](./supabase-prod-deploy-pending.md).

**Roteiro de homologação:** [homologacao/script-teste-pacote-crm-ago-2026.md](./homologacao/script-teste-pacote-crm-ago-2026.md)

### Pacote Cadastros / entitlements (set/2026) — **NÃO aplicar até homologação DEV**

Detalhes e decisões: [supabase-prod-deploy-pending.md](./supabase-prod-deploy-pending.md) § Pacote Cadastros · [plataforma-entitlements-decisoes.md](./plataforma-entitlements-decisoes.md) §9.

| # | ID | Arquivo | Prod |
|---|-----|---------|------|
| C1 | `plataforma_addon_entitlements` | `supabase/migrations/202609111200_plataforma_addon_entitlements.sql` | ⏳ |
| C2 | `crm_leads_pessoas_campos` | `supabase/migrations/202609111400_crm_leads_pessoas_campos.sql` | ⏳ |
| C3 | `cad_skus_mestre_unidades_depara` | `supabase/migrations/202609111500_cad_skus_mestre_unidades_depara.sql` | ⏳ |
| C4 | `cad_sku_conversao_generica` | `supabase/migrations/202609111600_cad_sku_conversao_generica.sql` | ⏳ |
| C5 | `cad_skus_reforma_fiscal` | `supabase/migrations/202609111700_cad_skus_reforma_fiscal.sql` | ⏳ |
| C6 | `cad_ativos_patrimonio` | `supabase/migrations/202609111800_cad_ativos_patrimonio.sql` | ⏳ |
| C7 | `cad_ativos_departamento_cc` | `supabase/migrations/202609111900_cad_ativos_departamento_cc.sql` | ⏳ |
| C8 | `empresas_contato_financeiro` | `supabase/migrations/202609121200_empresas_contato_financeiro.sql` | ⏳ |

**Gate:** bateria DEV verde + **pedido explícito** do responsável. **Fora deste pacote:** `cad_locais_estoque` / `local_padrao_id` (addon `estoque`).

> Em 2026-09-11 houve apply precoce de C1/C2 em prod; foi **revertido** no mesmo dia (`rollback_premature_cadastros_wave_parcial`). Prod voltou ao baseline pré-onda Cadastros.

### Pacote Estoque (set/2026) — **NÃO aplicar até homologação DEV**

Detalhes e decisões: [supabase-prod-deploy-pending.md](./supabase-prod-deploy-pending.md) § Pacote Estoque · [desenvolvimento-modulo-estoque.md](./desenvolvimento-modulo-estoque.md).

| # | ID | Arquivo | Prod |
|---|-----|---------|------|
| E1 | `estoque_modulo_tabelas_rls` | `supabase/migrations/202609121000_estoque_modulo_tabelas_rls.sql` | ⏳ |
| E2 | `estoque_rpcs_movimento_e_batch` | `supabase/migrations/202609121100_estoque_rpcs_movimento_e_batch.sql` | ⏳ |
| E3 | `fix_rpc_saldo_decremento_check` | `supabase/migrations/202609131500_fix_rpc_saldo_decremento_check.sql` | ⏳ |
| E4 | `est_transferencia_lotes` | `supabase/migrations/202609131600_est_transferencia_lotes.sql` | ⏳ |
| E5 | `est_remessa_item_local_obs_lote` | `supabase/migrations/202609131700_est_remessa_item_local_obs_lote.sql` | ⏳ |
| E6 | `est_remessa_baixa_e_retorno_sku` | `supabase/migrations/202609131800_est_remessa_baixa_e_retorno_sku.sql` | ⏳ |
| E7 | `est_locais_padrao_branco_terceiros` | `supabase/migrations/202609151900_est_locais_padrao_branco_terceiros.sql` | ⏳ |
| E8 | `est_remessa_cardex_dual_terceiros` | `supabase/migrations/202609151910_est_remessa_cardex_dual_terceiros.sql` | ⏳ |
| E9 | `est_req_aprovacao_parametros` | `supabase/migrations/202609152000_est_req_aprovacao_parametros.sql` | ⏳ |
| E10 | `grupos_acesso_cockpit_template` | `supabase/migrations/202609161200_grupos_acesso_cockpit_template.sql` | ⏳ |
| E11 | `crm_leads_codigo_externo_req_adapter_atc` | `supabase/migrations/202609161400_crm_leads_codigo_externo_req_adapter_atc.sql` | ⏳ |
| E12 | `est_requisicoes_rastreio_origem` | `supabase/migrations/202609161500_est_requisicoes_rastreio_origem.sql` | ⏳ |
| E13 | `est_config_req_planilha_auto_atender` | `supabase/migrations/202609161600_est_config_req_planilha_auto_atender.sql` | ⏳ |
| E14 | `cad_sku_familias` | `supabase/migrations/202609161700_cad_sku_familias.sql` | ⏳ |
| E15 | `est_rpc_relatorios` | `supabase/migrations/202609161800_est_rpc_relatorios.sql` | ⏳ |
| E16 | `crm_rpc_relatorio` | `supabase/migrations/202609161900_crm_rpc_relatorio.sql` | ⏳ |
| E17 | `crm_thread_sla_writers` | `supabase/migrations/202609161910_crm_thread_sla_writers.sql` | ⏳ |

**Gate:** homologação completa em DEV + **pedido explícito** do responsável. **Nada em produção.**

> Ordem no cutover canônico: [CUTOVER-PROD-SET-2026.md](./CUTOVER-PROD-SET-2026.md) Seção 4 — itens **17–27** (após remessa 16; **25**=relatórios estoque · **26–27**=BI workflow/omni).

---

## Como aplicar em produção

1. Backup no Dashboard prod.
2. Regenerar bundle: `node scripts/supabase/prod-deploy/build-bundle.mjs`
3. Revisar `scripts/supabase/prod-deploy/out/huginflow-prod-pending.sql`
4. Executar no SQL Editor do prod (por blocos `-- BUNDLE:` se preferir).
5. Atualizar coluna **Prod** neste changelog para ✅.

### Validação rápida pós-deploy

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name LIKE 'finance%'
ORDER BY 1;
```

---

## Migrations só no dev (sem arquivo local)

Revisar antes do prod — podem já existir parcialmente no schema de produção:

- `pre_kb_tables`, `extra_tables_prod`
- `sync_prod_*`, `rls_superadmin_crm_omnichannel`
- `enable_realtime_omnichannel_tables`, `crm_conversas_one_row_per_message`

---

---

## Campos do contrato comercial (referência)

Tabela `finance_contratos` + `finance_contrato_servicos_extra`. Campos sugeridos para evolução futura:

| Campo | Status | Notas |
|-------|--------|-------|
| Vigência (início/fim) | ✅ | `data_inicio`, `data_fim` |
| Setup + parcelas | ✅ | `valor_setup`, `setup_parcelas` |
| Mensalidade | ✅ | `valor_mensalidade` |
| Serviços extras | ✅ | tabela filha com valor, parcelas, recorrente |
| Nº contrato | ✅ | auto `CTR-AAAA-NNNN` |
| Nº OS | ✅ | auto `OS-AAAA-NNNN` (por empresa) |
| Testemunhas MSA | ✅ | `testemunha_1_*`, `testemunha_2_*` (nome + CPF) |
| Status | ✅ | rascunho, ativo, suspenso, encerrado, cancelado |
| Data assinatura | ✅ | distinta do início de vigência |
| Dia vencimento mensal | ✅ | `dia_vencimento_mensal` 1–28 |
| Meio pagamento setup | ✅ | `meio_pagamento_setup` (PIX, cartão, etc.) |
| Qtd. mensalidades AR | ✅ | `mensalidades_total` |
| Limite usuários (OS/PDF) | ✅ | `limite_usuarios` 1–9999 |
| Índice reajuste | ✅ | nenhum, IPCA, IGP-M, outro |
| Observações | ✅ | texto livre |
| `contrato_id` em `finance_contas_receber` | ✅ | `sp_finance_gerar_contas_do_contrato` |
| Anexo PDF assinado | ⏳ | Storage + URL |
| Responsável comercial | ⏳ | `usuario_id` |
| Link MSA jurídico | ⏳ | integração com `/empresas/[id]/contrato` |

---

## Template para nova entrada no changelog

```markdown
| YYYY-MM-DD | `nome_migration` | ✅/⏳ | ⏳ | `caminho/arquivo.sql` | Descrição breve |
```
