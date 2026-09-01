# Migração Supabase — registro vivo (dev → produção)

> **Atualize este documento a cada alteração de schema**, migration aplicada no dev, ou item incluído no bundle de produção.

| Ambiente | Project ref | Dashboard |
|----------|-------------|-----------|
| **Dev** | `vujqukqsfwmoezwyuoum` | [huginflow-dev](https://supabase.com/dashboard/project/vujqukqsfwmoezwyuoum) |
| **Prod** | `zmypzexefjbovuknjlid` | [huginflow-prod](https://supabase.com/dashboard/project/zmypzexefjbovuknjlid) |

**Última migration no prod:** `revert_handover_structured` (2026-09-02)

**Gerar bundle SQL consolidado:**

```bash
node scripts/supabase/prod-deploy/build-bundle.mjs
```

**Saída:** `scripts/supabase/prod-deploy/out/huginflow-prod-pending.sql`

---

## Changelog (mais recente primeiro)

| Data | Migration / alteração | Dev | Prod | Arquivo | Notas |
|------|----------------------|-----|------|---------|-------|
| 2026-09-02 | `revert_handover_structured` | ✅ | ✅ | `supabase/migrations/202609021000_revert_handover_structured.sql` | Remove `crm_handover_config`, `handover_ja_feito`, `handover_pendencias` — resumo IA em `observacao` |
| 2026-09-01 | `crm_cards_handover_structured` | ↩️ revertido | ↩️ revertido | `supabase/migrations/202609011400_crm_cards_handover_structured.sql` | Substituído por resumo IA |
| 2026-09-01 | `empresas_crm_handover_config` | ↩️ revertido | ↩️ revertido | `supabase/migrations/202609011200_empresas_crm_handover_config.sql` | Substituído por resumo IA |
| 2026-08-31 | `crm_chat_threads_active_speaker` | ✅ | ⏳ | `supabase/migrations/202608311800_crm_chat_threads_active_speaker.sql` | Threads + falante ativo — [cutover-sessoes-departamento-prod.md](./cutover-sessoes-departamento-prod.md) |
| 2026-08-31 | Planejamento: sessões por departamento / falante ativo | ✅ MVP | ⏳ | `docs/planejamento-sessoes-por-departamento.md` | MVP implementado em dev |
| 2026-08-31 | Chat: notificar responsável em alteração de card | ✅ | ⏳ | `src/lib/crm/notifyCardResponsavel.ts` (+ actions/triage) | Só código — [cutover-crm-ux-notificacoes-prod.md](./cutover-crm-ux-notificacoes-prod.md) |
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

Código associado (sem SQL): documentos WhatsApp, ensurer, kanban data/hora, notify responsável — ver cutovers linkados no índice de deploy.

**Roteiro de homologação:** [homologacao/script-teste-pacote-crm-ago-2026.md](./homologacao/script-teste-pacote-crm-ago-2026.md)

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
