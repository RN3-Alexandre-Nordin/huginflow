# Cutover para produção — Encaminhamento de card (resumo IA)

> **⚠️ Atualizado 2026-09-02:** handover estruturado (motivos/checklists JSONB) foi **revertido**.  
> Novo fluxo: IA gera resumo da conversa → operador valida/edita → salva em `crm_cards.observacao`.  
> Migration: `202609021000_revert_handover_structured.sql` (dev + prod ✅ MCP).

> Índice: [supabase-prod-deploy-pending.md](./supabase-prod-deploy-pending.md)

**Dev homologado:** 2026-09-02 · **Prod SQL revert:** ✅ MCP `revert_handover_structured`

---

## Resumo (fluxo atual)

| Área | O que muda |
|------|------------|
| **Encaminhar card (cross-funil)** | Modal com textarea: resumo IA da conversa WhatsApp |
| **Operador** | Revisa, edita e confirma antes de encaminhar |
| **Persistência** | Apenas `crm_cards.observacao` + histórico `TRANSFER_PIPELINE` |
| **Modelo IA** | `gpt-4o-mini` dedicado ao resumo (`HANDOVER_SUMMARY_MODEL`) |
| **Removido** | `empresas.crm_handover_config`, `handover_ja_feito`, `handover_pendencias`, formulário com chips |

---

## Checklist cutover prod

```
[x] 1. Migration SQL `202609021000` revert handover (MCP dev + prod 2026-09-02)
[ ] 2. Deploy código (lista abaixo)
[ ] 3. Smoke: encaminhar cross-funil → resumo IA aparece → editar → salvar
[ ] 4. OPENAI_API_KEY configurada no servidor
```

---

## Código (deploy)

| Arquivo | Função |
|---------|--------|
| `src/lib/crm/cardHandoverSummary.ts` | Agente de resumo da conversa |
| `src/lib/ai/empresa-ai.ts` | Modelos atualizados (default `gpt-4o-mini`, GPT-5 na lista) |
| `src/components/kanban/CardRedirectPanel.tsx` | Fluxo simplificado + modal resumo |
| `src/components/kanban/CardHandoverModal.tsx` | Textarea editável + urgência (baixa/normal/alta) |
| `src/app/(app)/cockpit/crm/actions.ts` | `generateHandoverObservacao`, `transferCardPipeline` simplificado |

**Removidos:** `cardHandover.ts`, `CardHandoverForm.tsx`

---

## SQL

```sql
-- Arquivo: supabase/migrations/202609021000_revert_handover_structured.sql
DROP INDEX IF EXISTS idx_crm_cards_handover_ja_feito_gin;
DROP INDEX IF EXISTS idx_crm_cards_handover_pendencias_gin;
ALTER TABLE crm_cards DROP COLUMN IF EXISTS handover_ja_feito, DROP COLUMN IF EXISTS handover_pendencias;
ALTER TABLE empresas DROP COLUMN IF EXISTS crm_handover_config;
```

---

## Histórico (obsoleto — 2026-09-01)

<details>
<summary>Handover estruturado v1 (revertido)</summary>

Formulário com motivos/checklists, `crm_handover_config`, JSONB `handover_ja_feito` / `handover_pendencias`.  
Substituído pelo resumo IA editável em 2026-09-02.

</details>

[ ] 4. Smoke: novo responsável vê briefing no hub do card (sem acesso ao chat antigo)
[ ] 5. Smoke: evento TRANSFER_PIPELINE na timeline com texto gerado
[ ] 6. (Opcional) Configurar motivos NASU em empresas.crm_handover_config
[ ] 7. Marcar histórico no índice de deploy
```

---

## Migration SQL

| Arquivo local | ID MCP | O que faz |
|---------------|--------|-----------|
| `supabase/migrations/202609011200_empresas_crm_handover_config.sql` | `empresas_crm_handover_config` | Coluna `empresas.crm_handover_config JSONB` |
| `supabase/migrations/202609011400_crm_cards_handover_structured.sql` | `crm_cards_handover_structured` | `handover_ja_feito` + `handover_pendencias` JSONB + GIN |

### Aplicar (se ainda não aplicado)

**MCP prod** (recomendado — já executado 2026-09-01):

```sql
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS crm_handover_config JSONB DEFAULT NULL;

