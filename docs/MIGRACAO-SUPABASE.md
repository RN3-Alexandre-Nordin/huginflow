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

**Última migration deste ciclo no dev:** —  
**Última migration deste ciclo no prod:** —

**Gerar bundle SQL consolidado:**

```bash
node scripts/supabase/prod-deploy/build-bundle.mjs
```

**Saída:** `scripts/supabase/prod-deploy/out/huginflow-prod-pending.sql`

---

## Changelog (mais recente primeiro)

| Data | Migration / alteração | Dev | Prod | Arquivo | Notas |
|------|----------------------|-----|------|---------|-------|

**Legenda:** ✅ aplicado · ⏳ pendente · ❌ não necessário

Nenhuma migration deste ciclo.

---

## Pacote pendente para produção (ordem de execução)

| # | ID | Arquivo | Prod |
|---|-----|---------|------|

Nenhum item. Ao criar a migration, copiar a linha para cá e para a Seção 4 do cutover, na ordem de execução.

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
