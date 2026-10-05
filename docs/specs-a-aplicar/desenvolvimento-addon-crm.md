# DEV — Addon CRM (comercial)

**Status:** a aplicar · doc único (inventário + playbook)  
**Branch:** `develop` (nunca `main` sem OK explícito)  
**Como usar:** ler §0–§2 para contexto; implementar **um bloco por vez** (§3+); marcar checkboxes.  
**Setup onboarding:** [setup/addon-crm.md](../setup/addon-crm.md)

| Relacionado | Papel |
|-------------|--------|
| [plataforma-entitlements-decisoes.md](../specs-aplicadas/plataforma-entitlements-decisoes.md) | Slug `crm` reservado |
| [integracao-estoque-workflow-ia.md](./integracao-estoque-workflow-ia.md) | Workflow = orquestração; CRM ≠ substituir funil genérico |
| [planejamento-modulo-relatorios-bi.md](../specs-aplicadas/planejamento-modulo-relatorios-bi.md) | BI funil/omni já em DEV |

**Hoje no produto:** Workflow (funis/Kanban) + Omni (chat) + Pessoas (`crm_leads`). Addon **`crm`** reservado, desligado, sem hub comercial próprio.

---

## 0. Contexto permanente

### 0.1 Posicionamento

| Addon | Papel |
|-------|--------|
| `workflow` | Orquestração / Kanban / processos (estoque, internos) |
| `omni` | Chat + canais + IA atendimento |
| **`crm`** | Comercial: vendas, contas, oportunidades, propostas, atividades |
| `cadastros` | Masters; Pessoas compartilhadas |

**Não** duplicar Kanban: oportunidade **reusa** `crm_cards` + funis. Hub CRM = superfície **comercial**; Workflow continua genérico.

### 0.2 Decisões padrão (até workshop alterar)

| Tema | Padrão |
|------|--------|
| Hub | `/cockpit/crm` = comercial (`crm`); `/cockpit/workflow` = orquestração |
| Oportunidade | Continua `crm_cards` (sem tabela paralela no P0/P1) |
| Account | Nova entidade (P1) — não só texto `empresa_cliente` |
| Dependência | `crm` **exige** `workflow` para Kanban |
| Seed | Ao ligar `crm`, **sempre** semear funil Vendas (idempotente) |
| Omni | Opcional: chat na oportunidade só se `omni` on |

### 0.3 Mapa das fases

```
P0  Produto + ciclo mínimo da oportunidade
P1  Conta + atividades + itens na oportunidade
P2  Proposta + origem/UTM + IA comercial leve
P3  E-mail/cadência + pedido→estoque + extensões
```

### 0.4 Envelope de evento (P2/P3)

```json
{
  "empresa_id": "uuid",
  "event": "crm.oportunidade.ganha",
  "occurred_at": "ISO-8601",
  "actor": { "type": "user|system|ai|api", "id": "uuid|null" },
  "resource": { "type": "crm_card|crm_account|crm_proposta|...", "id": "uuid" },
  "payload": {},
  "correlation_id": "uuid|null"
}
```

### 0.5 Checklist de decisão (workshop)

- [ ] Aceitar padrões §0.2?
- [ ] Estágios exatos do seed Vendas?
- [ ] Piloto: quais 3 features obrigatórias no go-live?

---

## 1. Inventário — o que já temos × gap

Legenda: **TÊM** · **PARCIAL** · **FALTA** · **FORA**

### Contatos e contas

| Feature | Status | Fase se FALTA |
|---------|--------|---------------|
| Pessoas PF/PJ (`crm_leads`), papéis, fiscal, `codigo_externo` | **TÊM** | — |
| Conta / Account + N contatos | **FALTA** | **P1** |

### Pipeline e oportunidades

| Feature | Status | Fase |
|---------|--------|------|
| Funis / estágios / Kanban / card (`valor`, prazo, responsável) | **TÊM** | — |
| Probabilidade / forecast KPI | **PARCIAL** | refinar P2 |
| Win/loss + motivo | **FALTA** | **P0** |
| Itens SKU na oportunidade | **FALTA** | **P1** |
| Seed funil Vendas | **FALTA** | **P0** |

### Atividades

| Feature | Status | Fase |
|---------|--------|------|
| Prazo no card + feed parcial cockpit | **PARCIAL** | — |
| Tarefas / agenda comercial | **FALTA** | **P1** |

### Comunicação

| Feature | Status | Fase |
|---------|--------|------|
| Omni chat / canais / IA atendimento | **TÊM** | — |
| E-mail / cadência / telefonia | **FALTA** | **P3** |

### Propostas e documentos

