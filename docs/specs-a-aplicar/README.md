# Specs a aplicar

Planejado ou **ainda não executado** (ex.: cutover PROD, features futuras).  
O que já está live em DEV fica em [`../specs-aplicadas/`](../specs-aplicadas/).

## Documentos

| Doc | Situação |
|-----|----------|
| [CUTOVER-PROD-SET-2026.md](./CUTOVER-PROD-SET-2026.md) | Runbook go-live · **PROD aguardando pedido explícito** |
| [integracao-estoque-workflow-ia.md](./integracao-estoque-workflow-ia.md) | Playbook DEV em blocos (Ondas 0–4) · seed Estoque + Workflow opcional · **a implementar** |
| [desenvolvimento-addon-crm.md](./desenvolvimento-addon-crm.md) | Addon CRM · inventário + playbook P0–P3 (doc único) · **a aplicar** |
| [estoque-lote-validade.md](./estoque-lote-validade.md) | Lote/batch + validade · migration `202609181800_estoque_lote_produto_validade` (DEV) · FEFO lib + UIs |

## Itens pendentes (sem doc dedicado ainda)

Extraídos do mapa de fases / roadmap — implementar ou documentar aqui quando virarem spec:

| Item | Origem | Notas |
|------|--------|-------|
| Pacotes SQL Cadastros + Estoque + BI + Entitlements em **PROD** | MIGRACAO / CUTOVER | Só com OK explícito |
| Homolog / 3 verdes Fase 6 Estoque (UI mutável operacional) | agente-testes · Estoque F4 | Scripts smoke ✅; UI entrada/req/remessa ainda parcial |
| Export consumido de estoque | Estoque F4.5 | Parcial — export massivo ⏳ |
| Sessão 7 — Ponte faturamento SaaS (entitlement ↔ contratos) W9 | Roadmap entitlements | Depois do core |
| Contagem cíclica / inventário físico | Spec Estoque | Fora do MVP · barramento de eventos na spec Integração |
| Integração SAP / legado estoque | Spec Estoque F6 | Depois · mesma língua de eventos (Fase C) |
| Callback card → requisição + templates de funil | Integração Estoque×WF×IA Onda 1 | Playbook em blocos |
| Seed funis ao ligar Estoque (sempre) + switches | Integração Onda 0 · [setup/addon-estoque.md](../setup/addon-estoque.md) | Cards só com Workflow |
| Addon CRM comercial (hub, win/loss, account, propostas…) | [desenvolvimento-addon-crm.md](./desenvolvimento-addon-crm.md) | Doc único inventário + blocos P0–P3 |
| IA de-para / triage estoque / Omni→req | Integração Onda 3 | Gate na Regra de Ouro |

Índice geral: [`../README.md`](../README.md)
