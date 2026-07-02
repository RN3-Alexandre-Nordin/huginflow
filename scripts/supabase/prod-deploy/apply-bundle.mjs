/**
 * Aplica o bundle de migrations pendentes no Supabase de produção.
 *
 * Requer SUPABASE_DB_PASSWORD_PROD em .env ou variável de ambiente.
 *
 *   node scripts/supabase/prod-deploy/apply-bundle.mjs
 *   node scripts/supabase/prod-deploy/apply-bundle.mjs --dry-run
 */
import pg from "pg";
import { config } from "dotenv";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../../..");

config({ path: resolve(root, ".env") });
config({ path: resolve(root, ".env.local"), override: true });

const PROD_REF = "zmypzexefjbovuknjlid";
const dryRun = process.argv.includes("--dry-run");

const pass = process.env.SUPABASE_DB_PASSWORD_PROD;
if (!pass) {
  console.error("Defina SUPABASE_DB_PASSWORD_PROD em .env");
  process.exit(1);
}

const manifestPath = resolve(__dirname, "out/MANIFEST.json");
if (!existsSync(manifestPath)) {
  console.error("Manifest não encontrado. Rode: node scripts/supabase/prod-deploy/build-bundle.mjs");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const url = `postgresql://postgres.${PROD_REF}:${encodeURIComponent(pass)}@db.${PROD_REF}.supabase.co:5432/postgres`;

const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});

console.log(`Alvo: ${manifest.target}`);
if (dryRun) console.log("Modo dry-run — nenhum SQL será executado.\n");

await client.connect();

for (const item of manifest.bundleFiles) {
  const filePath = resolve(root, item.path);
  if (!existsSync(filePath)) {
    console.error(`Arquivo ausente: ${item.path}`);
    process.exit(1);
  }

  const sql = readFileSync(filePath, "utf8").trim();
  process.stdout.write(`[${item.id}] ${item.path} ... `);

  if (dryRun) {
    console.log(`skip (${sql.length} bytes)`);
    continue;
  }

  try {
    await client.query(sql);
    console.log("ok");
  } catch (err) {
    console.log("FAIL");
    console.error(err.message);
    await client.end();
    process.exit(1);
  }
}

await client.end();
console.log("\nBundle aplicado com sucesso.");
