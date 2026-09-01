# Planejamento — Sessões por departamento (isolamento + falante ativo)

**Problema:** o mesmo número WhatsApp gera **uma única** `sessao_id` (`canal_id` + `external_id`). Comercial e Financeiro compartilham o histórico no OmniChat → risco de **vazamento entre departamentos** e de a IA/roteador misturar assuntos.

**Objetivo:** isolar o que cada departamento **vê e trata**, sem fingir que o WhatsApp tem dois chats; evitar que respostas do cliente caiam no departamento errado quando há mais de um assunto em aberto.

**Princípio:** no WhatsApp o cliente tem **1 fio cronológico**. No HuginFlow: **várias sessões/cards**, **no máximo um falante ativo** por telefone+canal, isolamento com **placeholders** (não apagar o fio).

**Data:** 2026-08-31 · **Status:** MVP implementado em **dev** (fase 1–2 parcial)  
**Cutover:** [cutover-sessoes-departamento-prod.md](./cutover-sessoes-departamento-prod.md)  
**Índice deploy:** [supabase-prod-deploy-pending.md](./supabase-prod-deploy-pending.md)

---

## 1. Diagnóstico (estado atual)

| Peça | Comportamento hoje |
|------|-------------------|
| `ConversaHistoricoService.getLatestSessao` | Reusa sempre a última sessão do `(canal, telefone)` |
| `crm_interacoes.conversa_id` | = `sessao_id` único por thread WhatsApp |
| Cards | Podem ser vários por lead; vários cards apontam para o **mesmo** `conversa_id` |
| `buildSystemFacts` | 1 card aberto (mais recente) — triagem textual “puxa” um só |
| `sendOmniMessage` | Exige `sessaoId` existente — **não há “iniciar conversa”** outbound do zero |
| ACL operador | Entra por atribuição/card; **dentro da sessão vê todas as mensagens** |

```
Cliente ↔ WhatsApp (1 chat)
         ↓
   1 sessao_id
         ↓
  OmniChat mistura Comercial + Financeiro
  Cards podem ser 2, histórico é 1
```

---

## 2. Decisões de produto (aprovadas em discussão)

| # | Decisão |
|---|----------|
| D1 | **Não** criar dois números WhatsApp por departamento (custo ops alto), salvo exceção futura. |
| D2 | Isolamento é **no HuginFlow** (visão + permissão + roteamento), não no app do cliente. |
| D3 | **No máximo um falante ativo** por `(empresa, canal, telefone)` — evita paralelismo cego. |
| D4 | Operador do depto A vê mensagens do depto A por completo; das outras: **placeholder** sem conteúdo sensível. |
| D5 | Admin/gerente (RBAC `Ver` histórico completo / flag dedicada) pode ver o fio integral. |
| D6 | Troca de departamento: **explícita** (transferência ou escolha do cliente) — IA **não adivinha**. |
| D7 | Ambiguidade → **uma pergunta** (“locação ou pagamento?”), sem gravar no depto errado. |
| D8 | Incluir **iniciar conversa outbound** a partir do card/lead (hoje inexistente). |
| D9 | Preferir reply-to / quoted message da Evolution quando existir, para amarrar à sessão da mensagem citada. |

---

## 3. Modelo alvo

### 3.1 Conceitos

| Conceito | Definição |
|----------|-----------|
| **Lead** | Pessoa/telefone (já existe). |
| **Card** | Assunto no funil (Comercial, Financeiro, …). |
| **Sessão de assunto** | Thread lógica HuginFlow: `sessao_id` amarrada a `card_id` + `departamento_id` (ou funil). |
| **Falante ativo** | Qual `sessao_id` (e departamento) está autorizada a conduzir o diálogo **agora**. |
| **Placeholder** | Linha no OmniChat: `[Financeiro · 14:32 · mensagem oculta]` — sem texto. |

### 3.2 Relação com WhatsApp

