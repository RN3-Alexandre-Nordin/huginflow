/**
 * Applies migrations 2-17 payloads via Supabase MCP apply_migration (prod).
 * Stops on first failure. Usage: node apply-batch-via-mcp.mjs
 */
import { readFileSync, readdirSync } from "fs";
import { config } from "dotenv";
import { resolve } from "path";

const root = resolve(import.meta.dirname, "../../..");
config({ path: resolve(root, ".env") });
config({ path: resolve(root, ".env.local"), override: true });

const manifest = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "out/MANIFEST.json"), "utf8")
);
const migrations = manifest.bundleFiles.slice(1);
const payloadDir = resolve(import.meta.dirname, "out/mcp-payloads");
const projectRef = "zmypzexefjbovuknjlid";
const url = `https://mcp.supabase.com/mcp?project_ref=${projectRef}`;

const results = [];

for (const item of migrations) {
  const payloadPath = resolve(payloadDir, `${item.id}.json`);
  const { name, query } = JSON.parse(readFileSync(payloadPath, "utf8"));
  process.stdout.write(`[${name}] applying... `);

  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "apply_migration",
      arguments: { name, query },
    },
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_PAT}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }

    const isError =
      !res.ok ||
      parsed.error ||
      (parsed.result?.isError === true) ||
      (typeof parsed.result?.content?.[0]?.text === "string" &&
        /error|failed/i.test(parsed.result.content[0].text) &&
        !/success/i.test(parsed.result.content[0].text));

    if (isError) {
      results.push({
        name,
        status: "FAIL",
        httpStatus: res.status,
        response: parsed,
      });
      console.log("FAIL");
      console.log(JSON.stringify({ results }, null, 2));
      process.exit(1);
    }

    results.push({ name, status: "SUCCESS", httpStatus: res.status });
    console.log("ok");
  } catch (err) {
    results.push({ name, status: "FAIL", error: err.message });
    console.log("FAIL");
    console.log(JSON.stringify({ results }, null, 2));
    process.exit(1);
  }
}

console.log(JSON.stringify({ results }, null, 2));
