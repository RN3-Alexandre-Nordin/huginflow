# MCP Supabase no Cursor (Ragnar)

O Supabase mantém um **MCP oficial** (`https://mcp.supabase.com/mcp`) — não precisamos reinventar o servidor. Ele permite:

- Listar tabelas, extensões, migrations
- Executar SQL e aplicar migrations (`apply_migration`)
- Gerar types TypeScript do schema
- Buscar documentação Supabase

## Projetos Ragnar

| Servidor MCP | Project ref | Modo | Uso |
|--------------|-------------|------|-----|
| `supabase-ragnar-dev` | `vujqukqsfwmoezwyuoum` | Leitura + escrita | Migrations, schema, testes |
| `supabase-ragnar-prod` | `zmypzexefjbovuknjlid` | Leitura + escrita |

**Migrations em produção:** prefira `node scripts/supabase/prod-deploy/apply-bundle.mjs` (senha Postgres no `.env`). Para escrita via MCP em prod, use temporariamente `.cursor/mcp.prod-write.json.example` — veja seção abaixo.

---

## Instalação rápida

### 1. Copiar config do projeto

```powershell
cd D:\Sistemas\ragnar
copy .cursor\mcp.json.example .cursor\mcp.json
```

### 2. Conectar no Cursor (OAuth)

1. **Cursor Settings → Tools & MCP**
2. Deve aparecer `supabase-ragnar-dev` e `supabase-ragnar-prod-readonly`
3. Se houver **"Needs authentication"** ou botão **Connect**, clique e faça login
4. No browser Supabase, use a conta da org RN3 (`rn3@rn3.com.br`) e autorize o Cursor
5. **Escolha a organização correta** — a que contém os projetos `ragnar-dev` e `ragnar-prod`
6. Repita **Connect** para **cada** servidor (dev e prod-readonly são OAuth separados)
7. **Reinicie o Cursor** (Ctrl+Shift+P → "Reload Window") se as tools não aparecerem

### 3. Testar

No chat do Cursor:

> "Use o MCP supabase-ragnar-dev: liste as tabelas do schema public."

> "Use supabase-ragnar-prod-readonly: quais migrations existem no prod?"

---

## Corrigir problemas comuns

### Servidor vermelho / "Needs authentication"

- Clique **Connect** ao lado do servidor em Settings → Tools & MCP
- Login com `rn3@rn3.com.br` (senha da **conta** Supabase, não a senha do Postgres)
- Se o browser não abrir: desative bloqueador de pop-up para `supabase.com`
- Após autorizar, **Reload Window** no Cursor

### Servidor não aparece na lista

- Confirme que existe `.cursor/mcp.json` no projeto (não só o `.example`)
- Cada entrada precisa de `"type": "http"` (obrigatório no Cursor atual)
- Reinicie o Cursor após editar `mcp.json`

### Duplicata: plugin global + projeto

Se o Supabase aparecer **duas vezes** (plugin global + `.cursor/mcp.json`):

1. Settings → Tools & MCP
2. **Desative** o plugin Supabase global (ou o do projeto — mantenha só um)
3. Prefira o `.cursor/mcp.json` do projeto Ragnar (refs corretos dev/prod)

### `apply_migration` falha em prod-readonly

Esperado: prod-readonly usa `read_only=true`. DDL retorna:

`cannot execute ALTER TABLE in a read-only transaction`

**Opções:**

| Opção | Quando usar |
|-------|-------------|
| MCP **dev** | Sempre que possível — aplicar schema no dev primeiro |
| Script `apply-bundle.mjs` | Deploy controlado em prod (recomendado) |
| MCP prod com escrita | Só em janela de manutenção — ver `mcp.prod-write.json.example` |

### Escrita temporária em prod (manutenção)

1. Faça backup no Dashboard prod
2. Substitua temporariamente `.cursor/mcp.json` pelo conteúdo de `mcp.prod-write.json.example`
3. **Remova** `supabase-ragnar-prod-readonly` (não use os dois no mesmo projeto ao mesmo tempo)
4. Reload Window → Connect no `supabase-ragnar-prod`
5. Aplique migrations
6. Restaure `mcp.json` do exemplo padrão (dev + prod-readonly)

### OAuth não funciona (alternativa com PAT)

1. [Supabase → Access Tokens](https://supabase.com/dashboard/account/tokens) → gerar token
2. Adicione no `.env.local` (não commitar): `SUPABASE_ACCESS_TOKEN=sbpat_...`
3. Config alternativa:

```json
{
  "mcpServers": {
    "supabase-ragnar-dev": {
      "type": "http",
      "url": "https://mcp.supabase.com/mcp?project_ref=vujqukqsfwmoezwyuoum&features=database,docs,development,debugging",
      "headers": {
        "Authorization": "Bearer ${env:SUPABASE_ACCESS_TOKEN}"
      }
    }
  }
}
```

> Nem todas as versões do Cursor expandem `${env:...}` em headers — se falhar, use OAuth.

---

## Segurança

- **Não** commitar senha Postgres nem PAT no repositório
- **Não** colocar senha de login Supabase.com no chat ou no código
- Mantenha aprovação manual de tool calls no Cursor
- Prod com escrita MCP só em manutenção planejada

## Referências

- [Supabase MCP Docs](https://supabase.com/docs/guides/getting-started/mcp)
- [Dashboard → Connect → MCP](https://supabase.com/dashboard/project/vujqukqsfwmoezwyuoum?showConnect=true&tab=mcp)
- Skill: `.cursor/skills/supabase-mcp/SKILL.md`
