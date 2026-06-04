/**
 * Extrai migrations do dump MCP (agent-tools) para JSON usado pelo clone.
 * Uso: node scripts/supabase/parse-migrations-export.mjs <caminho-dump.txt>
 */
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const input = process.argv[2];
if (!input) {
  console.error("Uso: node parse-migrations-export.mjs <dump.txt>");
  process.exit(1);
}

const raw = readFileSync(resolve(input), "utf8");
const marker = "<untrusted-data-";
const start = raw.indexOf(marker);
if (start === -1) throw new Error("Formato MCP não encontrado");
const innerStart = raw.indexOf("[", start);
const innerEnd = raw.lastIndexOf("]");
let jsonStr = raw.slice(innerStart, innerEnd + 1);
let rows;
try {
  rows = JSON.parse(jsonStr);
} catch {
  rows = JSON.parse(jsonStr.replace(/\\"/g, '"'));
}
const out = resolve(__dirname, "migrations-prod.json");
writeFileSync(out, JSON.stringify(rows, null, 2), "utf8");
console.log(`OK: ${rows.length} migrations → ${out}`);
