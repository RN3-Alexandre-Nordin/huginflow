# Cutover para produção — Sessões por departamento (falante ativo)

> **Planejamento:** [planejamento-sessoes-por-departamento.md](./planejamento-sessoes-por-departamento.md)  
> **Índice:** [supabase-prod-deploy-pending.md](./supabase-prod-deploy-pending.md)  
> **Status:** MVP em **dev** (2026-08-31) · Prod pendente

---

## O que entrega o MVP

| Item | Comportamento |
|------|----------------|
| Threads | `crm_chat_threads` por assunto/card |
| Falante ativo | `crm_phone_active_speaker` — inbound vai para a sessão ativa |
| Iniciar conversa | Botão no card → mensagem WhatsApp + OmniChat |
| Assumir | Se outro depto está ativo, pede confirmação |
| Isolamento | Cards novos (IA/doc) ganham **thread própria** sem roubar o falante |
| Flag | `HUGINFLOW_DEPT_SESSIONS` (default **ligado**; `disabled` desliga) |

---

## Checklist prod

```
[ ] 1. Migration 202608311800_crm_chat_threads_active_speaker.sql
[ ] 2. Deploy código (lista abaixo)
[ ] 3. Smoke: 2 cards (Comercial + Financeiro) mesmo lead → iniciar em cada um → sessões diferentes
[ ] 4. Smoke: inbound após outbound Financeiro cai na sessão Financeiro
[ ] 5. Smoke: Assumir quando outro depto é falante ativo
[ ] 6. Marcar histórico
```

---

## 1. Migration

**Arquivo:** `supabase/migrations/202608311800_crm_chat_threads_active_speaker.sql`

Aplicado em **dev** via MCP em 2026-08-31.

---

## 2. Código

### Novos

| Arquivo |
|---------|
| `src/lib/omnichannel/dept-sessions-constants.ts` |
| `src/lib/omnichannel/ChatThreadService.ts` |
| `src/components/kanban/StartOmniConversationPanel.tsx` |
| `docs/planejamento-sessoes-por-departamento.md` |

### Alterados

| Arquivo |
|---------|
| `src/lib/omnichannel/ConversaHistoricoService.ts` |
| `src/lib/omnichannel/TriageService.ts` |
| `src/app/(app)/cockpit/crm/omni-actions.ts` |
| `src/lib/omnichannel/triage/TriageActionExecutor.ts` |
| `src/lib/omnichannel/services/DocumentCardEnsurer.ts` |
| `src/components/kanban/CardDetailsModal.tsx` |

---

## 3. Env

```env
# Opcional — default é ligado
HUGINFLOW_DEPT_SESSIONS=enabled
# HUGINFLOW_DEPT_SESSIONS=disabled
# HUGINFLOW_ACTIVE_SPEAKER_TIMEOUT_MIN=120
```

---

## 4. Smoke (dev / negócio)

1. Abrir card Comercial → **Iniciar conversa** com mensagem → OmniChat abre.  
2. No mesmo lead, card Financeiro → Iniciar → se Comercial ativo, confirmar **Assumir**.  
3. Cliente responde no WhatsApp → mensagem cai na sessão do falante ativo.  
4. No OmniChat de cada card, históricos **não** misturam (sessao_id diferente).

---

## 5. Ainda não no MVP (fase seguinte)

- Clarify automático (“locação ou pagamento?”)  
- Placeholders do outro depto na mesma timeline  
- Reply-to / quoted message Evolution  
- Permissão RBAC `omni_historico_completo`

---

## Histórico

| Data | Ambiente | Ação |
|------|----------|------|
| 2026-08-31 | Dev | Migration + MVP código |
| | Prod | Pendente |
