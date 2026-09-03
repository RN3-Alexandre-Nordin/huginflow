# Roteiro completo de homologação — Pacote dev → prod

Roteiro manual alinhado a [MIGRACAO-SUPABASE.md](../MIGRACAO-SUPABASE.md) e [supabase-prod-deploy-pending.md](../supabase-prod-deploy-pending.md).

Marque **OK** / **Falha** e anote observações. Use **dev** antes do cutover em prod.

---

## Cobertura por pacote (checklist mestre)

| Pacote | Migration / código | Seção deste roteiro |
|--------|-------------------|---------------------|
| Performance + Realtime (inbox RPC, kanban sync) | `202608311200`, `202608311230` | §1, §10 |
| Documentos WhatsApp (OCR, match, anexo, auto-reply) | `202608311400` + serviços | §8, §9 |
| Documentos — ensurer + heurística boleto | código | §8.1, §8.6, §9.2 |
| **Simulador — áudio (Whisper + triagem)** | `simulador/actions.ts` | **§7** |
| **Simulador — anexo PDF/imagem** | `simulador/actions.ts` | **§8** |
| Kanban data/hora + UI finalizar / Iniciar conversa | `KanbanItem.tsx` | §2 |
| Sessões por departamento (MVP) | `202608311800` + código | §3, §4 |
| Chat interno — avisar responsável | `notifyCardResponsavel.ts` | §5 |
| Bundle financeiro (contratos, AR, parcelas) | `20260603*` … `20260621*` | **Parte II** (opcional) |

**Tempo estimado:** 60–90 min (CRM completo) · +45 min (financeiro) · 35 min (mínimo simulador + kanban)

---

## 0. Antes de começar

### Ambiente

| Item | Como verificar |
|------|----------------|
| App | `npm run dev` → `http://localhost:3000` |
| Supabase **dev** | Migrations CRM: `202608311200`, `202608311230`, `202608311400`, `202608311800` |
| Usuário admin | Acesso ao simulador (`/cockpit/crm/simulador`) |
| Evolution (opcional) | Canal em `/cockpit/configuracoes/canais` + webhook OK |

### Variáveis (`.env.local`)

```env
OPENAI_API_KEY=sk-...          # obrigatório: OCR, visão, Whisper
HUGINFLOW_DOCUMENT_PIPELINE=enabled
# HUGINFLOW_DEPT_SESSIONS=enabled   # default ligado
```

### Personas

| Usuário | Uso |
|---------|-----|
| **Admin** | Simulador (áudio + anexos) |
| **Operador A** (Comercial) | Iniciar conversa, card responsável |
| **Operador B** (Financeiro) | Segundo funil, assume falante |
| **Operador C** (opcional) | Troca de responsável |

### Arquivos de teste (prepare antes)

| Arquivo | Uso |
|---------|-----|
| `Boleto.pdf` | Heurística `financeiro_boleto` (OCR pode falhar) |
| `comprovante-pix.jpg` | Foto legível de PIX / pagamento |
| `recibo.pdf` ou NF simples | Categoria financeiro genérica |
| `foto-ilegivel.jpg` | Borrada / escura → `documento_nao_identificado` |
| `arquivo-grande.pdf` | **> 5 MB** → limite de anexo |
| `audio-teste.ogg` ou `.mp3` | Upload de áudio (alternativa ao mic) |
| Telefone fixo | Ex.: `5511999998888` — **mesmo número** em todos os testes do simulador |

### Dados CRM

| Item | Estado inicial |
|------|----------------|
| Lead | Telefone = número do simulador |
| Card Comercial | Mesmo lead, **sem** `conversa_id` |
| Card Financeiro | Mesmo lead, categoria `financeiro_pagamento` ou vazio, **sem** `conversa_id` |

---

## 0.1 Validação SQL (opcional — Supabase dev)

Execute se algo falhar ou antes do cutover prod:

