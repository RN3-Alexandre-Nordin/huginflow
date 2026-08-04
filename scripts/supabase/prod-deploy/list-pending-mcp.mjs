/**
 * Aplica migrations pendentes no prod via arquivos _mcp_*.json gerados em out/.
 * Uso pelo agente: ler cada JSON e chamar apply_migration no MCP supabase-huginflow-prod.
 *
 *   node scripts/supabase/prod-deploy/list-pending-mcp.mjs
 */
import { readFileSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, 'out');
const manifest = JSON.parse(readFileSync(resolve(outDir, 'MANIFEST.json'), 'utf8'));

const done = new Set(process.argv.slice(2));
const pending = manifest.bundleFiles.filter((f) => !done.has(f.id));

for (const item of pending) {
  const jsonPath = resolve(outDir, `_mcp_${item.id}.json`);
  try {
    const payload = JSON.parse(readFileSync(jsonPath, 'utf8'));
    console.log(JSON.stringify({ id: item.id, bytes: payload.query.length, jsonPath }));
  } catch {
    console.error(`MISSING: ${jsonPath}`);
  }
}