| Feature | Status | Fase |
|---------|--------|------|
| Anexos no card | **TÊM** | — |
| Proposta PDF / versões | **FALTA** | **P2** |
| Pedido → estoque | **FALTA** | **P3** |
| E-sign / portal / CPQ completo | **FORA** / P3 sob demanda | — |

### BI, plataforma, IA

| Feature | Status | Fase |
|---------|--------|------|
| BI funil/omni | **TÊM** | — |
| Origem/UTM + conversão | **PARCIAL** | **P2** |
| Metas / ranking | **PARCIAL** | **P2** |
| Addon `crm` + hub + seed | **PARCIAL** / **FALTA** | **P0** |
| IA próximo passo comercial | **FALTA** | **P2** |
| Lead scoring | **FALTA** | **P3** |

**Já entrega valor sem addon CRM:** Pessoas, funis/cards, anexos, Omni, BI funil.

---

## 2. Funcionalidades por fase (resumo)

| Fase | Entregar |
|------|----------|
| **P0** | Hub + entitlement `crm`; seed Vendas; setup doc; win/loss; UX hub; RBAC |
| **P1** | Account; tarefas; agenda; itens SKU na opp |
| **P2** | Proposta PDF; origem/UTM; metas; IA próximo passo; eventos `crm.*` |
| **P3** | E-mail/cadência; pedido→estoque; scoring; telefonia/e-sign/CPQ sob demanda |

---

## 3. Fronteiras

| Não fazer | Por quê |
|-----------|---------|
| Substituir `workflow` / reimplementar Omni | CRM consome; não duplica |
| Hardcode de funis (usar seed + IDs) | Tenant edita depois |
| `crm_oportunidades` paralela no P0 | Sem necessidade comprovada |
| IA → movimento de estoque | Regra de Ouro |
| Marketing cloud / e-sign no P0–P2 | Escopo |
| Cutover PROD neste doc | Doc separado |

---

# P0 — Produto vendável + ciclo mínimo

**Objetivo:** addon `crm` vendável; seed Vendas; win/loss; hub comercial.

### Bloco CRM-P0.1 — Decisões de produto registradas
- **Depende de:** —
- **Faz:** confirmar §0.2 / §0.5; atualizar este doc se mudar.
- **Pronto quando:** checklist §0.5 respondido (ou padrões aceitos).
- [ ] Feito

### Bloco CRM-P0.2 — Entitlement e nav do addon `crm`
- **Depende de:** P0.1
- **Faz:** hub CRM quando `empresa_addons.crm` enabled; `cockpit-nav` / permissions; Pessoas compartilháveis.
- **Pronto quando:** sem `crm` não vê hub comercial; com `crm` + `workflow` acessa funil Vendas.
- [ ] Feito

### Bloco CRM-P0.3 — Seed funil Vendas
- **Depende de:** P0.2
- **Faz:** ao ativar `crm` (+ backfill): funil **Vendas** (ex.: Qualificação → Proposta → Negociação → Ganhou / Perdeu); IDs em config; **idempotente**; exige `workflow`.
- **Pronto quando:** activate limpo cria 1 funil; religar não duplica.
- [ ] Feito

### Bloco CRM-P0.4 — Win/loss + motivo
- **Depende de:** P0.3
- **Faz:** ao finalizar: `resultado` ganhou|perdeu + `motivo`; histórico; BI receita só ganhas se possível.
- **Pronto quando:** fechar card exige resultado; filtros básicos.
- [ ] Feito

### Bloco CRM-P0.5 — UX hub CRM (mínimo)
- **Depende de:** P0.2, P0.3
- **Faz:** hub `/cockpit/crm`: Funil Vendas, Pessoas, Oportunidades, Relatórios; distinto de Workflow.
- **Pronto quando:** funil em ≤2 cliques a partir do hub.
- [ ] Feito

### Bloco CRM-P0.6 — Setup doc + smoke P0
- **Depende de:** P0.3–P0.5
- **Faz:** alinhar [setup/addon-crm.md](../setup/addon-crm.md); smoke multi-tenant.
- **Pronto quando:** onboarding só com setup doc; smoke verde em DEV.
- [ ] Feito

---

# P1 — Conta + atividades + itens

**Objetivo:** rotina B2B do vendedor.

### Bloco CRM-P1.1 — Modelo Account
- **Depende de:** P0 estável
- **Faz:** `crm_accounts` + FK contatos; migração de `empresa_cliente` quando possível; UI + link na opp.
- **Pronto quando:** conta com N contatos; card aponta account + contato.
- [ ] Feito

