# Cutover para produção — Documentos WhatsApp (PDF, PIX, boleto)

> **Pacote:** pipeline inbound de documentos via Evolution API → classificação → card + anexo.  
> **Ambiente inicial:** dev NASU (`2b87fa27-a1da-4a6b-b7c9-8cfef5685ce7`)  
> **Prod:** aplicar junto com [cutover-performance-realtime-prod.md](./cutover-performance-realtime-prod.md) ou em cutover dedicado.  
> **Índice:** [supabase-prod-deploy-pending.md](./supabase-prod-deploy-pending.md)

---

## Decisões de produto (aprovadas 2026-08-31)

| Item | Decisão |
|------|---------|
| Tipos | PDF, recibos, comprovantes, PIX, boletos (+ fotos de comprovante) |
| Match card | **Estrito** — anexo só se `categoria` do card = categoria do documento |
| Sem match | **`DocumentCardEnsurer`** cria/encaminha card no funil certo (não depende só da IA emitir CREATE_CARD) |
| Heurística nome | Ex.: `Boleto.pdf` → `financeiro_boleto` mesmo com OCR vazio |
| Resposta cliente | Automática (textos aprovados abaixo) |
| Ilegível / falha OCR | Card + observação + anexo (se houver buffer) + handover — **nunca sem encaminhamento** |
| Tamanho máx. | **5 MB** (igual upload manual Kanban) |

### Textos automáticos (WhatsApp)

**Dentro do horário:**
> Recebemos seu documento e já registramos em nosso sistema. Nossa equipe vai analisar e retorna em breve por aqui.

**Fora do horário:**
> Recebemos seu documento e registramos sua solicitação. Nosso atendimento humano é de segunda a sexta, das 8h às 17h (Brasília). Retornaremos nesse período.

**Observação no card (ilegível):**
> Documento recebido via WhatsApp — não foi possível ler ou identificar o conteúdo com segurança. Análise manual necessária.

### Categorias (`TRIAGE.categoria`)

- `financeiro_pagamento` — PIX, comprovante pagamento  
- `financeiro_boleto` — boleto  
- `financeiro_recibo` — recibo  
- `financeiro_documento` — NF, cobrança, PDF financeiro  
- `expedicao_comprovante` — entrega/logística  
- `documento_nao_identificado` — ilegível/incerto  

---

## Checklist cutover prod

```
[ ] 1. Migration 202608311400_crm_card_files_whatsapp_inbound.sql
[ ] 2. Atualizar empresas.ai_context_prompt (SQL abaixo ou arquivo nasuTriagePrompt.ts)
[ ] 3. Inserir/atualizar KB documentos na knowledge_base (NASU_KB_DOCUMENTOS)
[ ] 4. Deploy código (lista seção 3)
[ ] 5. OPENAI_API_KEY com gpt-4o (visão) no servidor
[ ] 6. Teste: enviar PDF/PIX no WhatsApp prod
[ ] 7. Marcar histórico abaixo
```

---

## 1. Migration Supabase

**Arquivo:** `supabase/migrations/202608311400_crm_card_files_whatsapp_inbound.sql`

```sql
ALTER TABLE public.crm_card_files
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS interacao_id uuid,
  ADD COLUMN IF NOT EXISTS provider_message_id text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_card_files_provider_message
  ON public.crm_card_files (empresa_id, provider_message_id)
  WHERE provider_message_id IS NOT NULL;
```

---

## 2. Dados NASU — prompt e KB (replicar em prod)

### 2.1 Prompt da empresa

Fonte canônica: `src/lib/omnichannel/triage/nasuTriagePrompt.ts`

Em prod, executar UPDATE em `empresas` para o tenant correto (substituir ID):

```sql
UPDATE empresas
SET ai_context_prompt = $PROMPT$ ... conteúdo de nasuTriagePrompt.ts ... $PROMPT$
WHERE id = '<EMPRESA_ID_PROD>';
```

*(Em dev NASU já aplicado em 2026-08-31.)*

### 2.2 Base de conhecimento

Fonte: `src/lib/omnichannel/triage/nasuKnowledgeBase.ts` → constante `NASU_KB_DOCUMENTOS`

