/**
 * Gera bundle SQL para deploy em produção (zmypzexefjbovuknjlid).
 *
 * Uso:
 *   node scripts/supabase/prod-deploy/build-bundle.mjs
 *
 * Saída:
 *   scripts/supabase/prod-deploy/out/ragnar-prod-pending.sql
 *   scripts/supabase/prod-deploy/out/MANIFEST.json
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../../..");
const outDir = resolve(__dirname, "out");

/** Ordem de execução — apenas arquivos versionados no repositório */
const BUNDLE = [
  {
    id: "empresas_campos_contrato",
    path: "scripts/migrations/empresas_campos_contrato.sql",
    prodStatus: "pending",
    description: "Campos jurídicos em empresas (contrato MSA)",
  },
  {
    id: "finance_ar_step1",
    path: "supabase/migrations/202606031200_finance_ar_step1.sql",
    prodStatus: "pending",
    description: "AR etapa 1: enum, tabelas, RLS base",
  },
  {
    id: "finance_ar_step2_routines",
    path: "supabase/migrations/202606031400_finance_ar_step2_routines.sql",
    prodStatus: "pending",
    description: "AR etapa 2: RPCs, view relatório, dashboard",
  },
  {
    id: "etapa3_helpers",
    path: "supabase/migrations/202606031600_etapa3_helpers.sql",
    prodStatus: "pending",
    description: "AR etapa 3: helpers tenant, fn_total_baixas, enqueue_event",
  },
  {
    id: "etapa3_outbox",
    path: "supabase/migrations/202606031601_etapa3_outbox.sql",
    prodStatus: "pending",
    description: "AR etapa 3: integration_outbox",
  },
  {
    id: "etapa3_auditoria",
    path: "supabase/migrations/202606031602_etapa3_auditoria.sql",
    prodStatus: "pending",
    description: "AR etapa 3: finance_audit_log",
  },
  {
    id: "etapa3_triggers",
    path: "supabase/migrations/202606031603_etapa3_triggers.sql",
    prodStatus: "pending",
    description: "AR etapa 3: triggers baixa/conta, numero_documento",
  },
  {
    id: "etapa3_rls",
    path: "supabase/migrations/202606031604_etapa3_rls.sql",
    prodStatus: "pending",
    description: "AR etapa 3: RLS atualizado, revoke DML direto",
  },
  {
    id: "etapa3_grants",
    path: "supabase/migrations/202606031605_etapa3_grants.sql",
    prodStatus: "pending",
    description: "AR etapa 3: grants RPC + SELECT",
  },
  {
    id: "finance_ar_parcelas",
    path: "supabase/migrations/202606041200_finance_ar_parcelas.sql",
    prodStatus: "pending",
    description: "Parcelamento: colunas, RPC com p_parcelas_total, view",
  },
  {
    id: "finance_contratos",
    path: "supabase/migrations/202606161200_finance_contratos.sql",
    prodStatus: "pending",
    description: "Contratos comerciais + serviços extras",
  },
  {
    id: "finance_contrato_gerar_ar",
    path: "supabase/migrations/202606171200_finance_contrato_gerar_ar.sql",
    prodStatus: "pending",
    description: "Gerar AR do contrato: contrato_id + RPC",
  },
  {
    id: "finance_contrato_ar_fixes",
    path: "supabase/migrations/202606181200_finance_contrato_ar_fixes.sql",
    prodStatus: "pending",
    description: "Fixes AR/contrato: numero_documento único, RPC gerar contas",
  },
  {
    id: "finance_contrato_vencimento_meio",
    path: "supabase/migrations/202606191200_finance_contrato_vencimento_meio.sql",
    prodStatus: "pending",
    description: "Meio pagamento setup, mensalidades_total, vencimento contrato",
  },
  {
    id: "finance_meses_vigencia_fix",
    path: "supabase/migrations/202606201200_finance_meses_vigencia_fix.sql",
    prodStatus: "pending",
    description: "Correção contagem de meses de vigência (12 vs 13 mensalidades)",
  },
  {
    id: "finance_contrato_limite_usuarios",
    path: "supabase/migrations/202606211200_finance_contrato_limite_usuarios.sql",
    prodStatus: "pending",
    description: "Limite de usuários autorizados no contrato (OS/PDF)",
  },
  {
    id: "finance_contrato_os_testemunhas",
    path: "supabase/migrations/202606211400_finance_contrato_os_testemunhas.sql",
    prodStatus: "pending",
    description: "Número OS automático + testemunhas no contrato (MSA/PDF)",
  },
];

/** Migrations registradas no dev mas sem arquivo local (sync/clone) — revisar antes do prod */
const DEV_ONLY_MCP_MIGRATIONS = [
  "pre_kb_tables",
  "extra_tables_prod",
  "sync_prod_crm_canais_token_column",
  "sync_prod_schema_drift_columns",
  "fix_crm_interacoes_column_types_prod_match",
  "sync_prod_storage_policies",
  "rls_superadmin_crm_omnichannel",
  "enable_realtime_omnichannel_tables",
  "crm_conversas_one_row_per_message",
];

mkdirSync(outDir, { recursive: true });

const parts = [];
const manifest = {
  generatedAt: new Date().toISOString(),
  target: "zmypzexefjbovuknjlid (ragnar-prod)",
  source: "vujqukqsfwmoezwyuoum (ragnar-dev)",
  bundleFiles: [],
  devOnlyWithoutLocalSql: DEV_ONLY_MCP_MIGRATIONS,
  applyInstructions: [
    "1. Backup do banco prod (Dashboard → Database → Backups).",
    "2. Revisar out/ragnar-prod-pending.sql em staging ou horário de baixo tráfego.",
    "3. Executar no SQL Editor do projeto prod OU via supabase db push linkado ao prod.",
    "4. Registrar no schema_migrations do prod (se usar CLI) ou manter log interno.",
    "5. Validar: tabelas finance_*, RPC sp_finance_*, view vw_finance_contas_receber_relatorio.",
  ],
};

for (const item of BUNDLE) {
  const fullPath = resolve(root, item.path);
  if (!existsSync(fullPath)) {
    console.error(`Arquivo não encontrado: ${item.path}`);
    process.exit(1);
  }
  const sql = readFileSync(fullPath, "utf8");
  const header = [
    "",
    "-- " + "=".repeat(76),
    `-- BUNDLE: ${item.id}`,
    `-- ${item.description}`,
    `-- Arquivo: ${item.path}`,
    "-- " + "=".repeat(76),
    "",
  ].join("\n");

  parts.push(header + sql.trim() + "\n");
  manifest.bundleFiles.push({
    id: item.id,
    path: item.path,
    bytes: Buffer.byteLength(sql, "utf8"),
    prodStatus: item.prodStatus,
    description: item.description,
  });
}

const footer = [
  "",
  "-- " + "=".repeat(76),
  "-- FIM DO BUNDLE",
  "-- " + "=".repeat(76),
  "",
].join("\n");

const outputSql = parts.join("\n") + footer;
const sqlPath = resolve(outDir, "ragnar-prod-pending.sql");
const manifestPath = resolve(outDir, "MANIFEST.json");

writeFileSync(sqlPath, outputSql, "utf8");
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

console.log(`OK: ${manifest.bundleFiles.length} arquivos → ${sqlPath}`);
console.log(`Manifest: ${manifestPath}`);
console.log(`Tamanho total: ${(Buffer.byteLength(outputSql) / 1024).toFixed(1)} KB`);
