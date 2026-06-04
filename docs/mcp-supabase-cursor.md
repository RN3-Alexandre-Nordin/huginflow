# MCP Supabase no Cursor (Ragnar)

O Supabase mantém um **MCP oficial** (`https://mcp.supabase.com/mcp`) — não precisamos reinventar o servidor. Ele permite:

- Listar tabelas, extensões, migrations
- Executar SQL e aplicar migrations (`apply_migration`)
- Gerar types TypeScript do schema
- Buscar documentação Supabase
- (Plano pago) **branches** de banco dev/prod

## Instalação rápida

### 1. Copiar config do projeto

```powershell
cd D:\Sistemas\ragnar
copy .cursor\mcp.json.example .cursor\mcp.json
```

O projeto dev **ragnar-dev** já está em `.cursor/mcp.json` como `vujqukqsfwmoezwyuoum`.  
Se recriar o projeto, atualize esse `project_ref`.

O projeto prod atual do Ragnar: `zmypzexefjbovuknjlid` (já no exemplo, só leitura).

### 2. Ativar no Cursor

1. **Cursor Settings → Tools & MCP**
2. Confirme que aparecem `supabase-ragnar-dev` e `supabase-ragnar-prod-readonly`
3. Na primeira conexão, o Cursor abre o **login OAuth** da Supabase — autorize a org correta
4. Reinicie o Cursor se as tools não aparecerem

### 3. Testar

No chat do Cursor:

> "Use o MCP supabase-ragnar-dev: liste todas as tabelas do schema public."

> "Compare se existem as tabelas crm_conversas e crm_interacoes."

## Dois servidores — por quê?

| Servidor | Projeto | Modo | Uso |
|----------|---------|------|-----|
| `supabase-ragnar-dev` | Novo projeto dev | Leitura + escrita | Criar schema, migrations, seed de teste |
| `supabase-ragnar-prod-readonly` | Projeto atual | `read_only=true` | Consultar schema prod, copiar DDL, debug |

**Nunca** use MCP com escrita no projeto de produção com dados reais de clientes.

## Replicar tabelas prod → dev (com MCP)

Peça ao agente (com MCP dev conectado):

1. No **prod-readonly**: `list_tables` e exportar estrutura (ou `execute_sql` com queries de catálogo).
2. No **dev**: `apply_migration` com o SQL do schema (sem dados de clientes).
3. Confirmar RPC `match_knowledge_base`, extensão `vector`, bucket `card_attachments`.
4. Rodar `scripts/migrations/add_metadados_to_crm_cards.sql` se faltar coluna.

Fluxo manual equivalente: `docs/supabase-dev-prod.md`.

## Segurança

- Remova qualquer connection string com senha em arquivos do repo (use OAuth MCP).
- Revogue senha do banco se ela foi commitada em `.continue/mcpServers/`.
- Mantenha aprovação manual de tool calls no Cursor.
- `.env.local` continua com as API keys do app; MCP é só para o agente no IDE.

## Referências

- [Supabase MCP Docs](https://supabase.com/docs/guides/getting-started/mcp)
- [Dashboard → Connect → MCP](https://supabase.com/dashboard/project/_/settings/general) (URL pronta por projeto)
- Skill do agente: `.cursor/skills/supabase-mcp/SKILL.md`
