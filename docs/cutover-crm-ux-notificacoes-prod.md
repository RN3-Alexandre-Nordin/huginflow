# Cutover para produção — CRM UX + notificação no chat interno

> **Pacote só de código** (sem migration SQL nova).  
> Aplicar no deploy da app junto com [cutover-documentos-whatsapp-prod.md](./cutover-documentos-whatsapp-prod.md) e [cutover-performance-realtime-prod.md](./cutover-performance-realtime-prod.md).  
> Índice: [supabase-prod-deploy-pending.md](./supabase-prod-deploy-pending.md)

**Dev homologado:** 2026-08-31 · **Prod:** pendente

---

## Resumo

| Área | O que muda |
|------|------------|
| **Kanban — data/hora** | Card mostra criação com hora (`Hoje 14:32`, `Ontem 09:15`, `dd/MM HH:mm`) |
| **Chat interno — avisos** | Se alguém (ou a IA) altera um card e **não** é o responsável, o responsável recebe menção `[Nome]` no chat do card (inbox + som) |

---

## Checklist cutover prod

```
[ ] 1. Deploy código (lista abaixo) — sem SQL extra
[ ] 2. Smoke: editar observação de card de outro operador → menção no chat interno
[ ] 3. Smoke: transferir responsável → novo e anterior avisados
[ ] 4. Smoke: kanban mostra hora junto da data de criação
[ ] 5. Marcar histórico
```

---

## Código

### Novos

| Arquivo |
|---------|
| `src/lib/crm/notifyCardResponsavel.ts` |

### Alterados

| Arquivo | Motivo |
|---------|--------|
| `src/app/(app)/cockpit/crm/actions.ts` | Notifica em create/edit/move/transfer/finalize/anexo |
| `src/lib/omnichannel/triage/TriageActionExecutor.ts` | Notifica responsável após CREATE_CARD da IA |
| `src/lib/omnichannel/services/DocumentCardEnsurer.ts` | Notifica em create/update de documento |
| `src/components/kanban/KanbanItem.tsx` | Data/hora de criação no rodapé do card |
| `src/hooks/useKanbanRealtime.ts` | Tipo `created_at` no card |

### Eventos que disparam aviso (ator ≠ responsável)

- Edição (observação, título, valor, prazo, cliente…)
- Troca de responsável (avisa **novo** e **anterior**)
- Move de estágio / transferência de funil
- Finalizar / reabrir
- Anexo adicionado ou removido
- Card criado já atribuído a outra pessoa
- Triagem IA / documento (ator = `IA HuginFlow`)

**Não notifica** quando o próprio responsável faz a alteração.

**Canal:** `chat_messages` com `context_type=card` + menção `[nome_completo]` (mesmo formato do `@` no chat).

**Pré-requisito prod:** RPC/inbox de chat já no pacote performance (`202608311200_chat_inbox_rpc.sql`) — ver cutover performance.

---

## Testes de smoke

1. Usuário A é responsável do card; usuário B edita observação → A vê menção no chat do card / sidebar.  
2. B troca responsável para C → C recebe “você passou a ser o responsável”; A recebe “card transferido para …”.  
3. Kanban: card criado hoje exibe `Hoje HH:mm`.

---

## Histórico

| Data | Ambiente | Ação |
|------|----------|------|
| 2026-08-31 | Dev | Código implementado |
| | Prod | Pendente |

---

*Índice: [supabase-prod-deploy-pending.md](./supabase-prod-deploy-pending.md)*
