---
name: supabase-mcp
description: >-
  Usar MCP Supabase oficial no Cursor para separar dev/prod, listar tabelas,
  aplicar migrations e replicar schema do Ragnar. Use quando o usuário pedir
  MCP Supabase, clonar banco, migrations, ou ambiente dev/prod Supabase.
---

# Supabase MCP (Ragnar)

## Servidores (`.cursor/mcp.json`)

| Servidor | Ref | Escrita |
|----------|-----|---------|
| `supabase-ragnar-dev` | `vujqukqsfwmoezwyuoum` | Sim |
| `supabase-ragnar-prod` | `zmypzexefjbovuknjlid` | Sim |

Todas as entradas usam `"type": "http"`.

## Reconectar OAuth

1. Cursor Settings → Tools & MCP
2. Connect em cada servidor com status "Needs authentication"
3. Login `rn3@rn3.com.br` → org RN3 → autorizar
4. Reload Window

## Prod com escrita (exceção)

Usar `.cursor/mcp.prod-write.json.example` temporariamente — **não** manter dev + prod-write + prod-readonly juntos.

Deploy prod preferido: `node scripts/supabase/prod-deploy/apply-bundle.mjs` com `SUPABASE_DB_PASSWORD_PROD` no `.env`.

## Regras

- `apply_migration` e DDL destrutivo → preferir **dev**
- Não commitar PAT nem senha Postgres
- Troubleshooting completo: `docs/mcp-supabase-cursor.md`
