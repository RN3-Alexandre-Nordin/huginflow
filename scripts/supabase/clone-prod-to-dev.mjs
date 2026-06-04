/**
 * Clone completo Supabase prod → dev (schema, dados public, storage, auth users).
 *
 * Requer senhas do banco (Settings → Database):
 *   SUPABASE_DB_PASSWORD_PROD
 *   SUPABASE_DB_PASSWORD_DEV
 *
 * Chaves service_role em .env (prod) e .env.local (dev).
 *
 * Uso:
 *   node scripts/supabase/parse-migrations-export.mjs <dump-mcp.txt>   # uma vez
 *   node scripts/supabase/clone-prod-to-dev.mjs
 */
import crypto from "node:crypto";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../..");

config({ path: resolve(root, ".env") });
config({ path: resolve(root, ".env.local"), override: true });
config({ path: resolve(root, ".env.clone.local"), override: true });

const PROD_REF = "zmypzexefjbovuknjlid";
const DEV_REF = "vujqukqsfwmoezwyuoum";

const prodPass = process.env.SUPABASE_DB_PASSWORD_PROD;
const devPass = process.env.SUPABASE_DB_PASSWORD_DEV;

if (!prodPass || !devPass) {
  console.error(
    "Defina SUPABASE_DB_PASSWORD_PROD e SUPABASE_DB_PASSWORD_DEV (ou .env.clone.local)."
  );
  process.exit(1);
}

function dbUrl(ref, password) {
  const enc = encodeURIComponent(password);
  return `postgresql://postgres.${ref}:${enc}@db.${ref}.supabase.co:5432/postgres`;
}

/** Tabelas criadas fora do histórico de migrations no prod */
const EXTRA_DDL = `
CREATE TABLE IF NOT EXISTS public.knowledge_base (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  embedding vector(3072),
  source_id uuid
);

CREATE TABLE IF NOT EXISTS public.crm_card_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  card_id uuid NOT NULL REFERENCES public.crm_cards(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_type text,
  uploaded_by uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crm_canais_roteamento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canal_id uuid NOT NULL REFERENCES public.crm_canais(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  pipeline_id uuid NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  stage_id uuid NOT NULL REFERENCES public.pipeline_stages(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_card_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_canais_roteamento ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_kb_org_id ON public.knowledge_base(organization_id);

DO $$ BEGIN
  CREATE POLICY "authenticated_roteamento" ON public.crm_canais_roteamento FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "select_crm_card_files" ON public.crm_card_files FOR SELECT USING (empresa_id = get_user_empresa_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "insert_crm_card_files" ON public.crm_card_files FOR INSERT WITH CHECK (empresa_id = get_user_empresa_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "delete_crm_card_files" ON public.crm_card_files FOR DELETE USING (empresa_id = get_user_empresa_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
`;

const PUBLIC_TABLES_ORDER = [
  "empresas",
  "departamentos",
  "grupos_acesso",
  "usuarios",
  "usuarios_departamentos",
  "pipelines",
  "pipeline_stages",
  "pipeline_grupo_acesso",
  "pipeline_stage_grupo_acesso",
  "crm_canais",
  "crm_canais_roteamento",
  "crm_leads",
  "crm_cards",
  "crm_cards_history",
  "crm_card_files",
  "crm_conversas",
  "crm_interacoes",
  "knowledge_sources",
  "knowledge_base",
  "chat_messages",
  "chat_read_markers",
];

const BUCKETS = ["base-conhecimento", "card_attachments"];

async function applyMigrations(client, migrationsPath) {
  if (!existsSync(migrationsPath)) {
    throw new Error(`Arquivo não encontrado: ${migrationsPath}. Rode parse-migrations-export.mjs primeiro.`);
  }
  const migrations = JSON.parse(readFileSync(migrationsPath, "utf8"));
  for (const m of migrations) {
    const sql = m.sql || (Array.isArray(m.statements) ? m.statements.join("\n\n") : "");
    if (!sql?.trim()) continue;
    process.stdout.write(`  migration ${m.name}... `);
    try {
      await client.query(sql);
      console.log("ok");
    } catch (e) {
      if (e.message?.includes("already exists") || e.code === "42P07" || e.code === "42710") {
        console.log("skip (exists)");
      } else {
        console.log("FAIL");
        throw e;
      }
    }
  }
}

