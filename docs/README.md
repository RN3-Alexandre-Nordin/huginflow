# Documentação Hugin Flow (canônicos)

Índice enxuto. Antes de desenvolver, cutover ou homologar, leia o **canônico do domínio** — não inventar padrão paralelo.

## Specs de produto

| Pasta | Conteúdo |
|-------|----------|
| [**specs-aplicadas/**](./specs-aplicadas/) | Specs **já implementadas em DEV** |
| [**specs-a-aplicar/**](./specs-a-aplicar/) | Specs / runbooks **planejados ou ainda não aplicados** (ex.: cutover PROD) |

### Atalhos — aplicadas

| Antes de… | Ler |
|-----------|-----|
| Qualquer feature / fase | [specs-aplicadas/plano-desenvolvimento-fases.md](./specs-aplicadas/plano-desenvolvimento-fases.md) |
| Addon, menu, gate, RBAC | [specs-aplicadas/plataforma-entitlements-decisoes.md](./specs-aplicadas/plataforma-entitlements-decisoes.md) · [roadmap](./specs-aplicadas/roadmap-plataforma-entitlements.md) |
| Estoque | [specs-aplicadas/desenvolvimento-modulo-estoque.md](./specs-aplicadas/desenvolvimento-modulo-estoque.md) |
| Compras | Plano Cursor **Addon Compras** (guia única; fases 1–4 concluídas; próxima é a nota) |
| Relatórios / BI | [specs-aplicadas/planejamento-modulo-relatorios-bi.md](./specs-aplicadas/planejamento-modulo-relatorios-bi.md) |
| Bifrost (chamados SSO) | [specs-aplicadas/bifrost-embed.md](./specs-aplicadas/bifrost-embed.md) |

### Atalhos — a aplicar

| Papel | Doc |
|-------|-----|
| Runbook go-live PROD | [specs-a-aplicar/CUTOVER-PROD-SET-2026.md](./specs-a-aplicar/CUTOVER-PROD-SET-2026.md) |
| Estoque × Workflow × IA (playbook em blocos) | [specs-a-aplicar/integracao-estoque-workflow-ia.md](./specs-a-aplicar/integracao-estoque-workflow-ia.md) |
| Addon CRM (inventário + playbook P0–P3) | [specs-a-aplicar/desenvolvimento-addon-crm.md](./specs-a-aplicar/desenvolvimento-addon-crm.md) |
| Setup addon Estoque (seed + switches) | [setup/addon-estoque.md](./setup/addon-estoque.md) |
| Setup addon CRM | [setup/addon-crm.md](./setup/addon-crm.md) |
| Backlog resumido | [specs-a-aplicar/README.md](./specs-a-aplicar/README.md) |

## Schema / ops (DEV → PROD)

| Papel | Doc |
|-------|-----|
| **Log vivo** de migrations + pacotes ⏳ PROD | [MIGRACAO-SUPABASE.md](./MIGRACAO-SUPABASE.md) |
| MCP Cursor DEV/PROD | [mcp-supabase-cursor.md](./mcp-supabase-cursor.md) |
| Deploy VPS (GH Actions) | [deploy-vps-github-actions.md](./deploy-vps-github-actions.md) |

**Lei:** SQL/código em **prod** e branch **`main`** só com pedido explícito.

## Testes / homologação

| Papel | Doc |
|-------|-----|
| Agente E2E (controle mestre) | [homologacao/agente-testes-plano.md](./homologacao/agente-testes-plano.md) |
| Checklist release (humano) | [homologacao/plano-homologacao-versao.md](./homologacao/plano-homologacao-versao.md) |
| Índice homolog | [homologacao/README.md](./homologacao/README.md) |
| Smoke volume BI/estoque (Monte Sinai DEV) | [testes/smoke-relatorios-monte-sinai-dev.md](./testes/smoke-relatorios-monte-sinai-dev.md) |
| Stress (opcional) | [homologacao/stress-test-plan.md](./homologacao/stress-test-plan.md) |

## Manuais do usuário

| Papel | Doc |
|-------|-----|
| Índice + captura de prints | [manuais/README.md](./manuais/README.md) |
| Assets (PNG/vídeo) | [manual/README.md](./manual/README.md) |

## Regras no repo (sempre)

- `.cursorrules` · `.cursor/rules/git-main-e-producao.mdc` · `.cursor/rules/saas-performance.mdc` · `.cursor/rules/ui-design-system-abas.mdc`
