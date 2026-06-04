/** Gera migrations-prod.json via Postgres (senha em SUPABASE_DB_PASSWORD_PROD). */
import pg from "pg";
import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const ref = "zmypzexefjbovuknjlid";
const pass = process.env.SUPABASE_DB_PASSWORD_PROD;
if (!pass) {
  console.error("SUPABASE_DB_PASSWORD_PROD não definida");
  process.exit(1);
}

const url = `postgresql://postgres.${ref}:${encodeURIComponent(pass)}@db.${ref}.supabase.co:5432/postgres`;
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

const __dirname = dirname(fileURLToPath(import.meta.url));

await client.connect();
const { rows } = await client.query(`
  SELECT version, name, array_to_string(statements, E'\\n\\n') AS sql
  FROM supabase_migrations.schema_migrations
  ORDER BY version
`);
await client.end();

writeFileSync(resolve(__dirname, "migrations-prod.json"), JSON.stringify(rows, null, 2));
console.log(`OK: ${rows.length} migrations`);
