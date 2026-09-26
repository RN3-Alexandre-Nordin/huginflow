# Plano de desenvolvimento — Hugin Flow (fases)

Documento **mestre** para fasear o que já existe + o que vem a seguir.  
Atualizar checkboxes a cada fechamento de fase. Índice: [README.md](../README.md).

| | |
|--|--|
| **Atualizado** | 2026-09-17 |
| **Modelo** | App único · Supabase único · Foundation sempre on · módulos on/off (`empresa_addons`) |
| **Prod** | Só com **pedido explícito** ([MIGRACAO-SUPABASE.md](../MIGRACAO-SUPABASE.md) · [CUTOVER-PROD-SET-2026.md](../specs-a-aplicar/CUTOVER-PROD-SET-2026.md)) |
| **Checkpoint** | `checkpoint/pre-core-2026-09-11` |

### Docs relacionados (canônicos)

| Doc | Papel |
|-----|--------|
| [plataforma-entitlements-decisoes.md](./plataforma-entitlements-decisoes.md) | Decisões congeladas (por quê) |
| [roadmap-plataforma-entitlements.md](./roadmap-plataforma-entitlements.md) | Detalhe W0–W9 entitlements |
| [desenvolvimento-modulo-estoque.md](./desenvolvimento-modulo-estoque.md) | Spec Estoque (F4/F5) |
| [planejamento-modulo-relatorios-bi.md](./planejamento-modulo-relatorios-bi.md) | Spec BI / relatórios |
| [MIGRACAO-SUPABASE.md](../MIGRACAO-SUPABASE.md) | Log vivo schema + pacotes ⏳ PROD |
| [CUTOVER-PROD-SET-2026.md](../specs-a-aplicar/CUTOVER-PROD-SET-2026.md) | Runbook go-live |
| [homologacao/agente-testes-plano.md](../homologacao/agente-testes-plano.md) | Agente E2E |

---

## Visão em uma frase

Vender **licença Foundation** (sempre) e **ligar módulos** (Workflow, Omni, Estoque…) conforme o cliente compra — tudo nativo no Hugin, sem embed.

---

## Mapa de fases

```
F0 Foundation/plataforma     ✅ DEV (código + SQL) · ⏳ prod
F1 Cadastros mestres         ✅ DEV · ⏳ homolog · ⏳ prod
F2 Shell / nav hubs          ✅ DEV (incl. pasta Estoque)
F3 Homologação + cutover SQL ⏳ (Cadastros + Estoque + BI no mesmo release sob pedido)
F4 Estoque MVP               ✅ DEV (F4.1–F4.4) · F4.5 parcial ✅ · ⏳ prod
F5 Piloto Estoque / go-live  📋
F6 Integrações / billing     📋 (depois)
```

BI hub (`/cockpit/relatorios` + RPCs) ✅ DEV · ⏳ prod — ver spec BI.

---

## F0 — Plataforma + entitlements

**Objetivo:** catálogo de módulos + liga/desliga por empresa + gates de menu/API.

| Item | Status |
|------|--------|
| `addon_registry` + `empresa_addons` | ✅ DEV |
| Seed: cadastros / workflow / omni / estoque / crm / finops | ✅ DEV |
| Motor `empresaHasAddon` / guards | ✅ código |
| UI Addons (RN3) + ficha empresa | ✅ código |
| API v1 addons | ✅ código |
| E2E entitlements | ✅ agente (fase entitlements) |
| SQL em **prod** | ⏳ pedido explícito (`202609111200`) |

**Saída:** Foundation sempre on; demais módulos controláveis.

Detalhe: [roadmap-plataforma-entitlements.md](./roadmap-plataforma-entitlements.md).

---

## F1 — Cadastros mestres (compartilhados)

**Objetivo:** Pessoas, SKUs (UM/de-para/fiscal), Ativos — base para Estoque e outros módulos.

| Item | Status |
|------|--------|
| Pessoas (`crm_leads` campos) | ✅ DEV |
| SKUs + conversões + de-para | ✅ DEV |
| Reforma fiscal SKU | ✅ DEV |
| Ativos + CC=`departamento_id` | ✅ DEV |
| Famílias SKU | ✅ DEV |
| Locais de estoque | ❌ **não** aqui → F4 |
| Homolog / smoke DEV | ⏳ |
| Pacote SQL C1–C8 em **prod** | ⏳ pedido explícito |

**Migrations:** ver [MIGRACAO-SUPABASE.md](../MIGRACAO-SUPABASE.md) § Pacote Cadastros.

**Saída:** mestres prontos; Estoque só consome SKU/Pessoas/Depto.

---

## F2 — Shell moderno (hubs)

**Objetivo:** sidebar estilo Bifrost — pastas de módulo + hub com cards.