COMMENT ON COLUMN public.empresas.crm_handover_config IS
  'CRM handover: { motivos: string[], ja_feito_opcoes: string[], pendencias_opcoes: string[] }';
```

**Dev:** mesma migration já aplicada via MCP.

### Validação

```sql
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'empresas'
  AND column_name = 'crm_handover_config';

SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'crm_cards'
  AND column_name IN ('handover_ja_feito', 'handover_pendencias');

SELECT name FROM supabase_migrations.schema_migrations
WHERE name IN ('empresas_crm_handover_config', 'crm_cards_handover_structured');
```

### Consultas para relatórios (exemplos)

```sql
-- Cards com pendência "Enviar proposta"
SELECT id, titulo, handover_pendencias->>'search_text'
FROM crm_cards
WHERE handover_pendencias @> '{"checks": ["Enviar proposta ou orçamento"]}';

-- Busca textual em pendências
SELECT id, titulo FROM crm_cards
WHERE handover_pendencias->>'search_text' ILIKE '%boleto%';
```

---

## Código

### Novos

| Arquivo | Função |
|---------|--------|
| `src/lib/crm/cardHandover.ts` | Tipos, defaults, build texto, validação, sugestão timeline |
| `src/components/kanban/CardHandoverForm.tsx` | UI do formulário estruturado |

### Alterados

| Arquivo | Motivo |
|---------|--------|
| `src/components/kanban/CardRedirectPanel.tsx` | Integra formulário; obrigatório em cross-funil |
| `src/components/kanban/CardDetailsModal.tsx` | Exibe briefing/observação no hub |
| `src/app/(app)/cockpit/crm/actions.ts` | `getCardRedirectContext` enriquecido; `transferCardPipeline` persiste metadados; `updateEmpresaHandoverConfig` |

### Comportamento

1. Ao escolher destino em **outro funil**, aparece o bloco “Briefing de encaminhamento”.
2. Campos pré-preenchidos: `descricao`, `metadados` (resumo/motivo/prioridade), anexos, sugestão timeline.
3. Submit valida campos mínimos e gera texto:

```
── Encaminhamento Financeiro → Comercial ──
Motivo: ...
Pedido do cliente: ...
Já feito: ...
Pendências: ...
Urgência: Normal
Anexos: ...
Obs.: (opcional)
```

4. Salva em `observacao` do card + `metadados.ultimo_handover` + histórico `TRANSFER_PIPELINE`.

### Config por empresa (opcional)

```json
{
  "motivos": [
    "Cliente solicitou outro departamento",
    "Assunto fora do escopo do departamento"
  ],
  "ja_feito_opcoes": [
    "Triagem / classificação realizada",
    "Cliente orientado sobre prazo ou processo"
  ],
  "pendencias_opcoes": [
    "Enviar proposta ou orçamento",
    "Confirmar disponibilidade / estoque"
  ]
}
```

Atualizar via SQL:

```sql
UPDATE empresas
SET crm_handover_config = '{ ... }'::jsonb
WHERE id = '<empresa_id>';
```

Ou server action `updateEmpresaHandoverConfig` (permissão `empresas.edit`).

Se `crm_handover_config` for `NULL`, o app usa **defaults** em `cardHandover.ts`.

---

## Testes de smoke

1. Card no Financeiro com conversa WhatsApp → Encaminhar → Comercial.  
2. Preencher briefing (usar “sugestão da timeline” se houver histórico).  
3. Confirmar → Antônio (Comercial) abre o card e vê o briefing **sem** ver mensagens do Financeiro.  
4. Timeline mostra `TRANSFER_PIPELINE` com o texto completo.  
5. Mesmo funil, só troca de operador: **não** exige formulário completo (sem mudança de pipeline).

---

## Encaminhar pelo chat omni

`ChatCardRedirectModal` reutiliza `CardRedirectPanel` — mesmo fluxo e mesmas regras.

---

## Histórico

| Data | Ambiente | Ação |
|------|----------|------|
| 2026-09-01 | Dev | Migration + código implementados |
| 2026-09-01 | Dev | Migration MCP `empresas_crm_handover_config` |
| 2026-09-01 | Prod | Migration MCP `empresas_crm_handover_config` ✅ |
| 2026-09-01 | Prod | Deploy código — pendente |
