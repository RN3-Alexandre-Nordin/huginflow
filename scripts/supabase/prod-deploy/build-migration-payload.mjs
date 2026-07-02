import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const root = resolve(import.meta.dirname, "../../..");
const relPath = process.argv[2];
const name = process.argv[3];
const outPath = process.argv[4];

if (!relPath || !name || !outPath) {
  console.error("Usage: node build-migration-payload.mjs <path> <name> <out.json>");
  process.exit(1);
}

const sql = readFileSync(resolve(root, relPath), "utf8").trim();
const stripped = sql.replace(/\/\*[\s\S]*\*\/\s*$/, "").trim();
writeFileSync(resolve(outPath), JSON.stringify({ name, query: stripped }), "utf8");
console.log(`payload: ${stripped.length} bytes -> ${outPath}`);