async function copyTableData(prod, dev, table) {
  const { rows } = await prod.query(`SELECT * FROM public.${table}`);
  if (rows.length === 0) return 0;

  await dev.query(`ALTER TABLE public.${table} DISABLE TRIGGER ALL`);
  const cols = Object.keys(rows[0]);
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
  const colList = cols.map((c) => `"${c}"`).join(", ");

  for (const row of rows) {
    const vals = cols.map((c) => row[c]);
    await dev.query(
      `INSERT INTO public.${table} (${colList}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
      vals
    );
  }
  await dev.query(`ALTER TABLE public.${table} ENABLE TRIGGER ALL`);
  return rows.length;
}

async function syncStorage(prodSb, devSb) {
  for (const bucket of BUCKETS) {
    const { data: list, error: listErr } = await prodSb.storage.from(bucket).list("", { limit: 1000 });
    if (listErr) {
      console.warn(`  bucket ${bucket} list:`, listErr.message);
      continue;
    }
    await devSb.storage.createBucket(bucket, { public: false }).catch(() => {});

    async function walk(prefix) {
      const { data: items } = await prodSb.storage.from(bucket).list(prefix, { limit: 1000 });
      if (!items?.length) return;
      for (const item of items) {
        const path = prefix ? `${prefix}/${item.name}` : item.name;
        if (item.id === null && item.metadata === null) {
          await walk(path);
          continue;
        }
        const { data: blob, error: dlErr } = await prodSb.storage.from(bucket).download(path);
        if (dlErr || !blob) continue;
        const buf = Buffer.from(await blob.arrayBuffer());
        await devSb.storage.from(bucket).upload(path, buf, { upsert: true, contentType: item.metadata?.mimetype });
      }
    }
    await walk("");
    console.log(`  storage ${bucket}: ok`);
  }
}

async function syncAuthUsers(prodSb, devSb) {
  const { data: list, error } = await prodSb.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  let n = 0;
  for (const u of list.users) {
    const { data: existing } = await devSb.auth.admin.getUserById(u.id);
    if (existing?.user) {
      await devSb.auth.admin.updateUserById(u.id, {
        email: u.email,
        user_metadata: u.user_metadata,
        app_metadata: u.app_metadata,
      });
    } else {
      const { error: createErr } = await devSb.auth.admin.createUser({
        id: u.id,
        email: u.email,
        email_confirm: true,
        user_metadata: u.user_metadata,
        app_metadata: u.app_metadata,
        password: crypto.randomUUID() + "Aa1!",
      });
      if (createErr && !createErr.message?.includes("already")) {
        console.warn(`  auth ${u.email}:`, createErr.message);
        continue;
      }
    }
    n++;
  }
  return n;
}

async function main() {
  function loadEnvFile(file) {
    if (!existsSync(file)) return {};
    const o = {};
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i > 0) o[t.slice(0, i)] = t.slice(i + 1).trim();
    }
    return o;
  }

  const prodEnv = loadEnvFile(resolve(root, ".env"));
  const devEnv = loadEnvFile(resolve(root, ".env.local"));

  const prodUrl = prodEnv.NEXT_PUBLIC_SUPABASE_URL || `https://${PROD_REF}.supabase.co`;
  const devUrl = devEnv.NEXT_PUBLIC_SUPABASE_URL;
  const prodKey = prodEnv.SUPABASE_SERVICE_ROLE_KEY;
  const devKey = devEnv.SUPABASE_SERVICE_ROLE_KEY;

  const prodSb = createClient(prodUrl, prodKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const devSb = createClient(devUrl, devKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const prod = new pg.Client({ connectionString: dbUrl(PROD_REF, prodPass), ssl: { rejectUnauthorized: false } });
  const dev = new pg.Client({ connectionString: dbUrl(DEV_REF, devPass), ssl: { rejectUnauthorized: false } });

  console.log("1) Conectando...");
  await prod.connect();
  await dev.connect();

  console.log("2) Schema (migrations prod)...");
  const migPath = resolve(__dirname, "migrations-prod.json");
  const preKb = `
CREATE TABLE IF NOT EXISTS public.knowledge_base (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  content text NOT NULL,
  category text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  embedding vector(3072)
);`;
  await dev.query(preKb).catch(() => {});
  await applyMigrations(dev, migPath);

  console.log("3) DDL extra (tabelas fora do histórico)...");
  await dev.query(EXTRA_DDL).catch((e) => {
    if (!e.message?.includes("already exists")) console.warn("  extra:", e.message);
  });

  console.log("4) Dados public.*...");
  await dev.query("SET session_replication_role = replica");
  for (const table of [...PUBLIC_TABLES_ORDER].reverse()) {
    await dev.query(`TRUNCATE public.${table} CASCADE`).catch(() => {});
  }
  for (const table of PUBLIC_TABLES_ORDER) {
    const n = await copyTableData(prod, dev, table);
    if (n) console.log(`  ${table}: ${n} rows`);
  }
  await dev.query("SET session_replication_role = DEFAULT");

  console.log("5) Storage...");
  await syncStorage(prodSb, devSb);

  console.log("6) Auth users...");
  const authN = await syncAuthUsers(prodSb, devSb);
  console.log(`  ${authN} usuários`);

  console.log("7) Buckets storage (SQL)...");
  const { rows: buckets } = await prod.query(
    "SELECT id, name, public, file_size_limit, allowed_mime_types FROM storage.buckets"
  );
  for (const b of buckets) {
    await dev.query(
      `INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
      [b.id, b.name, b.public, b.file_size_limit, b.allowed_mime_types]
    );
  }

  await prod.end();
  await dev.end();
  console.log("\nClone concluído.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
