/**
 * Copia dados (public), storage e usuários Auth de prod → dev.
 * Requer schema já aplicado no dev. Usa service_role de .env e .env.local.
 */
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../..");

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

const prod = loadEnvFile(resolve(root, ".env"));
const dev = loadEnvFile(resolve(root, ".env.local"));

const prodSb = createClient(prod.NEXT_PUBLIC_SUPABASE_URL, prod.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const devSb = createClient(dev.NEXT_PUBLIC_SUPABASE_URL, dev.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const TABLES = [
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

async function fetchAll(table) {
  const rows = [];
  const page = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await prodSb.from(table).select("*").range(from, from + page - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < page) break;
    from += page;
  }
  return rows;
}

/** Colunas presentes em prod mas ausentes no histórico de migrations — ignorar no upsert */
const STRIP_COLUMNS = {
  crm_canais: [], // token agora existe no dev após sync_prod_crm_canais_token_column
};

function sanitizeRow(table, row) {
  const strip = STRIP_COLUMNS[table];
  if (!strip?.length) return row;
  const out = { ...row };
  for (const k of strip) delete out[k];
  return out;
}

const UPSERT_CONFLICT = {
  chat_read_markers: "usuario_id,context_type,context_id",
  usuarios_departamentos: "usuario_id,departamento_id",
};

async function upsertBatch(table, rows) {
  if (!rows.length) return;
  const chunk = 200;
  const clean = rows.map((r) => sanitizeRow(table, r));
  const onConflict = UPSERT_CONFLICT[table] || "id";
  for (let i = 0; i < clean.length; i += chunk) {
    const { error } = await devSb.from(table).upsert(clean.slice(i, i + chunk), { onConflict });
    if (error) throw new Error(`${table} upsert: ${error.message}`);
  }
}

async function clearDev(table) {
  const { error } = await devSb.from(table).delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (error && !error.message.includes("does not exist")) {
    await devSb.from(table).delete().gte("created_at", "1970-01-01").catch(() => {});
  }
}

async function syncStorage() {
  for (const bucket of BUCKETS) {
    await devSb.storage.createBucket(bucket, { public: false }).catch(() => {});

    async function walk(prefix = "") {
      const { data: items, error } = await prodSb.storage.from(bucket).list(prefix, { limit: 1000 });
      if (error) return;
      for (const item of items || []) {
        const path = prefix ? `${prefix}/${item.name}` : item.name;
        if (!item.id && item.name && !item.metadata?.size) {
          await walk(path);
          continue;
        }
        const { data: blob, error: dl } = await prodSb.storage.from(bucket).download(path);
        if (dl || !blob) continue;
        const buf = Buffer.from(await blob.arrayBuffer());
        await devSb.storage.from(bucket).upload(path, buf, { upsert: true });
      }
    }
    await walk();
    console.log(`  storage/${bucket}`);
  }
}

async function syncAuth() {
  const { data, error } = await prodSb.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  let n = 0;
  for (const u of data.users) {
    const { data: ex } = await devSb.auth.admin.getUserById(u.id);
    if (ex?.user) {
      await devSb.auth.admin.updateUserById(u.id, {
        email: u.email,
        user_metadata: u.user_metadata,
        app_metadata: u.app_metadata,
      });
    } else {
      const res = await devSb.auth.admin.createUser({
        id: u.id,
        email: u.email,
        email_confirm: true,
        user_metadata: u.user_metadata,
        app_metadata: u.app_metadata,
        password: crypto.randomUUID() + "Aa1!",
      });
      if (res.error && !String(res.error.message).includes("already")) {
        console.warn(`  auth skip ${u.email}:`, res.error.message);
        continue;
      }
    }
    n++;
  }
  return n;
}

async function main() {
  console.log("Auth (antes de public.usuarios — FK auth.users)...");
  const authN = await syncAuth();
  console.log(`  ${authN} usuários`);

  console.log("Limpando dev (ordem reversa)...");
  for (const t of [...TABLES].reverse()) {
    await clearDev(t).catch(() => {});
  }

  console.log("Copiando tabelas...");
  for (const t of TABLES) {
    const rows = await fetchAll(t).catch((e) => {
      if (String(e).includes("does not exist") || String(e).includes("404")) return [];
      throw e;
    });
    if (rows.length) {
      await upsertBatch(t, rows);
      console.log(`  ${t}: ${rows.length}`);
    }
  }

  console.log("Storage...");
  await syncStorage();

  console.log("Concluído.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