| Item | Status |
|------|--------|
| Pastas: Cockpit, Workflow, Omni, Cadastros, Admin, RN3 | ✅ DEV |
| Hubs + cards filtrados por addon/RBAC | ✅ DEV |
| Subnav SKUs (Catálogo / Conversões / De-para) | ✅ DEV |
| Item ativo (barra inset) | ✅ DEV |
| Pasta **Estoque** + hub operacional | ✅ DEV |
| Hub Relatórios BI | ✅ DEV |

**Saída:** menu não explode; cada módulo novo = pasta + hub.

---

## F3 — Homologação + cutover (gate prod)

**Objetivo:** validar F0–F4/BI em DEV e, **só com OK explícito**, aplicar SQL/código em prod.

### Checklist DEV
- [ ] Smoke Pessoas / SKUs / Conversões / De-para / Ativos  
- [ ] Smoke hubs + entitlements (módulo off some do menu)  
- [ ] Smoke Estoque (checklist em MIGRACAO) + BI  
- [ ] Bateria E2E (`test:agent:dev`) verde  
- [ ] Commit/release alinhado (sem segredos)

### Cutover prod (quando pedir)
- [ ] Backup  
- [ ] Pacotes na ordem do [CUTOVER-PROD-SET-2026.md](../specs-a-aplicar/CUTOVER-PROD-SET-2026.md)  
- [ ] Deploy app (`main` só com OK)  
- [ ] Smoke prod  

**Regra:** não aplicar DDL em prod sem pedido explícito.

---

## F4 — Estoque MVP (nativo)

**Origem:** proposta *Controle de Estoques — Materiais de Uso e Consumo* (Atlas).  
**Spec:** [desenvolvimento-modulo-estoque.md](./desenvolvimento-modulo-estoque.md).

| Subfase | Entrega | Status DEV |
|---------|---------|------------|
| **F4.0** | Workshop operacional | ⏳ / defaults no doc |
| **F4.1** | Locais, Cardex/Saldo, RLS, RBAC, hub, config | ✅ |
| **F4.2** | Entrada lote / planilha / XML NFe | ✅ |
| **F4.3** | Requisição + aprovação interna + planilha | ✅ |
| **F4.4** | Retirada + transferência + ajuste + remessa + atendimento | ✅ |
| **F4.5** | Saldos + relatórios RPC; export consumido | ✅ parcial (export ⏳) |

**Escopo piloto:** 1 CNPJ · 2 admins · ~20 usuários departamentais.

**Fora do MVP F4:** SAP/legado, inventário cíclico, MRP.

**Só DEV** até F5 / pedido explícito de prod. Automação E2E Estoque (agente “Fase 6”): scripts `SCR-EST-*` + smoke UI hub/consultas — UI mutável operacional ainda parcial.

---

## F5 — Piloto Estoque / go-live

| Item | Status |
|------|--------|
| Treino admins + departamentais | 📋 |
| Hiper-care | 📋 |
| Cutover SQL Estoque + código (pedido explícito) | 📋 |
| Addon `estoque` on no tenant | 📋 |
| Critérios de pronto do [desenvolvimento-modulo-estoque.md](./desenvolvimento-modulo-estoque.md) §15 | 📋 |

---

## F6 — Depois do núcleo Estoque

| Tema | Notas |
|------|--------|
| Integração SAP / legado | API-first / webhooks |
| Ponte entitlement → `finance_contratos` | Sessão 7 do roadmap plataforma |
| CRM comercial / FinOps | Slugs reservados; sem escopo agora |
| Export consumido / inventário cíclico | Pós F4.5 |

---

## Ordem de trabalho sugerida (agora)

| # | Fase | Ação |
|---|------|------|
| 1 | F3 | Smoke DEV Cadastros + Estoque + BI; agente Fases 1–5 verde |
| 2 | F3 | Cutover **somente** com pedido explícito ([CUTOVER](../specs-a-aplicar/CUTOVER-PROD-SET-2026.md)) |
| 3 | F5 | Piloto Atlas após prod |
| 4 | F6 | SAP / billing ponte — depois |

---

## Dependências entre blocos

```mermaid
flowchart LR
  F0[F0 Entitlements] --> F1[F1 Cadastros]
  F0 --> F2[F2 Hubs]
  F1 --> F3[F3 Homolog/Cutover]
  F2 --> F3
  F1 --> F4[F4 Estoque MVP]
  F2 --> F4
  F4 --> F5[F5 Piloto]
  F5 --> F6[F6 SAP / Billing]
```

---

## Legenda

| Símbolo | Significado |
|---------|-------------|
| ✅ | Feito em DEV (ou prod se indicado) |
| ⏳ | Pendente / em curso |
| 📋 | Planejado |
| ❌ | Fora desta fase de propósito |
