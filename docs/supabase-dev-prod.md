# Supabase: separar desenvolvimento e produção

Hoje o HuginFlow usa **um único projeto Supabase** para `npm run dev` e para o Docker na VPS. O objetivo é:

| Ambiente | Onde roda | Supabase | Evolution |
|----------|-----------|----------|-----------|
| **Dev** | PC (`npm run dev`) | Projeto **ragnar-dev** (novo) | `evo-dev.rn3.tec.br` |
| **Prod** | VPS (`docker-compose.prod.yml`) | Projeto **ragnar-prod** (atual ou novo) | `evo.rn3.tec.br` |

O código **já suporta** URLs diferentes por arquivo `.env` — não precisa alterar `environment.ts` para Supabase (só Evolution usa `_DEV`/`_PROD`).

---

## 1. Criar o projeto Supabase de desenvolvimento

1. Acesse [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. **New project** → nome sugerido: `ragnar-dev`
3. Região: mesma da produção (latência e compliance)
4. Anote:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY` (somente servidor, nunca no front)

5. No `.env.local` (PC):

```env
NEXT_PUBLIC_SUPABASE_URL=https://XXXX.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

6. Na VPS `/opt/ragnar/.env` (produção): mantenha as chaves do projeto **atual/prod**.

7. GitHub Actions (build Docker): secrets `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` = **produção**.

---

## 2. Replicar tabelas de um projeto para outro

**Sim, dá para replicar o esquema** (tabelas, índices, FKs, RLS, funções). **Dados** são opcionais (recomendado: dev vazio ou só seed de teste).

### O que o HuginFlow usa (checklist)

**Tabelas principais**

- `empresas`, `usuarios`, `grupos_acesso`, `departamentos`
- `pipelines`, `pipeline_stages`, `pipeline_grupo_acesso`, `pipeline_stage_grupo_acesso`
- `crm_leads`, `crm_cards`, `crm_cards_history`, `crm_card_files`
- `crm_canais`, `crm_canais_roteamento`
- `crm_conversas` (uma linha por mensagem; `sessao_id` agrupa o thread), `crm_interacoes`
- `knowledge_sources`, `knowledge_base`
- `chat_messages`, `chat_read_markers`

**RPC / extensões**

- Função `match_knowledge_base` (RAG / embeddings)
- Extensão `vector` (pgvector), se usada na base de conhecimento

**Storage**

- Bucket `card_attachments` (anexos do kanban)

**Auth**

- Usuários do Supabase Auth **não** vão no dump SQL — recrie login de teste no projeto dev ou importe via Dashboard.

---

## 3. Métodos para copiar o schema

### Opção A — Supabase CLI (recomendado)

No PC, com [Supabase CLI](https://supabase.com/docs/guides/cli) instalado:

```bash
# Login
supabase login

# Vincular projeto ORIGEM (produção atual)
supabase link --project-ref SEU_PROJECT_REF_PROD

# Exportar só schema (sem dados)
supabase db dump -f schema.sql --schema public

# Desvincular e vincular DESTINO (dev)
supabase link --project-ref SEU_PROJECT_REF_DEV

# Aplicar no dev (revise o SQL antes; remova linhas perigosas se houver)
psql "postgresql://postgres.[ref]:[SENHA]@aws-0-[regiao].pooler.supabase.com:6543/postgres" -f schema.sql
```

Ou pelo **SQL Editor** do projeto dev: cole o conteúdo de `schema.sql` e execute em partes se for grande.

### Opção B — Dashboard (manual)

1. Projeto **origem** → **Database** → **Schema Visualizer** / migrations existentes
2. **SQL Editor** → gere ou copie DDL das tabelas (se tiver migrations salvas)
3. Projeto **destino** → cole e execute

### Opção C — pg_dump (avançado)

Connection string em **Settings → Database** (URI com senha):

```bash
pg_dump "postgresql://..." --schema-only --no-owner --no-privileges -f schema.sql
psql "postgresql://...-dev..." -f schema.sql
```

---

## 4. Clone completo prod → dev (espelho 100%)

Scripts em `scripts/supabase/`:

| Script | Função |
|--------|--------|
| `sync-data-storage-auth.mjs` | Copia **dados** (`public.*`), **Storage** (buckets/arquivos) e **Auth** (mesmos UUIDs) |
| `clone-prod-to-dev.mjs` | Alternativa via Postgres direto (requer senha DB nos dois projetos) |
| `fetch-migrations-pg.mjs` / `parse-migrations-export.mjs` | Auxiliares pontuais para gerar `migrations-prod.json` (gitignored) |

**Pré-requisito:** schema do dev igual ao prod (37 migrations + colunas extras criadas manualmente no prod).

Após o clone de schema (MCP ou migrations), rode:

```bash
node scripts/supabase/sync-data-storage-auth.mjs
```

Usa `SUPABASE_SERVICE_ROLE_KEY` de `.env` (prod) e `.env.local` (dev).

**O que é replicado**

- Todas as tabelas `public` (empresas, usuarios, CRM, RAG `knowledge_*`, chat, etc.)
- Buckets `base-conhecimento` e `card_attachments` com arquivos
- Usuários Auth (mesmo `id` — login no dev usa a **mesma senha** que em prod, ou redefina no Dashboard dev)

**Evolution / webhooks:** continuam separados (`evo-dev` + túnel local). O clone não altera instâncias WhatsApp.

---

## 5. O que **não** misturar entre ambientes

- `service_role` / `anon` keys de prod no `.env.local`
- Webhooks da Evolution prod apontando para túnel local (use sempre `evo-dev` + `ragnar-local`)

**Seed mínimo (se preferir dev vazio em vez de clone)**

1. Uma `empresa` de teste
2. Um `usuario` ligado ao seu e-mail de login Auth
3. Um `pipeline` + estágios mínimos
4. Opcional: base de conhecimento de teste

---

## 5. Depois de criar o dev

| Passo | Ação |
|-------|------|
| 1 | Rodar migration pendente: `scripts/migrations/add_metadados_to_crm_cards.sql` no **dev** (se a coluna não existir) |
| 2 | Confirmar RPC `match_knowledge_base` no dev (copiar definição do SQL do projeto prod) |
| 3 | Criar bucket `card_attachments` e políticas de storage |
| 4 | Revisar **RLS** nas tabelas (copiar policies do prod) |
| 5 | `npm run dev` com novo `.env.local` → login → criar empresa/usuário de teste |
| 6 | Health: login no cockpit e abrir Chat Omnichannel |

---

## 6. Produção (VPS)

- `.env` na VPS: **somente** chaves Supabase **prod**
- `RAGNAR_ENV=production`
- `WHATSAPP_*_PROD`, `RAGNAR_WEBHOOK_URL_PROD=https://app.ragnar.ia.br/...`
- CI/CD: secrets GitHub = prod
- **Nunca** commitar `.env.local` / `.env.production`

---

## 7. MCP no Cursor (recomendado)

Configuração pronta no repositório:

1. `copy .cursor\mcp.json.example .cursor\mcp.json`
2. Confirme `project_ref=vujqukqsfwmoezwyuoum` em `.cursor/mcp.json` (ragnar-dev)
3. Siga `docs/mcp-supabase-cursor.md` (login OAuth no Cursor)

Com MCP, o agente pode `list_tables`, `apply_migration` no **dev** e consultar o **prod** em `read_only`.

## 8. O agente consegue replicar automaticamente?

**Sim, após você ativar o MCP** (OAuth no Cursor). Sem MCP, ainda é preciso Dashboard ou CLI.

1. Exportar schema do prod (MCP read-only ou `supabase db dump`)
2. `apply_migration` no projeto dev
3. Versionar SQL em `scripts/supabase/` quando estabilizar

Cole o export do schema se quiser migrations versionadas no repo.

---

## 8. Mapa mental

```mermaid
flowchart LR
  subgraph dev [Desenvolvimento]
    PC[npm run dev]
    EnvL[.env.local]
    SBdev[(Supabase DEV)]
    EvoDev[evo-dev]
    PC --> EnvL --> SBdev
    PC --> EvoDev
  end

  subgraph prod [Produção]
    VPS[Docker VPS]
    EnvP[/opt/ragnar/.env]
    SBprod[(Supabase PROD)]
    EvoProd[evo.rn3.tec.br]
    VPS --> EnvP --> SBprod
    VPS --> EvoProd
  end
```