```sql
-- Performance
SELECT proname FROM pg_proc WHERE proname = 'get_recent_chat_conversations';
SELECT indexname FROM pg_indexes
WHERE indexname IN ('idx_chat_messages_empresa_created', 'idx_chat_read_markers_usuario');

-- Realtime kanban
SELECT tablename FROM pg_publication_tables
WHERE pubname = 'supabase_realtime' AND tablename = 'crm_cards';

-- Documentos inbound
SELECT column_name FROM information_schema.columns
WHERE table_name = 'crm_card_files'
  AND column_name IN ('source', 'interacao_id', 'provider_message_id');

-- Sessões departamento
SELECT to_regclass('public.crm_chat_threads'), to_regclass('public.crm_phone_active_speaker');

-- Anexos recentes WhatsApp
SELECT id, card_id, source, provider_message_id, created_at
FROM crm_card_files
WHERE source = 'whatsapp_inbound'
ORDER BY created_at DESC LIMIT 5;
```

---

## 1. Performance + Realtime (smoke)

| # | Passo | Resultado esperado | OK |
|---|--------|-------------------|-----|
| 1.1 | Abrir cockpit com sidebar de chat | Inbox carrega em **< 3s** (dev) | ☐ |
| 1.2 | DevTools → Network ao abrir inbox | 1 RPC `get_recent_chat_conversations` (não 4+ selects) | ☐ |
| 1.3 | Enviar mensagem interna com menção `[Nome]` | Badge/inbox atualiza em ~1s; som se configurado | ☐ |

---

## 2. Kanban — data/hora e UI do card

| # | Passo | Resultado esperado | OK |
|---|--------|-------------------|-----|
| 2.1 | Abrir funil com cards recentes | Colunas carregam | ☐ |
| 2.2 | Rodapé do card (fechado) | **Hoje HH:mm**, **Ontem HH:mm** ou **dd/MM HH:mm** | ☐ |
| 2.3 | Expandir card | "Criado em …" **com hora** | ☐ |
| 2.4 | Ícone finalizar (check) | **Vermelho** = aberto | ☐ |
| 2.5 | Finalizar → reabrir | Verde quando finalizado; vermelho ao reabrir | ☐ |
| 2.6 | Card **sem** `conversa_id`, expandido | Botão **Iniciar conversa** | ☐ |
| 2.7 | Card **com** `conversa_id`, expandido | Botão **WhatsApp** (verde) | ☐ |

---

## 3. Sessões por departamento (Comercial × Financeiro)

> Mesmo **lead/telefone**, dois cards em funis diferentes.

| # | Passo | Resultado esperado | OK |
|---|--------|-------------------|-----|
| 3.1 | Operador A: card Comercial → iniciar conversa | Sessão A; falante ativo = Comercial | ☐ |
| 3.2 | Operador B: card Financeiro → iniciar conversa | Aviso "outro departamento ativo" → **Assumir** | ☐ |
| 3.3 | Confirmar **Assumir e enviar** | Falante ativo = Financeiro | ☐ |
| 3.4 | Cliente responde (WhatsApp ou simulador) | Resposta na sessão do **Financeiro** | ☐ |
| 3.5 | OmniChat pelo card **Comercial** | Histórico **diferente** (outro `sessao_id`) | ☐ |
| 3.6 | Card criado por doc/IA (§8) | Thread própria; não mistura Comercial no card Financeiro | ☐ |

---

## 4. Iniciar conversa (operador → cliente)

| # | Passo | Resultado esperado | OK |
|---|--------|-------------------|-----|
| 4.1 | Card sem conversa → **Iniciar conversa** | Modal com painel verde WhatsApp | ☐ |
| 4.2 | Enviar mensagem inicial | OmniChat abre; WhatsApp recebe (se Evolution OK) | ☐ |
| 4.3 | F5 no Kanban | `conversa_id` preenchido; botão virou **WhatsApp** | ☐ |
| 4.4 | Cliente responde | Mesma sessão no OmniChat | ☐ |
| 4.5 | Inbox `/cockpit/crm/chat` | Conversa atribuída ao operador | ☐ |
| 4.6 | IA | **Silenciosa** enquanto status humano | ☐ |

