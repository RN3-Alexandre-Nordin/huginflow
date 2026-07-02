import { readFileSync } from "fs";
import { resolve } from "path";

const root = resolve(import.meta.dirname, "../../..");
const relPath = process.argv[2];
if (!relPath) {
  console.error("Usage: node strip-migration.mjs <relative-path>");
  process.exit(1);
}

const sql = readFileSync(resolve(root, relPath), "utf8").trim();
const stripped = sql.replace(/\/\*[\s\S]*\*\/\s*$/, "").trim();
process.stdout.write(stripped);
