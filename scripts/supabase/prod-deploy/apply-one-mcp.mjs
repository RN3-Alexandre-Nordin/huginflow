/**
 * Applies one migration via MCP apply_migration using payload JSON.
 * Reads payload from out/mcp-payloads/{name}.json
 * Usage: node apply-one-mcp.mjs finance_ar_step1
 *
 * This script outputs MCP call instructions; actual MCP call is done by agent.
 * For automation, reads SQL and validates payload size.
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const name = process.argv[2];
if (!name) {
  console.error("Usage: node apply-one-mcp.mjs <migration_name>");
  process.exit(1);
}

const payloadPath = resolve(import.meta.dirname, `out/mcp-payloads/${name}.json`);
if (!existsSync(payloadPath)) {
  console.error(`Payload not found: ${payloadPath}`);
  process.exit(1);
}

const payload = JSON.parse(readFileSync(payloadPath, "utf8"));
console.log(JSON.stringify(payload));