### Bloco CRM-P1.2 — Tarefas comerciais
- **Depende de:** P0.5
- **Faz:** tasks (`tipo`, `due_at`, responsável, card/lead/account); CRUD; concluir/cancelar.
- **Pronto quando:** follow-up a partir do card; lista por responsável.
- [ ] Feito

### Bloco CRM-P1.3 — Agenda simples
- **Depende de:** P1.2
- **Faz:** Hoje / Atrasados / Próximos 7 dias (paginado; filtro no servidor).
- **Pronto quando:** vendedor opera o dia sem só o Kanban.
- [ ] Feito

### Bloco CRM-P1.4 — Itens da oportunidade
- **Depende de:** P0 + SKUs
- **Faz:** `crm_card_itens`; total sugere `crm_cards.valor`; UI em abas.
- **Pronto quando:** opp com 2+ SKUs e total coerente.
- [ ] Feito

### Bloco CRM-P1.5 — Smoke P1
- **Depende de:** P1.1–P1.4
- **Faz:** conta → contato → opp com itens → tarefa → agenda.
- [ ] Feito

---

# P2 — Proposta + origem + IA

**Objetivo:** ciclo documentado + origem + assistente.

### Bloco CRM-P2.1 — Propostas
- **Depende de:** P1.4
- **Faz:** `crm_propostas`; snapshot itens; versão; PDF; status rascunho/enviada/aceita/recusada.
- **Pronto quando:** PDF a partir dos itens; histórico de versões.
- [ ] Feito

### Bloco CRM-P2.2 — Origem / UTM
- **Depende de:** P0
- **Faz:** campos origem; inbound; relatório origem→conversão (RPC paginado).
- **Pronto quando:** BI responde origem da venda ganha.
- [ ] Feito

### Bloco CRM-P2.3 — Metas e ranking
- **Depende de:** P0.4
- **Faz:** meta mensal por vendedor; ranking no hub/relatório.
- **Pronto quando:** admin define meta; vendedor vê progresso.
- [ ] Feito

### Bloco CRM-P2.4 — IA comercial
- **Depende de:** P0 + padrão Omni tags
- **Faz:** `[TRIAGE_CRM:…]` / `[PROXIMO_PASSO:…]`; reasoning; sugere tarefa/estágio; humano confirma; sem estoque.
- **Pronto quando:** sugestão no card com confirmação.
- [ ] Feito

### Bloco CRM-P2.5 — Eventos `crm.*`
- **Depende de:** domain events (Estoque×WF Onda 0) ou helper local
- **Faz:** `crm.oportunidade.ganha|perdida`, `crm.proposta.enviada`, etc.
- **Pronto quando:** eventos com `empresa_id`.
- [ ] Feito

### Bloco CRM-P2.6 — Smoke P2
- **Depende de:** P2.1–P2.4
- [ ] Feito

---

# P3 — Extensões

### Bloco CRM-P3.1 — E-mail / cadência
- **Depende de:** P1.2, P2
- **Faz:** e-mail ligado a pessoa/opp **ou** sequências simples.
- [ ] Feito

### Bloco CRM-P3.2 — Pedido → Estoque
- **Depende de:** P1.4, P2.5, Estoque×WF Onda 4
- **Faz:** ao ganhar/aceitar proposta → evento consumível (sem IA no cardex).
- [ ] Feito

### Bloco CRM-P3.3 — Lead scoring
- **Depende de:** P2.2, P2.4
- **Faz:** score simples; ordenação na lista.
- [ ] Feito

### Bloco CRM-P3.4 — Telefonia / e-sign / CPQ
- **Depende de:** demanda explícita
- **Faz:** um tema por PR.
- [ ] Feito

---

## Ordem sugerida de PRs

1. `P0.1` → `P0.2` → `P0.3` → `P0.4` → `P0.5` → `P0.6`  
2. `P1.1` ∥ `P1.4` possíveis; depois `P1.2` → `P1.3` → `P1.5`  
3. `P2.1` → `P2.2` / `P2.3` → `P2.4` → `P2.5` → `P2.6`  
4. P3 só com P0–P2 estáveis e demanda

---

## Critério de sucesso

| Fase | Alvo |
|------|------|
| P0 | Compra `crm` → hub + funil Vendas + win/loss |
| P1 | Conta, itens e follow-ups no dia a dia |
| P2 | Proposta PDF + origem + sugestão IA |
| P3 | E-mail/pedido no Business OS |

---

## Histórico

| Data | Nota |
|------|------|
| 2026-09-17 | Playbook P0–P3 + inventário |
| 2026-09-17 | Unificado: removido `planejamento-addon-crm.md` (conteúdo neste arquivo) |