---

## 5. Chat interno — aviso ao responsável

| # | Passo | Resultado esperado | OK |
|---|--------|-------------------|-----|
| 5.1 | B edita **observação** do card de A | A recebe menção `[Nome]` no chat do card | ☐ |
| 5.2 | B **move** estágio | A notificado | ☐ |
| 5.3 | B **troca responsável** para C | C e A avisados | ☐ |
| 5.4 | B **adiciona/remove anexo** manual no card | A notificado | ☐ |
| 5.5 | A edita o **próprio** card | Sem notificação para si | ☐ |
| 5.6 | IA cria/atualiza card (§7 ou §8) | Responsável recebe "IA HuginFlow…" | ☐ |

---

## 6. Simulador — texto (baseline triagem)

**Rota:** `/cockpit/crm/simulador` · admin · telefone fixo · "Cliente Teste"

| # | Passo | Resultado esperado | OK |
|---|--------|-------------------|-----|
| 6.1 | Enviar texto: "Quero saber prazo de entrega" | Resposta IA + painel **Última triagem** preenchido | ☐ |
| 6.2 | Painel triagem | Badge **Texto** · Mídia OK · departamento/funil/resumo | ☐ |
| 6.3 | Texto com intenção financeira | Triagem aponta Financeiro ou CREATE_CARD conforme prompt | ☐ |

---

## 7. Simulador — áudio (Whisper + triagem)

> Cobre pacote **Simulador mic + áudio** do changelog. Requer `OPENAI_API_KEY`.

### 7A — Gravação pelo microfone (PC)

| # | Passo | Resultado esperado | OK |
|---|--------|-------------------|-----|
| 7.1 | Clicar **Mic** → autorizar microfone | Indicador gravando (ícone quadrado) | ☐ |
| 7.2 | Falar 5–10s ("Preciso do boleto da parcela 3") → parar | Bolha usuário com 🎤 + **texto transcrito** | ☐ |
| 7.3 | Painel triagem | Badge **Áudio** + **Mídia OK** (verde) | ☐ |
| 7.4 | Campo Reasoning | Log tipo "Áudio transcrito (N bytes) → …" | ☐ |
| 7.5 | Resposta assistente | IA responde com base na **transcrição** (não no áudio bruto) | ☐ |
| 7.6 | Card / handover | Se triagem pedir card ou handover, link "Card criado/atualizado" ou status CRM | ☐ |

### 7B — Arquivo de áudio (.ogg / .mp3)

| # | Passo | Resultado esperado | OK |
|---|--------|-------------------|-----|
| 7.7 | Enviar `audio-teste.ogg` ou `.mp3` (se UI permitir upload; senão usar mic) | Transcrição exibida na bolha | ☐ |
| 7.8 | Áudio > 25 MB | Erro claro "Áudio muito grande" | ☐ |

### 7C — Falha de transcrição (edge)

| # | Passo | Resultado esperado | OK |
|---|--------|-------------------|-----|
| 7.9 | (Opcional) Remover `OPENAI_API_KEY` temporariamente | Badge **Mídia falhou**; fallback text; triagem não trava | ☐ |

### 7D — WhatsApp real (áudio Evolution)

| # | Passo | Resultado esperado | OK |
|---|--------|-------------------|-----|
| 7.10 | Cliente envia **áudio PTT** no WhatsApp | Cockpit chat mostra placeholder/transcrição | ☐ |
| 7.11 | IA responde | Resposta baseada no texto transcrito | ☐ |
| 7.12 | Logs servidor | `[AiResponse] Transcrição áudio: …` | ☐ |

---

## 8. Simulador — anexos / documentos (PDF, PIX, boleto)

> Cobre migration `202608311400`, ensurer, heurística e simulador clipe.  
> Botão **Clipe** (📎) · máx. **5 MB**.

