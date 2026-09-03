# Deploy pendente: Supabase dev → produção

> **Documento canônico (atualizar a cada mudança):** [MIGRACAO-SUPABASE.md](./MIGRACAO-SUPABASE.md)
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

**Última migration no prod:** `revert_handover_structured` (2026-09-02)

**Última migration no dev (além do acima):** pacote **Analytics BI MVP** (2026-09-02) — ver § Analytics abaixo; **+** `test_runs` (módulo testes RN3, 2026-09-02) — `202609021800_test_runs.sql` (dev ✅ MCP; prod ⏳); **+** `202609031630_crm_interacoes_update_rls.sql` (dev ✅ MCP 2026-09-03; prod ⏳)

**Analytics BI (dev ✅, prod ⏳):** `202609021200` … `202609021204` — índices, colunas SLA, RPCs `fn_analytics_*`

**Prod não possui hoje:** nenhuma tabela `finance_*`, RPCs AR, nem campos de contrato em `empresas`.

---

## Changelog app / cutovers (2026-08-31 → 2026-09-01) — pendente prod

Registrar aqui tudo homologado em **dev** e ainda **não** em produção (além do bundle finance abaixo).

| Data | Pacote | Dev | Prod | Doc detalhado | Notas |
|------|--------|-----|------|---------------|-------|
| 2026-09-03 | **Webhooks de saída** (`empresa_webhooks`) para alarme de canal desconectado | ✅ SQL | ⏳ SQL + código | Canais | Migration `202609031700`; POST JSON + HMAC `X-HuginFlow-Signature` |
| 2026-09-03 | **Sessão omnichannel — caminho único** (`SessionPersistenceService`) + heal órfãos DEV | ✅ código + heal DEV | ⏳ código + heal opcional | § Sessão única | Sem migration; writers unificados; monitor `scripts/omnichannel/monitor-orphan-sessions.sql` |
| 2026-09-02 | **Analytics BI — backend MVP** (índices + RPCs relatórios) | ✅ SQL | ⏳ SQL | § Analytics BI | Migrations `202609021200`–`202609021204`; sem triggers; app front ainda não consome |
| 2026-09-01 | **Alerta desconexão canais inbound** (modal cockpit para toda a empresa) | ✅ SQL | ⏳ SQL + código | § Performance + canais realtime | Migration `202609011200_crm_canais_realtime.sql` (dev ✅ MCP); código: `useChannelConnectionAlerts`, `ChannelDisconnectModal`, `ChannelConnectionAlertProvider` |
| 2026-09-01 | **Cockpit: menu hambúrguer** (sidebar colapsável + redimensionamento do frame) | ✅ | ⏳ código | — | `CockpitShell.tsx` + `CockpitShell.module.css`; sem SQL |
| 2026-09-02 | Encaminhamento: resumo IA editável (remove handover estruturado) | ✅ | ⏳ código | § Encaminhamento IA | Migration `202609021000` — drop `crm_handover_config` + JSONB handover (**prod SQL ✅**) |
| 2026-09-01 | Handover estruturado (briefing ao encaminhar card cross-funil) | ↩️ revertido | ↩️ revertido | § Encaminhamento IA | Substituído por resumo IA em `observacao` + urgência em `metadados.prioridade` |
| 2026-08-31 | Encaminhamento inteligente CRM (roteamento dept/funil/operador) | ✅ | ⏳ código | cutover CRM ago/2026 | Sem SQL; `cardRedirectRouting.ts` + admin client no preview |
| 2026-08-31 | Performance + Realtime (chat inbox RPC, `crm_cards` realtime) | ✅ | ⏳ | § Performance + Realtime | Migrations `202608311200`, `202608311230` |
| 2026-08-31 | Documentos WhatsApp (OCR, match, anexo, auto-reply) | ✅ | ⏳ | § Documentos WhatsApp | Migration `202608311400` + código |
| 2026-08-31 | Documentos — fallback determinístico (`DocumentCardEnsurer`) + heurística nome (`Boleto.pdf`) | ✅ | ⏳ | § Documentos WhatsApp | Sem SQL novo; nunca fica sem card/encaminhamento |
| 2026-08-31 | Simulador: mic + anexo PDF/imagem (homolog sem Evolution) | ✅ | ⏳ | § Documentos WhatsApp | Código `simulador/actions.ts` |
| 2026-08-31 | Kanban: data **e hora** de criação no card | ✅ | ⏳ | § CRM UX | Só código |
| 2026-08-31 | Sessões por departamento (falante ativo + iniciar conversa) MVP | ✅ | ⏳ | § Sessões por departamento | Migration `202608311800` + código |
| 2026-08-31 | Chat interno: avisar responsável quando terceiro/IA altera o card | ✅ | ⏳ | § CRM UX | `notifyCardResponsavel.ts`; usa `chat_messages` |

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

**Status:** Dev ✅ · Prod ⏳ · Front-end relatórios 📋 (próxima fase)

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

