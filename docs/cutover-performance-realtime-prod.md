# Cutover para produção — Performance + Realtime (Kanban e Cockpit)

> **Objetivo:** transferir para **produção** todas as melhorias de performance e sincronização em tempo real aplicadas em **dev** (agosto/2026), sem perder nenhum passo.
>
> **Dev:** `vujqukqsfwmoezwyuoum` · **Prod:** `zmypzexefjbovuknjlid`
>
> **Índice de deploy:** [supabase-prod-deploy-pending.md](./supabase-prod-deploy-pending.md)

---

## Resumo do pacote

| Área | O que muda para o usuário |
|------|---------------------------|
| **Chat sidebar** | Inbox carrega muito mais rápido; menos reloads quando vários usuários conversam |
| **Cockpit / dashboards** | Menos subscriptions Realtime duplicadas; polling mais leve em dev |
| **Kanban (funis)** | Mover card atualiza a tela de **outros usuários** sem F5 |
| **Canais inbound** | Modal automático se canal ativo desconectar (toda a empresa no cockpit) |
| **Perfil** | Menos queries repetidas de `getMyProfile` por request |

---

## Checklist rápido

```
[ ] 1. Backup do banco prod (Dashboard Supabase)
[ ] 2. Aplicar migrations SQL (ordem abaixo)
[ ] 3. Validar RPC e Realtime no SQL Editor prod
[ ] 4. Merge/deploy do código (main → imagem VPS / GitHub Actions)
[ ] 5. Testes de smoke (seção 6)
[ ] 6. Marcar este doc como concluído (data + responsável)
```

---

## 1. Migrations Supabase (obrigatório em prod)

Aplicar **nesta ordem**, no projeto **prod** (`zmypzexefjbovuknjlid`).

### 1.1 `202608311200_chat_inbox_rpc.sql`

**Arquivo:** `supabase/migrations/202608311200_chat_inbox_rpc.sql`

**O que faz:**
- Índices em `chat_messages (empresa_id, created_at DESC)` e `chat_read_markers (usuario_id)`
- RPC `get_recent_chat_conversations()` — substitui 4+ queries no server action do chat

**Como aplicar:**

```bash
# Opção A — MCP Cursor (namespace prod, somente após revisão)
# apply_migration name=chat_inbox_rpc + conteúdo do arquivo

# Opção B — SQL Editor prod
# Colar e executar o conteúdo completo do arquivo
```

**Validação:**

```sql
-- Deve retornar 1 linha
SELECT proname FROM pg_proc WHERE proname = 'get_recent_chat_conversations';

-- Deve listar crm_cards NÃO; chat_messages sim nos índices novos
SELECT indexname FROM pg_indexes
WHERE indexname IN ('idx_chat_messages_empresa_created', 'idx_chat_read_markers_usuario');
```

---

### 1.2 `202608311230_crm_cards_realtime.sql`

**Arquivo:** `supabase/migrations/202608311230_crm_cards_realtime.sql`

**O que faz:**
- Adiciona `crm_cards` à publicação `supabase_realtime` (sem isso o kanban **nunca** sincroniza entre browsers)

**SQL:**

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_cards;
```

**Validação:**

```sql
SELECT tablename FROM pg_publication_tables
WHERE pubname = 'supabase_realtime' AND tablename = 'crm_cards';
-- Esperado: 1 linha
```

> **Nota:** Se o comando falhar com “already member of publication”, a migration já foi aplicada — seguir em frente.

---

### 1.3 `202609011200_crm_canais_realtime.sql`

**Arquivo:** `supabase/migrations/202609011200_crm_canais_realtime.sql`

**O que faz:**
- Adiciona `crm_canais` à publicação `supabase_realtime`
- Permite que **todos os usuários do cockpit** da empresa vejam o modal quando um canal inbound ativo (`connected` → `disconnected`) perde conexão com o provedor (Evolution, Z-API, Meta, etc.)

**SQL (idempotente):**

```sql
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'crm_canais'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_canais;
  END IF;