Inserir ou atualizar entrada na `knowledge_base` da empresa com categoria `Triagem` / `Documentos`.

---

## 3. Código (deploy)

### Novos arquivos

| Arquivo |
|---------|
| `src/lib/omnichannel/document-constants.ts` |
| `src/lib/omnichannel/triage/parseDocumentTags.ts` |
| `src/lib/omnichannel/triage/CardDocumentMatcher.ts` |
| `src/lib/omnichannel/services/DocumentClassificationService.ts` |
| `src/lib/omnichannel/services/DocumentProcessingService.ts` |
| `src/lib/omnichannel/services/DocumentInboundService.ts` |
| `src/lib/omnichannel/services/DocumentCardEnsurer.ts` |
| `src/lib/omnichannel/services/CardAttachmentService.ts` |

### Alterados

| Arquivo |
|---------|
| `src/lib/omnichannel/services/EvolutionMediaService.ts` |
| `src/lib/omnichannel/services/AiResponseService.ts` |
| `src/lib/omnichannel/providers/EvolutionProvider.ts` |
| `src/app/api/webhooks/evolution/route.ts` |
| `src/lib/ai/empresa-ai.ts` (vision gpt-4o) |
| `src/lib/omnichannel/triage/platformInstructions.ts` |
| `src/lib/omnichannel/triage/nasuTriagePrompt.ts` |
| `src/lib/omnichannel/triage/nasuKnowledgeBase.ts` |
| `src/lib/omnichannel/triage/parseTriageTags.ts` |
| `src/lib/omnichannel/triage/TriageActionExecutor.ts` (notifica responsável no chat) |
| `src/app/(app)/cockpit/crm/chat/page.tsx` |
| `src/app/(app)/cockpit/crm/simulador/actions.ts` (áudio + documento) |

### Feature flag (opcional)

```env
HUGINFLOW_DOCUMENT_PIPELINE=enabled   # disabled para desligar
```

---

## 4. Pré-requisitos servidor

- `OPENAI_API_KEY` configurada  
- Modelo vision: **gpt-4o** (hardcoded para OCR de imagem/PDF escaneado)  
- Evolution API: endpoint `getBase64FromMediaMessage` acessível  

---

## 5. Testes de smoke

### Preferencial — Simulador (sem Evolution)

Em `/cockpit/crm/simulador` (admin):

1. **Áudio:** botão mic → enviar `.ogg`/`.mp3` → painel mostra “Áudio / Mídia OK” + transcrição + triagem  
2. **Anexo:** botão clipe → PDF ou foto de comprovante → classificação + auto-reply + card/anexo  
3. **Boleto ilegível / OCR falho:** enviar `Boleto.pdf` (mesmo sem texto) → categoria `financeiro_boleto` (heurística) **ou** card Financeiro via ensurer + anexo + auto-reply — **nunca sem card**  
4. **Match:** criar card com categoria `financeiro_pagamento` e reenviar comprovante PIX no mesmo telefone  

### Com WhatsApp real (depois de conectar número)

1. Cliente envia **PDF comprovante PIX** + card Financeiro aberto mesma categoria → anexo no card existente + auto-reply  
2. Cliente envia boleto **sem card** → card Financeiro novo + anexo + auto-reply  
3. Foto **ilegível** → card com observação + categoria adequada / `documento_nao_identificado` + anexo  
4. Arquivo **> 5 MB** → mensagem de limite + card/handover (sem anexo)  
5. Cockpit chat → bolha 📎 com resumo do documento  
6. Kanban → anexo visível no card  
7. Responsável do card recebe menção no chat interno se a IA criou/atualizou o card (ver [cutover-crm-ux-notificacoes-prod.md](./cutover-crm-ux-notificacoes-prod.md))

---

## 6. Histórico

| Data | Ambiente | Ação |
|------|----------|------|
| 2026-08-31 | Dev | Código + migration + prompt NASU |
| 2026-08-31 | Dev | `DocumentCardEnsurer` + heurística nome (boleto sem OCR) |
| | Prod | Pendente |

---

*Ver também: [planejamento-documentos-whatsapp.md](./planejamento-documentos-whatsapp.md) · [supabase-prod-deploy-pending.md](./supabase-prod-deploy-pending.md)*
