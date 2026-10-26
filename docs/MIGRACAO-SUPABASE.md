# Migração Supabase — registro vivo (dev → produção)

> **Canônico de schema.** Runbook operacional do go-live: [CUTOVER-PROD-SET-2026.md](./specs-a-aplicar/CUTOVER-PROD-SET-2026.md).  
> Índice da documentação: [README.md](./README.md).  
> Atualize este documento a cada alteração de schema, migration no DEV, ou item no bundle de produção.

| Ambiente | Project ref | Dashboard | Evolution |
|----------|-------------|-----------|-----------|
| **Dev** | `vujqukqsfwmoezwyuoum` | [huginflow-dev](https://supabase.com/dashboard/project/vujqukqsfwmoezwyuoum) | `evo-dev.rn3.tec.br` |
| **Prod** | `zmypzexefjbovuknjlid` | [huginflow-prod](https://supabase.com/dashboard/project/zmypzexefjbovuknjlid) | `evo.rn3.tec.br` |

**Ciclo anterior fechado:** `v0.7.0` (tag no git, 05/10/2026). Cutover **01–52** aplicado em DEV e em PROD. Addons `estoque` e `compras` nascem desligados. O detalhe daquele pacote está no commit da tag, não neste registro.

**Este documento recomeça vazio** para a próxima versão. A primeira migration nova entra como linha 1 do changelog e como item **01** do cutover.

**Gate prod:** aplicar SQL ou código em produção somente com pedido explícito do responsável. `develop` ≠ `main`.

**Última migration deste ciclo no dev:** `omni_chat_indexes` (26/10/2026)  
**Última migration deste ciclo no prod:** `omni_chat_indexes` (26/10/2026)

**Gerar bundle SQL consolidado:**

```bash
node scripts/supabase/prod-deploy/build-bundle.mjs
```

**Saída:** `scripts/supabase/prod-deploy/out/huginflow-prod-pending.sql`

---

## Changelog (mais recente primeiro)

| Data | Migration / alteração | Dev | Prod | Arquivo | Notas |
|------|----------------------|-----|------|---------|-------|
| 2026-10-26 | `omni_chat_indexes` | ✅ | ✅ | `supabase/migrations/202610261300_omni_chat_indexes.sql` | Índices `crm_conversas (empresa_id, created_at desc)` e `crm_cards (empresa_id, conversa_id)`. Lista do Omni e checagem de acesso do operador faziam varredura sequencial. Vai junto com o deploy do chat sem fila de server actions. Cutover **03** |
| 2026-10-21 | `crm_interacoes_user_fk_set_null` | ✅ | ✅ | `supabase/migrations/202610211200_crm_interacoes_user_fk_set_null.sql` | DEV já tinha `ON DELETE SET NULL` (alterado sem arquivo); PROD bloqueia excluir usuário com interações. Achado pela homologação (`UI-OMNI-DEPT-SEND`). Cutover **02** |
| 2026-10-20 | Lacuna de segurança de 07/09 | ✅ | ✅ | `202609071530_phase3_permission_rls.sql` · `202609071900_phase4_knowledge_rbac.sql` · `202609072000_phase5_isolation_analytics.sql` · `202609072030_phase5_omni_department_membership.sql` · `202609072045_phase5_analytics_rbac.sql` | Aplicadas no DEV em 07/09 e esquecidas no cutover da v0.7.0. A homologação PROD do sistema inteiro acusou (`SCR-RBAC-01`, `SCR-ANALYTICS-01`). Aplicadas em PROD via MCP com os nomes dos arquivos; nenhuma migration posterior redefine esses objetos. |

**Legenda:** ✅ aplicado · ⏳ pendente · ❌ não necessário

---

## Pacote pendente para produção (ordem de execução)

| # | ID | Arquivo | Prod |
|---|-----|---------|------|
| 02 | `crm_interacoes_user_fk_set_null` | `supabase/migrations/202610211200_crm_interacoes_user_fk_set_null.sql` | ✅ 21/10 |
| 03 | `omni_chat_indexes` | `supabase/migrations/202610261300_omni_chat_indexes.sql` | ✅ 26/10 |

---

## Como aplicar em produção

1. Backup no Dashboard prod.
2. Pedido explícito do responsável.
3. Regenerar bundle: `node scripts/supabase/prod-deploy/build-bundle.mjs`
4. Revisar `scripts/supabase/prod-deploy/out/huginflow-prod-pending.sql`
5. Executar no SQL Editor do prod (por blocos `-- BUNDLE:` se preferir).
6. Atualizar a coluna **Prod** deste changelog para ✅.

---

## Template para nova entrada no changelog

```markdown
| YYYY-MM-DD | `nome_migration` | ✅/⏳ | ⏳ | `caminho/arquivo.sql` | Descrição breve. Cutover **NN** |
```