END $$;
```

**Validação:**

```sql
SELECT tablename FROM pg_publication_tables
WHERE pubname = 'supabase_realtime' AND tablename = 'crm_canais';
-- Esperado: 1 linha
```

**Código associado (deploy junto com este SQL):**

| Arquivo | Função |
|---------|--------|
| `src/hooks/useChannelConnectionAlerts.ts` | Monitora `crm_canais` por `empresa_id` |
| `src/contexts/ChannelConnectionAlertContext.tsx` | Provider global no cockpit |
| `src/components/channels/ChannelDisconnectModal.tsx` | Modal para todos os usuários da empresa |
| `src/lib/omnichannel/channel-connection.ts` | Regras `connected` → `disconnected` |
| `src/app/(app)/cockpit/CockpitShell.tsx` | Integra o provider |

**Smoke test:**
1. Canal WhatsApp conectado em `/cockpit/configuracoes/canais`
2. Desconectar instância no Evolution (ou `UPDATE crm_canais SET status = 'disconnected'` onde estava `connected`)
3. Usuários logados no cockpit da mesma empresa devem ver o modal
4. Admin: botão “Reconectar canais”; operador: mensagem para acionar administrador
5. Ao reconectar (`status` → `connected`), modal some

**Status:** dev ✅ MCP 2026-09-01 · prod ⏳ pendente

---

### 1.4 Migrations relacionadas (fora deste pacote, mas já usadas em dev)

Estas **não** fazem parte do pacote performance/realtime, mas aparecem no histórico recente de dev:

| Migration | Arquivo | Quando aplicar em prod |
|-----------|---------|-------------------------|
| `must_change_password` | `supabase/migrations/202608281200_usuarios_must_change_password.sql` | Se prod ainda não tiver a coluna |
| RLS funis NASU (treinamento) | Aplicada via MCP em dev (`nasu_treinamento_rls_funis`) | **Somente** se replicar tenant NASU em prod; exportar SQL do dev ou refazer migration dedicada |

---

## 2. Deploy da aplicação (código)

Após as migrations, fazer deploy da branch que contém estes arquivos.

### 2.1 Arquivos novos

| Arquivo | Função |
|---------|--------|
| `src/lib/auth/getMyProfile.ts` | Perfil com `React cache()` |
| `src/lib/query/polling.ts` | Intervalo de polling (120s dev / 30s prod) |
| `src/contexts/CockpitRealtimeContext.tsx` | Realtime único no layout (evita canais duplicados) |
| `src/hooks/useKanbanRealtime.ts` | Sync do kanban via Realtime |

### 2.2 Arquivos alterados

| Arquivo | Mudança |
|---------|---------|
| `src/app/(app)/cockpit/actions.ts` | Delega `getMyProfile` para `lib/auth/getMyProfile` |
| `src/app/(app)/cockpit/crm/chat-actions.ts` | `getRecentConversations` usa RPC |
| `src/hooks/useCockpitRealtime.ts` | Filtros por `empresa_id` / `userId` |
| `src/app/(app)/cockpit/layout.tsx` | `CockpitRealtimeProvider` + props no chat sidebar |
| `src/components/chat/GlobalChatSidebar.tsx` | React Query, debounce 800ms, realtime filtrado |
| `src/components/kanban/KanbanBoard.tsx` | Hook `useKanbanRealtime` |
| `src/app/(app)/cockpit/crm/funis/[id]/page.tsx` | Props de filtro para realtime |
| `src/app/(app)/cockpit/_components/OperatorDashboard.tsx` | `useCockpitLastEvent` + polling |
| `src/app/(app)/cockpit/_components/ManagerDashboard.tsx` | idem |
| `src/app/(app)/cockpit/_components/SuperAdminDashboard.tsx` | idem |
| `src/app/(app)/cockpit/_components/ProductivityModal.tsx` | polling via helper |
| `src/app/(app)/cockpit/_components/BottleneckModal.tsx` | idem |
| `src/hooks/useWorkflowActivity.ts` | polling via helper |
| `package.json` | Scripts `dev:turbo` e `dev:prod` (só dev local) |

### 2.3 Arquivo removido

| Arquivo | Substituído por |
|---------|-----------------|
| `src/app/(app)/cockpit/CockpitRealtimeManager.tsx` | `CockpitRealtimeProvider` em `contexts/` |

### 2.4 Deploy prod (referência)

Seguir o fluxo habitual do projeto:

- [deploy-vps-github-actions.md](./deploy-vps-github-actions.md)
- [MIGRACAO-SUPABASE.md](./MIGRACAO-SUPABASE.md)

Ordem recomendada: **migrations primeiro → build/deploy depois**.

---

## 3. O que NÃO vai para produção

| Item | Motivo |
|------|--------|
| Exclusão Windows Defender em `D:\Sistemas\huginflow` | Otimização só da máquina de dev |
| `npm run dev:turbo` / `dev:prod` | Scripts locais; prod usa `build` + `start` na VPS |
| Polling 120s em dashboards | Ativo apenas quando `NODE_ENV=development` |

---

## 4. Comportamento esperado após cutover

### Chat (sidebar flutuante)

- Abrir cockpit com 2+ usuários na mesma empresa
- Enviar mensagem direta ou em card
- Badge e ordem da inbox atualizam em ~1s (com debounce, não instantâneo a cada tecla)
- Network: 1 RPC `get_recent_chat_conversations` por refresh (não 4+ selects)

### Kanban

- Usuário A e B no **mesmo funil** (`/cockpit/crm/funis/{id}`)
- A arrasta card para outra coluna
- B vê o card mudar de coluna **sem refresh** (1–3s)
- DevTools → WS: canal `kanban-{pipelineId}` ativo

### Cockpit

- Apenas **um** conjunto de canais Realtime por sessão (não triplicar ao abrir dashboard)

---

## 5. Testes de smoke (prod)

Executar com **dois browsers/usuários** da mesma empresa:

1. **Login** — cockpit carrega sem erro 500
2. **Chat** — enviar DM; outro usuário vê badge atualizar
3. **Kanban** — mover card; segundo usuário vê movimento
4. **SQL** — RPC e publication conforme seção 1
5. **Regressão** — criar card, editar card, filtros “Meus cards” / “Finalizados”
6. **Canais** — desconectar canal ativo; modal aparece para 2+ usuários da empresa; reconectar remove o alerta

Registrar resultado em [testes-go-live-resultados.md](./testes-go-live-resultados.md) (opcional).

---

## 6. Rollback

### Banco

```sql
-- Remover realtime do kanban (se necessário)
ALTER PUBLICATION supabase_realtime DROP TABLE public.crm_cards;