### 8.1 — Boleto (heurística + ensurer)

| # | Passo | Resultado esperado | OK |
|---|--------|-------------------|-----|
| 8.1 | Anexar `Boleto.pdf` | Painel: **Documento** · **Mídia OK** | ☐ |
| 8.2 | Categoria | `financeiro_boleto` (heurística nome) ou ensurer Financeiro | ☐ |
| 8.3 | Auto-reply no chat | "Recebemos seu documento e já registramos…" (dentro horário) | ☐ |
| 8.4 | Kanban Financeiro | Card criado/atualizado **com anexo** | ☐ |
| 8.5 | Painel triagem | **Anexado no card: Sim** · Handover se ilegível | ☐ |
| 8.6 | OCR vazio / ilegível | **Nunca** termina sem card — observação manual + anexo se houver buffer | ☐ |

### 8.2 — Comprovante PIX (imagem)

| # | Passo | Resultado esperado | OK |
|---|--------|-------------------|-----|
| 8.7 | Anexar `comprovante-pix.jpg` | Categoria `financeiro_pagamento` ou similar | ☐ |
| 8.8 | Card Financeiro + anexo | Arquivo visível ao abrir card | ☐ |
| 8.9 | Documento legível | Painel: **Documento legível: Sim** | ☐ |

### 8.3 — Match estrito (mesmo telefone, card aberto)

| # | Passo | Resultado esperado | OK |
|---|--------|-------------------|-----|
| 8.10 | Criar card manual categoria `financeiro_pagamento` (mesmo lead) | Card aberto no funil | ☐ |
| 8.11 | Reenviar comprovante PIX no **mesmo telefone** simulador | Anexo no **card existente** (não duplica card) | ☐ |
| 8.12 | Painel triagem | Card ID igual ao existente; "Anexo já existia" ou "Anexo salvo" | ☐ |

### 8.4 — Sem match (categoria diferente)

| # | Passo | Resultado esperado | OK |
|---|--------|-------------------|-----|
| 8.13 | Card aberto categoria `expedicao_comprovante` | Card logística | ☐ |
| 8.14 | Enviar boleto no mesmo telefone | **Novo** card Financeiro (match estrito não anexa no errado) | ☐ |

### 8.5 — Foto ilegível

| # | Passo | Resultado esperado | OK |
|---|--------|-------------------|-----|
| 8.15 | Anexar `foto-ilegivel.jpg` | Card com categoria `documento_nao_identificado` ou financeiro genérico | ☐ |
| 8.16 | Observação no card | Texto "não foi possível ler ou identificar…" | ☐ |
| 8.17 | Handover | **Sim** — IA em silêncio / fila humana | ☐ |

### 8.6 — Limite 5 MB

| # | Passo | Resultado esperado | OK |
|---|--------|-------------------|-----|
| 8.18 | Anexar arquivo **> 5 MB** | Erro no simulador: excede limite | ☐ |
| 8.19 | (WhatsApp real) Cliente envia > 5 MB | Mensagem limite + card/handover **sem** anexo | ☐ |

### 8.7 — SQL pós-anexo (opcional)

```sql
SELECT f.id, f.card_id, f.source, f.provider_message_id, c.titulo
FROM crm_card_files f
JOIN crm_cards c ON c.id = f.card_id
WHERE f.empresa_id = '<SUA_EMPRESA>'
ORDER BY f.created_at DESC LIMIT 5;
-- source = 'whatsapp_inbound' ou equivalente simulador
```

---

## 9. WhatsApp real — documentos (Evolution)

> Executar após §8 OK no simulador.

| # | Passo | Resultado esperado | OK |
|---|--------|-------------------|-----|
| 9.1 | Cliente envia **PDF comprovante PIX** + card aberto mesma categoria | Anexo no card existente + auto-reply | ☐ |
| 9.2 | Cliente envia **boleto** sem card aberto | Card Financeiro novo + anexo + auto-reply | ☐ |
| 9.3 | Cockpit `/cockpit/crm/chat` | Bolha 📎 com resumo do documento | ☐ |
| 9.4 | Kanban | Anexo baixável no card | ☐ |
| 9.5 | Foto ilegível | Card + observação + handover | ☐ |
| 9.6 | Responsável do card | Menção chat interno (§5.6) | ☐ |

