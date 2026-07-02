import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";

const root = resolve(import.meta.dirname, "../../..");
const manifest = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "out/MANIFEST.json"), "utf8")
);
const outDir = resolve(import.meta.dirname, "out/mcp-payloads");
mkdirSync(outDir, { recursive: true });

const migrations = manifest.bundleFiles.slice(1);

for (const item of migrations) {
  const sql = readFileSync(resolve(root, item.path), "utf8").trim();
  const stripped = sql.replace(/\/\*[\s\S]*\*\/\s*$/, "").trim();
  writeFileSync(
    resolve(outDir, `${item.id}.json`),
    JSON.stringify({ name: item.id, query: stripped }),
    "utf8"
  );
  console.log(`${item.id}: ${stripped.length} bytes`);
}

console.log(`\nBuilt ${migrations.length} payloads in out/mcp-payloads/`);