-- Remover realtime de canais (se necessário)
ALTER PUBLICATION supabase_realtime DROP TABLE public.crm_canais;

-- Remover RPC (app antigo ainda funciona se redeploy da versão anterior)
DROP FUNCTION IF EXISTS public.get_recent_chat_conversations();
```

Índices podem permanecer (só ajudam performance).

### App

Redeploy da imagem/commit **anterior** ao merge deste pacote.

---

## 7. Troubleshooting

| Sintoma | Causa provável | Ação |
|---------|----------------|------|
| Kanban não sincroniza | `crm_cards` fora da publication | Seção 1.2 |
| Modal de canal não aparece | `crm_canais` fora da publication | Seção 1.3 |
| Chat lento / erro inbox | RPC não existe em prod | Seção 1.1 |
| Realtime conecta mas não eventos | RLS bloqueia SELECT | Usuários devem ver o card na mesma empresa/funil |
| Só quem move vê mudança | Código novo não deployado | Seção 2 |
| WebSocket falha | Firewall/proxy | Prod: confirmar WSS para Supabase |

---

## 8. Histórico

| Data | Ambiente | Ação | Responsável |
|------|----------|------|-------------|
| 2026-08-31 | Dev | Migrations + código aplicados | — |
| 2026-09-01 | Dev | `crm_canais_realtime` + alertas canais (código) | MCP |
| | Prod | Pendente | |

---

## 9. Comandos úteis (dev local — referência)

```bash
# Dev normal
npm run dev

# Dev mais rápido (Turbopack)
npm run dev:turbo

# Simular produção local (treinamento com muitos usuários)
npm run dev:prod
```

**Defender (Windows):** Configurações → Segurança do Windows → Exclusões → pasta `D:\Sistemas\huginflow`

---

*Documento gerado para o pacote **performance + realtime** (agosto/2026). Atualizar a seção 8 ao concluir o cutover em prod.*