```
WhatsApp (1 chat do cliente)
    │
    ├─ sessao Comercial  (card locação)     ← falante ativo OU em espera
    └─ sessao Financeiro (card cobrança)    ← falante ativo OU em espera

Inbound do cliente → roteado para a sessão do falante ativo
                     (ou clarify / quoted reply)
```

- Todas as mensagens continuam podendo ser auditadas no banco com `departamento_id` / `sessao_id`.
- A UI do operador **filtra** por ACL; não depende só de “esconder no front”.

### 3.3 Chave e campos (schema proposto)

**Opção recomendada:** manter `crm_conversas` (1 linha por mensagem) e enriquecer a sessão.

Nova tabela (ou colunas em entidade de sessão):

```text
crm_chat_threads  (1 por assunto ativo/histórico)
  id                 uuid PK          -- = sessao_id usado em crm_conversas / crm_interacoes
  empresa_id         uuid NOT NULL
  canal_id           uuid NOT NULL
  external_id        text NOT NULL    -- telefone normalizado
  lead_id            uuid
  card_id            uuid             -- card deste assunto
  departamento_id    uuid             -- denormalizado do funil do card
  pipeline_id        uuid
  status             text             -- ai | human | waiting | closed
  created_at / updated_at
```

**Ponteiro de falante ativo** (por telefone+canal):

```text
crm_phone_active_speaker
  empresa_id, canal_id, external_id   PK (ou unique)
  active_sessao_id   uuid NOT NULL    -- FK crm_chat_threads.id
  active_departamento_id uuid
  activated_at       timestamptz
  activated_by       uuid NULL        -- usuario_id; null = IA/sistema
  reason             text             -- outbound | transfer | client_choice | timeout
```

**Mensagens** (`crm_interacoes` / `crm_conversas`):

- `conversa_id` / `sessao_id` → thread do **assunto** (não mais “uma só para o telefone”).
- Opcional: `visibility_departamento_id`, `quoted_provider_message_id` (para reply-to).

**Migração de dados existentes:**

1. Para cada `(canal, external_id)` atual → 1 `crm_chat_threads` com a `sessao_id` vigente.
2. Ligar ao card aberto mais recente do lead (se houver).
3. Popular `crm_phone_active_speaker` com essa sessão.
4. Cards sem `conversa_id` permanecem como hoje até primeiro contato.

---

## 4. Regras de roteamento inbound

Ordem de decisão (primeira que fechar ganha):

| Prioridade | Regra | Ação |
|------------|-------|------|
| 1 | Mensagem é **reply** a uma mensagem nossa com `sessao_id` conhecido | Grava nessa sessão |
| 2 | Existe **falante ativo** e sessão não `closed` | Grava na `active_sessao_id` |
| 3 | Falante ativo expirou (timeout configurável, ex. 2h sem interação) e há **só 1** sessão `human`/`ai` aberta | Reativa essa e grava |
| 4 | Várias sessões abertas / assunto ambíguo | **Não** encaminha ainda: status `clarify`, pergunta objetiva, aguarda escolha |
| 5 | Nenhuma sessão | Cria thread + card via triagem atual (ou ensurer de documento) e vira falante ativo |

**IA:** só responde na sessão do falante ativo (e respeitando `ia_silence_timeout` / handover humano já existentes).  
**Proibido:** classificar inbound e “mover” silenciosamente para outro departamento enquanto há falante ativo de outro depto.

---

## 5. Falante ativo — quem assume

| Evento | Efeito |
|--------|--------|
| Operador envia outbound na sessão do card | Essa sessão vira falante ativo |
| **Iniciar conversa** no card (novo) | Cria thread se preciso + 1ª mensagem + vira falante ativo |
| Transferência de card/funil entre departamentos | Nova sessão do depto destino (ou reusa) + assume falante ativo; origem → `waiting` |
| Cliente responde clarify “(1) locação (2) pagamento” | Sessão escolhida assume |
| Timeout sem mensagem | `active_speaker` pode limpar ou marcar `stale` (config por empresa) |
| Documento com categoria financeira enquanto Comercial é ativo | **Não** rouba o falante: anexa/cria **card** Financeiro em `waiting` + notifica responsável; opcional aviso interno. Só assume se política da org permitir “interrupt” |

