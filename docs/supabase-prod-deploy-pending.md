# Deploy pendente: Supabase dev → produção

> 🚀 **Documento Consolidado de Cutover:** Consulte o roteiro completo de subida para produção em [CUTOVER-PROD-SET-2026.md](./CUTOVER-PROD-SET-2026.md), contendo o passo a passo, ordem sequencial das migrations (Cadastros + Estoque + Empresas), dependências e testes pós-deploy.

> **Documento canônico (atualizar a cada mudança):** [MIGRACAO-SUPABASE.md](./MIGRACAO-SUPABASE.md)
>
> **Plano de fases (plataforma + cadastros + estoque):** [plano-desenvolvimento-fases.md](./plano-desenvolvimento-fases.md)
>
> **Pacotes de cutover (ordem sugerida no go-live):**
>
> 1. Financeiro / AR — bundle SQL desta página + [MIGRACAO-SUPABASE.md](./MIGRACAO-SUPABASE.md)
> 2. Performance + Realtime — migrations `202608311200`, `202608311230`, `202609011200_crm_canais_realtime`
> 3. Documentos WhatsApp — migration `202608311400` + código omnichannel
> 4. CRM UX + avisos chat interno — `notifyCardResponsavel.ts`, data/hora no kanban
> 5. Sessões por departamento (MVP) — migration `202608311800` + `ChatThreadService`
> 6. Encaminhamento com resumo IA — migration `202609021000` (revert handover estruturado; **prod SQL ✅**)
> 7. Alertas canais inbound (desconexão) — migration `202609011200_crm_canais_realtime` + providers de alerta no cockpit

Comparativo entre projetos:

| Ambiente | Project ref | Dashboard |
|----------|-------------|-----------|
| **Dev** | `vujqukqsfwmoezwyuoum` | [huginflow-dev](https://supabase.com/dashboard/project/vujqukqsfwmoezwyuoum) |
| **Prod** | `zmypzexefjbovuknjlid` | [huginflow-prod](https://supabase.com/dashboard/project/zmypzexefjbovuknjlid) |

**Última migration no prod (intencional, MCP 2026-09-06):** cutover CRM + Analytics BI + `empresa_webhooks` + `test_runs` + `crm_interacoes` UPDATE RLS (além de finance/AR e `revert_handover_structured`, já presentes).

**Última migration no dev:** `202609161910_crm_thread_sla_writers` (além de `202609161900_crm_rpc_relatorio`, `202609161800_est_rpc_relatorios`, `202609161700_cad_sku_familias`, `202609161600_est_config_req_planilha_auto_atender`, e pacote estoque/cadastros anterior).

**Gate prod (combinado 2026-09-11):** **não aplicar** migrations/DDL em produção sem **pedido explícito**. Até lá: só DEV + documentação do pacote.

**Pendente em prod:** Fases 3–5 (`202609071530`, `202609071900`, `202609072000`,
`202609072030`, `202609072045`) + pacote Cadastros completo. Não aplicar sem backup, smoke e autorização explícita.

---

## Pacote Cadastros / entitlements (set/2026) — aguardando homologação DEV + pedido explícito

> **Status:** DEV ✅ SQL + UI · **PROD ⏳** (nada deste pacote em prod após rollback 2026-09-11).  
> Decisões: [plataforma-entitlements-decisoes.md](./plataforma-entitlements-decisoes.md) §9 (CC = departamento; locais de estoque só no addon `estoque`).

### Ordem de aplicação (quando o responsável pedir)

| # | Arquivo | Dev | Prod | Notas |
|---|---------|-----|------|-------|
| 1 | `202609111200_plataforma_addon_entitlements.sql` | ✅ | ⏳ | `addon_registry` + `empresa_addons`; seed sem `financeiro`; `finops` reservado |
| 2 | `202609111400_crm_leads_pessoas_campos.sql` | ✅ | ⏳ | Papéis multi, PF/PJ, endereço/fiscal/bancário |
| 3 | `202609111500_cad_skus_mestre_unidades_depara.sql` | ✅ | ⏳ | `cad_skus` + conversão + de-para; RBAC `skus` |
| 4 | `202609111600_cad_sku_conversao_generica.sql` | ✅ | ⏳ | `sku_id` nullable (genérica vs específica) |
| 5 | `202609111700_cad_skus_reforma_fiscal.sql` | ✅ | ⏳ | IBS/CBS/IS + NBS |
| 6 | `202609111800_cad_ativos_patrimonio.sql` | ✅ | ⏳ | `cad_ativos` + stub fórmulas; greenfield com `departamento_id` |
| 7 | `202609111900_cad_ativos_departamento_cc.sql` | ✅ | ⏳ | CC = `departamento_id`; drop `centro_custo` texto (idempotente se 1800 já veio sem texto) |
| 8 | `202609121200_empresas_contato_financeiro.sql` | ✅ | ⏳ | Contato financeiro em empresas: `financeiro_nome`, `financeiro_email`, `financeiro_telefone`, `financeiro_chave_pix` |

### Incidente / rollback (2026-09-11)

Apply precoce de C1+C2 em prod → **revertido** no mesmo dia (`rollback_premature_cadastros_wave_parcial`): drop tabelas entitlements, drop colunas Pessoas, limpeza de `schema_migrations`. Prod alinhado ao baseline pré-onda.

### Fora deste pacote

- `cad_locais_estoque` / `local_padrao_id` no SKU → addon **estoque** (futuro).
- Código app (menus Cadastros, forms Pessoas/SKU/Ativos) só no **mesmo release** do SQL.

### Checklist pré-prod

1. [ ] Bateria / smoke DEV (Pessoas, SKUs, Conversões UM, De-para, Ativos + select CC).
2. [ ] Pedido explícito para cutover prod.
3. [ ] Backup prod.
4. [ ] Aplicar C1→C7 na ordem (MCP ou bundle).
5. [ ] Deploy código + smoke prod.

**Analytics BI (dev ✅, prod ✅ MCP 2026-09-06):** `202609021200` … `202609021204` — índices, colunas SLA, RPCs `fn_analytics_*`

**Finance/AR em prod:** já aplicado (bundle histórico).

---

## Pacote Estoque — Fase 4.1: Fundação, Tabelas e RLS (set/2026) — aguardando homologação DEV + pedido explícito

> **Status:** DEV ✅ SQL (aplicado via MCP dev) + catálogo RBAC (`src/constants/permissions.ts`) · **PROD ⏳** (nada deste pacote em prod).  
> Especificação detalhada: [desenvolvimento-modulo-estoque.md](./desenvolvimento-modulo-estoque.md).

### Migrations do Módulo de Estoque (quando o responsável pedir)

| # | Arquivo | Dev | Prod | Notas |
|---|---------|-----|------|-------|
| E1 | `202609121000_estoque_modulo_tabelas_rls.sql` | ✅ | ⏳ | 15 tabelas (`cad_locais_estoque`, `est_config`, `est_saldos`, `est_saldos_poder_terceiros`, `est_movimentos`, lotes/itens de entrada, retirada, ajuste, remessa a terceiros, requisições) + 60 policies RLS isoladas por tenant (`empresa_id`) e RBAC granular (`check_permission`). |
| E2 | `202609121100_estoque_rpcs_movimento_e_batch.sql` | ✅ | ⏳ | RPC atômica `est_registrar_movimento_atomico` (REGRA DE OURO: Cardex + Saldo no mesmo commit) + batch de reconciliação `est_reconstruir_saldos_from_cardex`. |
| E3 | `202609131500_fix_rpc_saldo_decremento_check.sql` | ✅ | ⏳ | Fix: decremento de saldo via `UPDATE` (não `INSERT` negativo) — evita violação de `est_saldos_quantidade_check` em transferência/saída/ajuste−/remessa. |
| E4 | `202609131600_est_transferencia_lotes.sql` | ✅ | ⏳ | Lotes multi-SKU de transferência (`est_transferencia_lotes`/`itens` + `lote_transferencia_id` no Cardex) + backfill. |
| E5 | `202609131700_est_remessa_item_local_obs_lote.sql` | ✅ | ⏳ | Remessa: `local_origem_id` por item + `observacao` no lote. |
| E6 | `202609131800_est_remessa_baixa_e_retorno_sku.sql` | ✅ | ⏳ | Remessa: `quantidade_baixada`, tipo `remessa_baixa`, retorno com SKU diferente (`sku_poder_id`). |
| E7 | `202609151900_est_locais_padrao_branco_terceiros.sql` | ✅ | ⏳ | Locais sistema BRANCO + TERCEIROS; `eh_terceiros`; seed ao criar empresa. |
| E8 | `202609151910_est_remessa_cardex_dual_terceiros.sql` | ✅ | ⏳ | Dual Cardex próprio↔TERCEIROS; tipos `remessa_entrada_terceiros` / `remessa_saida_terceiros`; poder por `remessa_id`; rebuild + backfill. |
| E9 | `202609152000_est_req_aprovacao_parametros.sql` | ✅ | ⏳ | Aprovação interna de requisições: `req_aprovacao_*` em `est_config` + `valor_estimado` / auditoria em `est_requisicoes`. |
| E10 | `202609161200_grupos_acesso_cockpit_template.sql` | ✅ | ⏳ | `grupos_acesso.cockpit_template` (`auto` \| `atendente_omni` \| `operador_estoque`) — home pronta por grupo. |
| E11 | `202609161400_crm_leads_codigo_externo_req_adapter_atc.sql` | ✅ | ⏳ | `crm_leads.codigo_externo` + addon `estoque_req_adapter_atc` (adapter planilha ATC). |
| E12 | `202609161500_est_requisicoes_rastreio_origem.sql` | ✅ | ⏳ | Rastreio origem: `codigo_origem`, `sistema_origem`, `requisitante_nome_origem` + unique idempotente. |
| E13 | `202609161600_est_config_req_planilha_auto_atender.sql` | ✅ | ⏳ | `est_config.req_planilha_auto_atender` — import recebe+baixa vs só recebe. |
| E14 | `202609161700_cad_sku_familias.sql` | ✅ | ⏳ | `cad_sku_familias` + `cad_skus.familia_id`; seed Monte Sinai em DEV. |
| E15 | `202609161800_est_rpc_relatorios.sql` | ✅ | ⏳ | RPC `est_rpc_relatorio` — 11 relatórios com agregação/paginação no Postgres. |
| E16 | `202609161900_crm_rpc_relatorio.sql` | ✅ | ⏳ | BI Workflow+Omni — RPC `crm_rpc_relatorio` (14 slugs). |
| E17 | `202609161910_crm_thread_sla_writers.sql` | ✅ | ⏳ | Triggers FRT/handover/closed_at + message_count nas threads. |

### Checklist pré-prod do Módulo Estoque
1. [ ] Bateria / smoke DEV (CRUD Locais com local BRANCO, Configuração do Estoque, Entradas, Baixas, Ajustes, Remessas Terceiros, Requisições e Cardex).
2. [ ] Validação da Regra de Ouro (RPC atômica Cardex + Saldo).
3. [ ] **Relatórios estoque:** hub `/cockpit/estoque/relatorios` + RPC `est_rpc_relatorio` (E15).
4. [ ] Pedido explícito do responsável para cutover prod.
5. [ ] Backup prod.
6. [ ] Aplicar migrations **E1–E17** no prod (MCP ou bundle), na ordem (E15–E17 = pacote Relatórios).
7. [ ] Deploy código front-end + smoke prod (incl. import planilha + hubs de relatórios).

---

## Pacote Relatórios — Estoque + Workflow/Omni (16/09) — DEV ✅ · PROD ⏳

> Padrão SaaS: agregação/`GROUP BY`/paginação no Postgres; UI só renderiza `{ rows, resumo }`; export Excel/PDF da página atual.

| Hub | Rota | RPC | Permissão | Migrations |
|-----|------|-----|-----------|------------|
| **Estoque** | `/cockpit/estoque/relatorios` | `est_rpc_relatorio` (11 slugs) | `estoque_relatorios.view` / `estoque.view` | E15 / cutover **25** |
| **BI Workflow + Omni** | `/cockpit/relatorios` | `crm_rpc_relatorio` (14 slugs) | `relatorios.view` + addon `workflow` | E16–E17 / cutover **26–27** |

**Slugs estoque:** `valor-estoque`, `skus-criticos`, `fill-rate-requisicoes`, `consumo-doh`, `giro-estoque`, `estoque-sem-movimento`, `excesso-maximo`, `poder-terceiros`, `remessa-retorno-baixa`, `lead-time-req`, `ajustes-shrinkage`.

**Slugs omni:** `omni-fila`, `omni-sla`, `omni-volume`, `omni-heatmap`, `omni-handover`, `omni-por-canal`.

**Slugs workflow:** `wf-receita`, `wf-carteira`, `wf-velocidade`, `wf-conversao-etapas`, `wf-dwell`, `wf-forecast`, `wf-gargalos`, `wf-produtividade`.

**Pós-apply prod (validação):**
```sql
SELECT routine_name FROM information_schema.routines
WHERE routine_name IN ('est_rpc_relatorio', 'crm_rpc_relatorio');
SELECT tgname FROM pg_trigger WHERE tgname LIKE 'trg_crm_%thread%';
```

---

## Changelog app / cutovers (2026-08-31 → 2026-09-01) — pendente prod

Registrar aqui tudo homologado em **dev** e ainda **não** em produção (além do bundle finance abaixo).

| Data | Pacote | Dev | Prod | Doc detalhado | Notas |
|------|--------|-----|------|---------------|-------|
| 2026-09-16 | **BI: Workflow + Omnichannel + SLA writers** | ✅ SQL MCP + UI | ⏳ pedido explícito | cutover **26–27** · § Pacote Relatórios | `202609161900` + `202609161910`; hub `/cockpit/relatorios` |
| 2026-09-16 | **Estoque: relatórios SaaS (RPC)** | ✅ SQL MCP + UI | ⏳ pedido explícito | cutover **25** · § Pacote Relatórios | `202609161800`; hub `/cockpit/estoque/relatorios` |
| 2026-09-16 | **Estoque: planilha req auto-atender** | ✅ SQL MCP + UI | ⏳ pedido explícito | cutover **23** · §10.8.3 | `202609161600`; `req_planilha_auto_atender` |
| 2026-09-16 | **Estoque: rastreio origem requisição** | ✅ SQL MCP + UI | ⏳ pedido explícito | cutover **22** · §10.8 | `202609161500`; `codigo_origem`/`sistema_origem`/`requisitante_nome_origem` |
| 2026-09-16 | **Estoque: adapter ATC + codigo_externo** | ✅ SQL MCP + UI | ⏳ pedido explícito | cutover **21** · §10.8.2 | `202609161400`; addon `estoque_req_adapter_atc` |
| 2026-09-16 | **Cockpit: templates prontos por grupo** | ✅ SQL MCP + UI | ⏳ pedido explícito | `lib/cockpit/templates.ts` | `202609161200`; home Omni vs Estoque; sem builder de KPI |
| 2026-09-15 | **Estoque: aprovação interna de requisições** | ✅ SQL MCP + UI | ⏳ pedido explícito | § Pacote Estoque · §10.5 | `202609152000`; flag/aprovador/mínimo; fila `/requisicoes/aprovacao`; auditoria |
| 2026-09-15 | **Estoque: Cardex dual remessa ↔ TERCEIROS** | ✅ SQL MCP + UI | ⏳ pedido explícito | § Pacote Estoque | `202609151910`; 2 linhas Cardex; poder por lote; UI sem impacto sintético |
| 2026-09-15 | **Estoque: locais BRANCO + TERCEIROS** | ✅ SQL MCP + UI | ⏳ pedido explícito | § Pacote Estoque | `202609151900`; seed automático por empresa |
| 2026-09-13 | **Estoque: remessa baixa + retorno SKU** | ✅ SQL MCP + UI | ⏳ pedido explícito | § Pacote Estoque | `202609131800_est_remessa_baixa_e_retorno_sku.sql`; liquidação retorno/baixa; industrialização |
| 2026-09-13 | **Estoque: remessa multi-local + obs lote** | ✅ SQL MCP + UI | ⏳ pedido explícito | § Pacote Estoque | `202609131700_est_remessa_item_local_obs_lote.sql`; local de saída por linha; observação no lote; nº `REM-…` |
| 2026-09-13 | **Estoque: fix RPC decremento saldo (CHECK)** | ✅ SQL MCP | ⏳ pedido explícito | § Pacote Estoque | `202609131500_fix_rpc_saldo_decremento_check.sql`; transferência/saída não quebram mais em `est_saldos_quantidade_check` |
| 2026-09-12 | **Empresas: Contato do Setor Financeiro** | ✅ SQL MCP + UI | ⏳ pedido explícito | `supabase/migrations/202609121200_empresas_contato_financeiro.sql` | `financeiro_nome`, `financeiro_email`, `financeiro_telefone`, `financeiro_chave_pix` em `public.empresas` |
| 2026-09-12 | **Estoque Fase 4.1: RPCs Movimento e Batch** | ✅ SQL MCP | ⏳ pedido explícito | § Pacote Estoque | `202609121100_estoque_rpcs_movimento_e_batch.sql`; REGRA DE OURO atômica Cardex+Saldo |
| 2026-09-12 | **Estoque Fase 4.1: Tabelas e RLS** (15 tabelas + 60 policies RLS) | ✅ SQL MCP + catálogo RBAC | ⏳ pedido explícito | § Pacote Estoque | `202609121000_estoque_modulo_tabelas_rls.sql`; Fundação do addon `estoque` |
| 2026-09-11 | **Ativos CC = departamento** | ✅ SQL MCP + UI | ⏳ pedido explícito | § Pacote Cadastros | `202609111900`; drop `centro_custo` texto |
| 2026-09-11 | **Ativos / patrimônio** + stub fórmulas | ✅ SQL MCP + UI | ⏳ pedido explícito | § Pacote Cadastros | `202609111800`; RBAC `ativos` |
| 2026-09-11 | **SKUs reforma fiscal** (IBS/CBS/IS) | ✅ SQL MCP + UI | ⏳ pedido explícito | § Pacote Cadastros | `202609111700` |
| 2026-09-11 | **Conversões UM genéricas** + telas separadas | ✅ SQL MCP + UI | ⏳ pedido explícito | § Pacote Cadastros | `202609111600` |
| 2026-09-11 | **SKUs** — mestre + UM conversão + de-para | ✅ SQL MCP + UI | ⏳ pedido explícito | § Pacote Cadastros | `202609111500`; RBAC `skus` |
| 2026-09-11 | **Pessoas** — campos mestre em `crm_leads` | ✅ SQL MCP + UI | ⏳ pedido explícito | § Pacote Cadastros | `202609111400` · apply precoce revertido no mesmo dia |
| 2026-09-11 | **Plataforma entitlements** | ✅ SQL MCP + código | ⏳ pedido explícito | § Pacote Cadastros | `202609111200` · apply precoce revertido no mesmo dia |
| 2026-09-07 | **Fase 5: analytics/test_runs/ACL Omni** | ✅ SQL MCP + validação em andamento | ⏳ aplicar no próximo cutover | Agente testes Fase 5 | `202609072000`, `202609072030`, `202609072045`; tenant obrigatório no runner, helpers fechados, RBAC analytics e associação departamental self-read |
| 2026-09-07 | **RAG RBAC + source/tenant integrity** | ✅ SQL MCP + 3 baterias verdes | ⏳ aplicar no próximo cutover | Agente testes Fase 4 | `202609071900_phase4_knowledge_rbac.sql` |
| 2026-09-07 | **RBAC por ação em leads/canais/roteamento** | ✅ SQL MCP + 3 baterias verdes | ⏳ aplicar no próximo cutover | Agente testes Fase 3 | `202609071530_phase3_permission_rls.sql`; cria `check_permission`, remove policy aberta de roteamento e sincroniza RLS com a matriz |
| 2026-09-03 | **Webhooks de saída** (`empresa_webhooks`) para alarme de canal desconectado | ✅ SQL | ✅ SQL MCP 2026-09-06 · ⏳ código no release | Canais | Migration `202609031700` + unique URL; POST JSON + HMAC `X-HuginFlow-Signature` |
| 2026-09-03 | **Sessão omnichannel — caminho único** (`SessionPersistenceService`) + heal órfãos DEV | ✅ código + heal DEV | ⏳ código no release · heal opcional | § Sessão única | Sem migration; writers unificados; monitor `scripts/omnichannel/monitor-orphan-sessions.sql` |
| 2026-09-02 | **Analytics BI — backend MVP** (índices + RPCs relatórios) | ✅ SQL | ✅ SQL MCP 2026-09-06 | § Analytics BI | Migrations `202609021200`–`202609021204`; hub UI consome via `crm_rpc_relatorio` (16/09) |
| 2026-09-02 | **test_runs** (módulo testes RN3) | ✅ SQL | ✅ SQL MCP 2026-09-06 | — | `202609021800_test_runs.sql` |
| 2026-09-03 | **crm_interacoes UPDATE RLS** (apagar mensagem WhatsApp) | ✅ SQL | ✅ SQL MCP 2026-09-06 | — | `202609031630_crm_interacoes_update_rls.sql` |
| 2026-09-01 | **Alerta desconexão canais inbound** (modal cockpit para toda a empresa) | ✅ SQL | ✅ SQL MCP 2026-09-06 · ⏳ código no release | § Performance + canais realtime | Migration `202609011200_crm_canais_realtime.sql`; código: banner + modal |
| 2026-09-01 | **Cockpit: menu hambúrguer** (sidebar colapsável + redimensionamento do frame) | ✅ | ⏳ código no release | — | `CockpitShell.tsx` + `CockpitShell.module.css`; sem SQL |
| 2026-09-02 | Encaminhamento: resumo IA editável (remove handover estruturado) | ✅ | ✅ SQL · ⏳ código no release | § Encaminhamento IA | Migration `202609021000` (**prod SQL ✅**) |
| 2026-09-01 | Handover estruturado (briefing ao encaminhar card cross-funil) | ↩️ revertido | ↩️ revertido | § Encaminhamento IA | Substituído por resumo IA em `observacao` + urgência em `metadados.prioridade` |
| 2026-08-31 | Encaminhamento inteligente CRM (roteamento dept/funil/operador) | ✅ | ⏳ código no release | cutover CRM ago/2026 | Sem SQL; `cardRedirectRouting.ts` + admin client no preview |
| 2026-08-31 | Performance + Realtime (chat inbox RPC, `crm_cards` realtime) | ✅ | ✅ SQL MCP 2026-09-06 | § Performance + Realtime | Migrations `202608311200`, `202608311230` |
| 2026-08-31 | Documentos WhatsApp (OCR, match, anexo, auto-reply) | ✅ | ✅ SQL MCP 2026-09-06 · ⏳ código no release | § Documentos WhatsApp | Migration `202608311400` + código |
| 2026-08-31 | Documentos — fallback determinístico (`DocumentCardEnsurer`) + heurística nome (`Boleto.pdf`) | ✅ | ⏳ código no release | § Documentos WhatsApp | Sem SQL novo; nunca fica sem card/encaminhamento |
| 2026-08-31 | Simulador: mic + anexo PDF/imagem (homolog sem Evolution) | ✅ | ⏳ código no release | § Documentos WhatsApp | Código `simulador/actions.ts` |
| 2026-08-31 | Kanban: data **e hora** de criação no card | ✅ | ⏳ código no release | § CRM UX | Só código |
| 2026-08-31 | Sessões por departamento (falante ativo + iniciar conversa) MVP | ✅ | ✅ SQL MCP 2026-09-06 · ⏳ código no release | § Sessões por departamento | Migration `202608311800` + código |
| 2026-08-31 | Chat interno: avisar responsável quando terceiro/IA altera o card | ✅ | ⏳ código no release | § CRM UX | `notifyCardResponsavel.ts`; usa `chat_messages` |

**Legenda:** ✅ aplicado · ⏳ pendente · 📋 planejado (não implementado)

### Go-live sugerido (um PR / um release)

1. Backup prod.
2. SQL: bundle finance (seção abaixo) **ou** só os pacotes CRM se finance for cutover separado.
3. SQL: performance (`202608311200`, `202608311230`) + documentos (`202608311400`) + sessões (`202608311800`) + **canais realtime** (`202609011200_crm_canais_realtime`) + handover revert (`202609021000` — **já em prod**).
4. Dados NASU: prompt + KB documentos (ver cutover documentos).
5. Deploy código (todos os cutovers acima + menu cockpit + alertas canais + encaminhamento IA).
6. Env: `OPENAI_API_KEY`, `HUGINFLOW_DOCUMENT_PIPELINE` (opcional).
7. Smoke: kanban realtime, **simulador áudio + anexos**, boleto/PIX, menção chat interno, data/hora card, iniciar conversa multi-depto, **encaminhar card cross-funil com resumo IA editável**, **menu hambúrguer redimensiona o frame**, **modal ao desconectar canal WhatsApp ativo**.

**Roteiro de teste manual (completo):** [homologacao/script-teste-pacote-crm-ago-2026.md](./homologacao/script-teste-pacote-crm-ago-2026.md)

---

## Analytics BI — backend MVP (2026-09-02)

> Planejamento: [planejamento-modulo-relatorios-bi.md](./planejamento-modulo-relatorios-bi.md)

**Status:** backend base Dev/Prod ✅ · hardening Fase 5 Dev ✅ / Prod ⏳ · front-end relatórios Dev ✅

| Migration | Conteúdo |
|-----------|----------|
| `202609021200_analytics_step1_indexes.sql` | Índices em `crm_interacoes`, `crm_conversas`, `crm_chat_threads`, `crm_cards` |
| `202609021201_analytics_step2_thread_metrics.sql` | Colunas SLA em `crm_chat_threads` (sem triggers) |
| `202609021202_analytics_step3_crm_columns.sql` | `crm_cards.finalizado_em`, `pipeline_stages.probabilidade_fechamento`, `crm_cards_history.empresa_id` |
| `202609021203_analytics_step4a_helpers_view.sql` | `vw_analytics_threads`, `fn_analytics_period_metrics`, helpers |
| `202609021204_analytics_step4b_rpcs.sql` | RPCs MVP + grants |

**RPCs disponíveis (via `supabase.rpc` autenticado):**

| RPC | Uso |
|-----|-----|
| `fn_analytics_overview` | Visão geral (conversas abertas + CRM) |
| `fn_analytics_conversations_kpis` | 6 KPIs com tendência vs período anterior |
| `fn_analytics_conversations_daily` | Série diária para gráficos |
| `fn_analytics_traffic_heatmap` | Heatmap dow × hour |

Parâmetros comuns: `p_empresa_id` (opcional), `p_data_inicio`, `p_data_fim`, `p_filtros` (jsonb: `departamento_ids`, `canal_ids`, `pipeline_ids`).

**Pendente (fase 2):** triggers SLA, materialized views CRM, tabelas `analytics_ia_events` / CSAT.

---

## Pacote versionado (aplicar em prod)

Gerado por:

```bash
node scripts/supabase/prod-deploy/build-bundle.mjs
```

| # | ID | Arquivo fonte | O que faz |
|---|-----|---------------|-----------|
| 1 | `empresas_campos_contrato` | `scripts/migrations/empresas_campos_contrato.sql` | Campos jurídicos do MSA em `empresas` |
| 2 | `finance_ar_step1` | `supabase/migrations/202606031200_finance_ar_step1.sql` | Enum meio pagamento, `finance_contas_receber`, `finance_contas_receber_baixas`, RLS |
| 3 | `finance_ar_step2_routines` | `supabase/migrations/202606031400_finance_ar_step2_routines.sql` | RPCs criar/baixa/cancelar, `fn_finance_dashboard`, view relatório |
| 4 | `etapa3_helpers` | `supabase/migrations/202606031600_etapa3_helpers.sql` | `current_empresa_id`, `enqueue_event`, etc. |
| 5 | `etapa3_outbox` | `supabase/migrations/202606031601_etapa3_outbox.sql` | `integration_outbox` |
| 6 | `etapa3_auditoria` | `supabase/migrations/202606031602_etapa3_auditoria.sql` | `finance_audit_log` |
| 7 | `etapa3_triggers` | `supabase/migrations/202606031603_etapa3_triggers.sql` | Triggers baixa/conta, `numero_documento` |
| 8 | `etapa3_rls` | `supabase/migrations/202606031604_etapa3_rls.sql` | RLS + REVOKE DML direto nas tabelas base |
| 9 | `etapa3_grants` | `supabase/migrations/202606031605_etapa3_grants.sql` | GRANT EXECUTE nas RPCs |
| 10 | `finance_ar_parcelas` | `supabase/migrations/202606041200_finance_ar_parcelas.sql` | Parcelas/mensalidades, `p_parcelas_total`, view atualizada |
| 11 | `finance_contratos` | `supabase/migrations/202606161200_finance_contratos.sql` | Contratos comerciais + serviços extras |

**SQL consolidado:** `scripts/supabase/prod-deploy/out/huginflow-prod-pending.sql`

**Manifesto JSON:** `scripts/supabase/prod-deploy/out/MANIFEST.json`

> **Além deste bundle**, no cutover CRM de ago/set 2026 aplicar também (ver docs de cutover):  
> `202608311200_chat_inbox_rpc.sql`, `202608311230_crm_cards_realtime.sql`, `202608311400_crm_card_files_whatsapp_inbound.sql`,  
> `202608311800_crm_chat_threads_active_speaker.sql`,  
> `202609011200_crm_canais_realtime.sql` (alerta desconexão canais — **dev ✅ MCP 2026-09-01**),  
> `202609021000_revert_handover_structured.sql` (**prod ✅ MCP 2026-09-02**).  
> ~~`202609011200_empresas_crm_handover_config.sql`~~ revertido.

---

## Como aplicar em produção

### Opção A — SQL Editor (recomendado para revisão)

1. Backup no Dashboard prod.
2. Abra `scripts/supabase/prod-deploy/out/huginflow-prod-pending.sql`.
3. Execute no **SQL Editor** do projeto prod (pode dividir por blocos `-- BUNDLE:` se preferir).
4. Confira erros; a view de parcelas usa `DROP VIEW` antes de recriar.
5. Em seguida aplique as migrations dos cutovers performance/documentos/sessões/canais/handover (arquivos em `supabase/migrations/20260831*.sql`, `202609011200_crm_canais_realtime.sql`, `202609021000_*.sql`).  
   > **Handover revert (`202609021000`):** já aplicado em prod via MCP em 2026-09-02 — validar com query abaixo.  
   > **Canais realtime (`202609011200_crm_canais_realtime`):** aplicado em dev via MCP em 2026-09-01 — **pendente prod**.

### Opção B — Supabase CLI

```bash
supabase login
supabase link --project-ref zmypzexefjbovuknjlid
# Aplicar migrations da pasta supabase/migrations na ordem dos timestamps
supabase db push
```

Inclua também `scripts/migrations/empresas_campos_contrato.sql` (não está em `supabase/migrations/`).

### Validação pós-deploy

```sql
-- Tabelas
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name LIKE 'finance%';

-- RPC parcelada (11 parâmetros)
SELECT pg_get_function_arguments(p.oid)
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'sp_finance_criar_conta_receber'
ORDER BY p.pronargs DESC LIMIT 1;

-- Colunas de parcelamento
SELECT column_name FROM information_schema.columns
WHERE table_name = 'finance_contas_receber'
  AND column_name IN ('parcela_numero', 'parcelas_total', 'grupo_parcelamento_id');

-- Cutover ago/set 2026 (performance + documentos)
SELECT proname FROM pg_proc WHERE proname = 'get_recent_chat_conversations';
SELECT tablename FROM pg_publication_tables
WHERE pubname = 'supabase_realtime' AND tablename IN ('crm_cards', 'crm_canais');
-- Esperado: crm_cards (kanban) + crm_canais (alerta desconexão inbound)
SELECT column_name FROM information_schema.columns
WHERE table_name = 'crm_card_files'
  AND column_name IN ('source', 'interacao_id', 'provider_message_id');

-- Sessões por departamento
SELECT to_regclass('public.crm_chat_threads'), to_regclass('public.crm_phone_active_speaker');

-- Handover: colunas revertidas (2026-09-02)
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'empresas'
  AND column_name = 'crm_handover_config';
-- Deve retornar 0 linhas

SELECT name FROM supabase_migrations.schema_migrations
WHERE name = 'revert_handover_structured';
```

---

## Migrations só no dev (sem arquivo local no repo)

Estas foram aplicadas no dev durante sync/clone e **não entram no bundle**. O schema delas pode já existir parcialmente no prod; revisar antes de reaplicar:

- `pre_kb_tables`
- `extra_tables_prod`
- `sync_prod_crm_canais_token_column`
- `sync_prod_schema_drift_columns`
- `fix_crm_interacoes_column_types_prod_match`
- `sync_prod_storage_policies`
- `rls_superadmin_crm_omnichannel`
- `enable_realtime_omnichannel_tables`
- `crm_conversas_one_row_per_message`

Para exportar o SQL delas do dev (se necessário):

```bash
# Requer SUPABASE_DB_PASSWORD_DEV em .env.clone.local
node scripts/supabase/fetch-migrations-pg.mjs  # adaptar ref para dev
```

Ou via MCP / SQL Editor do dev: tabela `supabase_migrations.schema_migrations`.

---

## Mapeamento dev MCP ↔ arquivo local (parcelas)

No dev, a migration de parcelas foi registrada em 3 entradas MCP; no repo está unificada em um arquivo:

| Dev (schema_migrations) | Repo |
|-------------------------|------|
| `finance_ar_parcelas` | `202606041200_finance_ar_parcelas.sql` (parte colunas) |
| `finance_ar_parcelas_rpc` | mesmo arquivo (função) |
| `finance_ar_parcelas_view_grants_v2` | mesmo arquivo (view + grants) |

Use **sempre o arquivo local** como fonte da verdade para produção.

---

## Sessão omnichannel — caminho único (2026-09-03)

**Status:** Dev ✅ (código + heal) · Prod ⏳ (deploy código; heal só se houver órfãos)

### O que mudou
- API canônica: `src/lib/omnichannel/SessionPersistenceService.ts` (`persistMessage`, `ensureSession`, `healOrphanSession`)
- Writers migrados: Evolution, simulador, omni send/start, AiResponse, DocumentInbound/CardEnsurer, TriageActionExecutor, webhook `[provider]`
- `bindCardToInboundSession` **cria** thread se faltar (não deixa só `card.conversa_id`)
- Isolamento: todo write filtra `empresa_id`; `departamento_id` vem do funil/card/thread/active speaker da mesma empresa

### Heal / monitor
- Monitor: [`scripts/omnichannel/monitor-orphan-sessions.sql`](../scripts/omnichannel/monitor-orphan-sessions.sql)
- Heal script: [`scripts/omnichannel/heal-orphan-sessions.mjs`](../scripts/omnichannel/heal-orphan-sessions.mjs) (`--dry-run` disponível)
- **DEV (2026-09-03):** 4 cards órfãos (`Cliente Teste*`) reparados — 24 linhas `crm_conversas` + 4 `crm_chat_threads`
- **PROD:** rodar o monitor; se `remaining_orphans > 0`, aplicar heal com service role **por empresa** (nunca cruzar tenant)

### Fora desta entrega
- FK / tipar `crm_cards.conversa_id` como `uuid`
- Unificar `crm_conversas` + `crm_interacoes` em uma só tabela

