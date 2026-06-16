# Deploy pendente: Supabase dev → produção

> **Documento canônico (atualizar a cada mudança):** [MIGRACAO-SUPABASE.md](./MIGRACAO-SUPABASE.md)

Comparativo entre projetos:

| Ambiente | Project ref | Dashboard |
|----------|-------------|-----------|
| **Dev** | `vujqukqsfwmoezwyuoum` | [ragnar-dev](https://supabase.com/dashboard/project/vujqukqsfwmoezwyuoum) |
| **Prod** | `zmypzexefjbovuknjlid` | [ragnar-prod](https://supabase.com/dashboard/project/zmypzexefjbovuknjlid) |

**Última migration no prod:** `fix_channel_cascade_delete` (abril/2026)

**Prod não possui hoje:** nenhuma tabela `finance_*`, RPCs AR, nem campos de contrato em `empresas`.

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

**SQL consolidado:** `scripts/supabase/prod-deploy/out/ragnar-prod-pending.sql`

**Manifesto JSON:** `scripts/supabase/prod-deploy/out/MANIFEST.json`

---

## Como aplicar em produção

### Opção A — SQL Editor (recomendado para revisão)

1. Backup no Dashboard prod.
2. Abra `scripts/supabase/prod-deploy/out/ragnar-prod-pending.sql`.
3. Execute no **SQL Editor** do projeto prod (pode dividir por blocos `-- BUNDLE:` se preferir).
4. Confira erros; a view de parcelas usa `DROP VIEW` antes de recriar.

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