Mensagem opcional ao cliente na troca explícita:

> Agora você está falando com o time **Financeiro** sobre pagamento. Para voltar à locação, diga **LOCAÇÃO**.

---

## 6. Isolamento na UI (OmniChat)

### 6.1 Visão do operador (departamento X)

- Lista inbox: só sessões cujo `departamento_id` ele pode ver (matriz + funil).
- Timeline da sessão aberta:
  - mensagens com `departamento_id = X` (ou da própria sessão): **texto completo**;
  - mensagens de outras sessões do **mesmo telefone** no mesmo período (opcional, “contexto do fio”): só **placeholder**;
  - alternativa mais simples na v1: **não** misturar outras sessões na timeline — só a sessão do card; placeholders ficam para uma vista “Fio WhatsApp (resumo)” se necessário.

**Recomendação v1:** OmniChat = **só a sessão do card/departamento**. O “fio completo com placeholders” fica numa aba **Contexto WhatsApp** (gerente ou quem tiver permissão), para não poluir o dia a dia.

### 6.2 Backend (obrigatório)

- `getOmniMensagens` / listagens: filtrar por sessão + ACL departamento.
- Nunca retornar `content` de outra sessão/depto para quem não tem `Ver` completo.
- Placeholders gerados no server (`content` mascarado), não só CSS.

### 6.3 RBAC

| Permissão (conceito) | Efeito |
|----------------------|--------|
| Chat Omni do funil/depto | Ver/enviar na própria sessão |
| `omni_historico_completo` (ou equivalente na matriz) | Ver fio com placeholders ou texto integral |
| Iniciar conversa | Botão no card/lead |

Alinhar à Matriz de Permissões (sem hardcode de role além do que já existe para `operador`).

---

## 7. Iniciar conversa (outbound)

**Hoje:** não existe.  
**Alvo:** no card (e opcionalmente no lead):

1. Valida telefone do lead + canal WhatsApp da empresa.
2. Se já existe thread aberta daquele `card_id` → reabre Omni nela.
3. Senão cria `crm_chat_threads` + `sessao_id`, liga `card.conversa_id`, assume falante ativo.
4. Envia 1ª mensagem (texto livre se dentro da janela 24h; senão **template** Evolution — tratar como pré-requisito).
5. Grava outbound + status `human` + `last_human_interaction`.

Se outro departamento é falante ativo: UI avisa *“Comercial está ativo. Assumir o atendimento?”* → confirmação → assume (D3).

---

## 8. Fluxos de exemplo

### 8.1 Locação + cobrança

1. Comercial negocia → falante = Comercial.  
2. Financeiro quer cobrar → clica Iniciar/Assumir → confirma → falante = Financeiro; Comercial fica `waiting`.  
3. Cliente responde → cai no Financeiro.  
4. Cliente digita LOCAÇÃO ou Comercial reassuma → falante volta ao Comercial.

### 8.2 Cliente muda de assunto sozinho

1. Falante = Comercial.  
2. Cliente: “e aquele boleto atrasado?”  
3. Classificador sugere Financeiro, mas **não** troca sozinho → clarify ou sugere transferência ao operador.  
4. Após escolha/transferência → Financeiro assume.

### 8.3 Documento boleto com Comercial ativo

1. Ensurer cria/atualiza card Financeiro + anexa.  
2. Notifica responsável Financeiro no chat interno.  
3. Falante permanece Comercial (padrão).  
4. Financeiro assume quando for falar com o cliente.

---

## 9. Fases de implementação

### Fase 0 — Documentação (esta)

- [x] Formalizar decisões e modelo  
- [x] MVP em dev para validação do negócio (sem wait de sign-off prévio)

### Fase 1 — Fundações (schema + ponteiro)

- [x] Migration `crm_chat_threads` + `crm_phone_active_speaker`
- [x] Backfill sessões atuais
- [x] `ConversaHistoricoService`: `sessao_id` forçado + sync thread
- [x] Feature flag `HUGINFLOW_DEPT_SESSIONS`