**Textos auto-reply esperados:**

- Dentro horário: *"Recebemos seu documento e já registramos em nosso sistema…"*
- Fora horário: *"…atendimento humano é de segunda a sexta, das 8h às 17h…"*

---

## 10. Realtime Kanban (2 browsers)

| # | Passo | Resultado esperado | OK |
|---|--------|-------------------|-----|
| 10.1 | Browser 1 e 2 — **mesmo funil**, mesma empresa | Ambos carregados | ☐ |
| 10.2 | Browser 1 **move** card | Browser 2 atualiza **sem F5** (1–3s) | ☐ |
| 10.3 | Browser 1 edita título | Browser 2 reflete (realtime ou após ação) | ☐ |
| 10.4 | DevTools WS | Canal `kanban-{pipelineId}` ativo | ☐ |

---

## 11. Registro final — Pacote CRM/Omni

| Campo | Valor |
|-------|--------|
| Data | |
| Executor | |
| Ambiente | dev / prod |
| Simulador (§6–§8) | OK / parcial / N/A |
| WhatsApp real (§7D, §9) | OK / N/A |
| Bloqueadores P0 | |

### Critério de aprovação CRM

| Status | Condição |
|--------|----------|
| **Aprovado** | §2, §4, §5, **§7A**, **§8.1–8.3** OK |
| **Aprovado com ressalva** | Só simulador (§9 N/A); ou §3 pendente se single-depto |
| **Reprovado** | Áudio não transcreve com key válida; doc sem card; match estrito quebrado; vazamento Comercial/Financeiro; inbox > 5s sistemático |

---

## Ordem sugerida de execução

### Rápido (~40 min, 1 pessoa, só simulador)

1. §0.1 SQL (2 min)  
2. §2 Kanban UI (5 min)  
3. §6 Texto simulador (3 min)  
4. **§7 Áudio mic** (10 min)  
5. **§8 Anexos** — boleto + PIX + match (15 min)  
6. §5 Notificação — pedir colega (5 min)  

### Completo (~90 min)

1. §0 → §2 → §6 → **§7** → **§8** (simulador)  
2. §4 → §3 (2 operadores)  
3. §1 → §10 (performance + realtime)  
4. §9 + §7D (WhatsApp real)  

---

# Parte II — Bundle financeiro (opcional)

> Aplicar somente se o cutover incluir o bundle `huginflow-prod-pending.sql` (migrations `20260603*` … `20260621*`).

| # | Teste | Rota | OK |
|---|-------|------|-----|
| F1 | Listar contratos | `/cockpit/financeiro/contratos` | ☐ |
| F2 | Criar contrato rascunho → ativar | formulário novo | ☐ |
| F3 | Nº contrato auto `CTR-AAAA-NNNN` | detalhe contrato | ☐ |
| F4 | Nº OS auto `OS-AAAA-NNNN` | detalhe contrato | ☐ |
| F5 | Gerar contas a receber do contrato | botão/ação AR | ☐ |
| F6 | Parcelas/mensalidades (13 meses vigência) | contas geradas | ☐ |
| F7 | Baixa parcial/total conta | `/cockpit/financeiro/contas` | ☐ |
| F8 | Dashboard financeiro | `/cockpit/financeiro` | ☐ |

Validação SQL pós-deploy finance:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name LIKE 'finance%' ORDER BY 1;

SELECT pg_get_function_arguments(p.oid)
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'sp_finance_criar_conta_receber'
ORDER BY p.pronargs DESC LIMIT 1;
```

---

*Atualizado: 2026-08-31 — inclui áudio, anexos e mapa completo MIGRACAO-SUPABASE*
