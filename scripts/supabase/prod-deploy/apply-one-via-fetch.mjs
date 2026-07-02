/**
 * Applies one migration payload via Supabase MCP HTTP (same server as Cursor).
 * Usage: node apply-one-via-fetch.mjs <payload.json>
 * Requires SUPABASE_ACCESS_TOKEN in env (PAT with project access).
 */
import { readFileSync } from "fs";
import { config } from "dotenv";
import { resolve } from "path";

const root = resolve(import.meta.dirname, "../../..");
config({ path: resolve(root, ".env") });
config({ path: resolve(root, ".env.local"), override: true });

const payloadPath = process.argv[2];
if (!payloadPath) {
  console.error("Usage: node apply-one-via-fetch.mjs <payload.json>");
  process.exit(1);
}

const { name, query } = JSON.parse(readFileSync(payloadPath, "utf8"));
const projectRef = "zmypzexefjbovuknjlid";
const token = process.env.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_PAT;

if (!token) {
  console.error("SUPABASE_ACCESS_TOKEN not set");
  process.exit(1);
}

const url = `https://mcp.supabase.com/mcp?project_ref=${projectRef}`;
const body = {
  jsonrpc: "2.0",
  id: 1,
  method: "tools/call",
  params: {
    name: "apply_migration",
    arguments: { name, query },
  },
};

const res = await fetch(url, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(body),
});

const text = await res.text();
console.log(`HTTP ${res.status}`);
console.log(text);