### Fase 2 — Iniciar conversa + falante ativo

- [x] Action `startOmniConversation(cardId, message)`
- [x] UI no card (`StartOmniConversationPanel`)
- [x] Assumir falante (confirmação)
- [x] Roteamento inbound via falante ativo
- [ ] Clarify (prioridade 4) — pós-MVP
- [ ] Quoted/reply-to Evolution — pós-MVP

### Fase 3 — Isolamento ACL

- [x] Thread própria por card na criação IA/documento (não herda falante)
- [x] OmniChat por `sessao_id` do card (históricos separados)
- [ ] Aba contexto / placeholders — pós-MVP
- [ ] Filtro inbox só por depto na matriz — pós-MVP

### Fase 4 — Polimento

- [ ] Timeout falante ativo (config empresa)
- [ ] Templates WhatsApp para 1º contato fora da janela
- [ ] Métricas: % clarify, transferências, erros de roteamento
- [ ] Cutover prod + smoke
- [ ] Atualizar prompt NASU (não misturar depto; respeitar falante ativo)

---

## 10. Riscos e mitigações

| Risco | Mitigação |
|-------|-----------|
| Operador perde o “fio” sem ver o outro depto | Aba contexto com placeholders; não esconder timestamps |
| Dois operadores falam ao mesmo tempo | Trava falante ativo + confirmação ao assumir |
| IA encaminha errado | Proibir auto-swap; clarify |
| Janela 24h WhatsApp no outbound | Templates; UX clara |
| Migração quebra inbox atual | Flag + backfill 1:1 sessão atual → thread |
| Documento “rouba” atendimento | Card em waiting; não muda falante por padrão |

---

## 11. Fora de escopo (por enquanto)

- Número WhatsApp distinto por departamento  
- Threads paralelas **sem** falante ativo (rejeitado)  
- Isolamento só no front sem filtro no backend  

---

## 12. Critérios de aceite (smoke)

1. Mesmo telefone, card Comercial e card Financeiro → **duas** `sessao_id`; inbox de cada operador só a sua.  
2. Com Comercial ativo, mensagem do cliente **não** aparece na sessão Financeiro.  
3. Financeiro “Assumir” → próximas mensagens só no Financeiro; Comercial vê sessão em espera.  
4. Ambiguidade com 2 abertas → clarify, sem gravação no depto errado.  
5. **Iniciar conversa** no card cria sessão + envia WhatsApp + abre Omni.  
6. Admin com permissão vê histórico completo (ou placeholders).  
7. Flag desligada → comportamento legado (1 sessão por telefone).

---

## 13. Arquivos previstos (quando implementar)

| Área | Arquivos (provável) |
|------|---------------------|
| Schema | `supabase/migrations/YYYYMMDD_crm_chat_threads_active_speaker.sql` |
| Core | `ConversaHistoricoService.ts`, novo `ActiveSpeakerService.ts`, `ThreadRoutingService.ts` |
| Actions | `omni-actions.ts` (`startOmniConversation`, `assumeSpeaker`), `omni-chat-actions.ts` |
| Webhook | `evolution/route.ts` / triage inbound |
| UI | `crm/chat/page.tsx`, botão no `CardDetailsModal` / Kanban |
| Docs | cutover dedicado + entrada em [supabase-prod-deploy-pending.md](./supabase-prod-deploy-pending.md) |

---

## 14. Histórico

| Data | Ação |
|------|------|
| 2026-08-31 | Diagnóstico: 1 sessão por telefone; risco de vazamento |
| 2026-08-31 | Decisão: falante ativo + isolamento com placeholders + iniciar conversa |
| 2026-08-31 | Este documento formalizado |
| 2026-08-31 | MVP em dev: migration + start conversa + falante ativo + threads isoladas |

---

*Relacionados: [planejamento-documentos-whatsapp.md](./planejamento-documentos-whatsapp.md) · [cutover-crm-ux-notificacoes-prod.md](./cutover-crm-ux-notificacoes-prod.md)*
