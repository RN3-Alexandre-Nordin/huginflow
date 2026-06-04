---
name: supabase-mcp
description: >-
  Usar MCP Supabase oficial no Cursor para separar dev/prod, listar tabelas,
  aplicar migrations e replicar schema do Ragnar. Use quando o usuário pedir
  MCP Supabase, clonar banco, migrations, ou ambiente dev/prod Supabase.
---

# Supabase MCP (Ragnar)

## Servidores configurados

Ler `.cursor/mcp.json` (ou `mcp.json.example` se ausente):

- **supabase-ragnar-dev** — projeto DEV, escrita permitida (migrations, schema)
- **supabase-ragnar-prod-readonly** — projeto PROD (`zmypzexefjbovuknjlid`), só leitura

Sempre preferir MCP **dev** para `apply_migration` e `execute_sql` destrutivo.

## Tabelas críticas do Ragnar

`empresas`, `usuarios`, `grupos_acesso`, `departamentos`, `pipelines`, `pipeline_stages`, `crm_leads`, `crm_cards`, `crm_canais`, `crm_conversas`, `crm_interacoes`, `knowledge_base`, `knowledge_sources`, RPC `match_knowledge_base`.

## Workflow: novo Supabase dev

1. `list_tables` no prod-readonly (inventário).
2. Gerar SQL de schema (migrations existentes em prod via `list_migrations` ou dump manual).
3. `apply_migration` no dev com DDL (sem dados sensíveis).
4. Validar RLS, storage `card_attachments`, função RAG.
5. Atualizar `.env.local` com URL/keys do projeto dev (não commitar).
6. Documentar em `docs/supabase-dev-prod.md`.

## Regras

- Não commitar senhas de Postgres nem PAT no repositório.
- Não escrever em prod via MCP.
- Após mudanças de schema, sugerir `generate_typescript_types` se o app precisar de types gerados.

## Docs do projeto

- `docs/supabase-dev-prod.md` — separação de ambientes
- `docs/mcp-supabase-cursor.md` — instalação Cursor
- `scripts/migrations/` — SQL avulso
