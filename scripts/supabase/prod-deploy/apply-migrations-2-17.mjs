/**
 * Applies migrations 2-17 from MANIFEST via Supabase MCP apply_migration semantics.
 * Reads stripped SQL and applies with pg, recording in supabase_migrations.schema_migrations.
 * Usage: node apply-migrations-2-17.mjs
 */
import pg from "pg";
import { config } from "dotenv";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const __dirname = import.meta.dirname;
const root = resolve(__dirname, "../../..");

config({ path: resolve(root, ".env") });
config({ path: resolve(root, ".env.local"), override: true });

const PROD_REF = "zmypzexefjbovuknjlid";
const pass = process.env.SUPABASE_DB_PASSWORD_PROD;
if (!pass) {
  console.error("SUPABASE_DB_PASSWORD_PROD not set");
  process.exit(1);
}

const manifest = JSON.parse(
  readFileSync(resolve(__dirname, "out/MANIFEST.json"), "utf8")
);

const migrations = manifest.bundleFiles.slice(1); // skip empresas_campos_contrato

function stripTrailingBlockComment(sql) {
  return sql.trim().replace(/\/\*[\s\S]*\*\/\s*$/, "").trim();
}

const url = `postgresql://postgres.${PROD_REF}:${encodeURIComponent(pass)}@db.${PROD_REF}.supabase.co:5432/postgres`;
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

await client.connect();
const results = [];

for (const item of migrations) {
  const filePath = resolve(root, item.path);
  if (!existsSync(filePath)) {
    results.push({ name: item.id, status: "FAIL", error: `File not found: ${item.path}` });
    console.log(JSON.stringify(results[results.length - 1]));
    await client.end();
    process.exit(1);
  }

  const sql = stripTrailingBlockComment(readFileSync(filePath, "utf8"));
  process.stdout.write(`[${item.id}] applying... `);

  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query(
      `INSERT INTO supabase_migrations.schema_migrations (version, name)
       VALUES ($1, $2)
       ON CONFLICT (version) DO NOTHING`,
      [item.id, item.id]
    );
    await client.query("COMMIT");
    results.push({ name: item.id, status: "SUCCESS" });
    console.log("ok");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    results.push({ name: item.id, status: "FAIL", error: err.message });
    console.log("FAIL");
    console.error(err.message);
    await client.end();
    console.log(JSON.stringify({ results }, null, 2));
    process.exit(1);
  }
}

await client.end();
console.log(JSON.stringify({ results }, null, 2));
