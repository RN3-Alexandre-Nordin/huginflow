# Smoke Scale: Relatórios Monte Sinai (DEV)

**Objetivo:** validar **paginação** (default 50), **consistência de cálculos** e **carga** das RPCs.  
**Empresa:** Monte Sinai Atacado (`415854c0-84a4-489f-a357-2cc0142b6b65`)  
**Scripts:**
1. Base — [`scripts/seed/monte-sinai-relatorios-dev.sql`](../../scripts/seed/monte-sinai-relatorios-dev.sql) (`seed_relatorios_ms`)
2. Scale — [`scripts/seed/monte-sinai-relatorios-dev-scale.sql`](../../scripts/seed/monte-sinai-relatorios-dev-scale.sql) (`seed_relatorios_ms_x` / `SEED_MSX_*` / `seed_msx_*`)

Login: `admin@montesinaiatacado.com.br`

---

## Volumes combinados (pós-scale)

| Domínio | Qtd aprox. |
|---------|------------|
| Movimentos `SEED_MSX_*` | 370+ (40 ent / 250 sai×3 / 80 aj×2) + base |
| Requisições (base+scale) | **82** |
| Remessas (base+scale) | **60** (18/18/18 MSX + base) |
| SKUs min / max | ≥20 / ≥15 |
| Cards scale | **120** (80 fechados + 40 abertos) |
| History scale | **~480** transitions |
| Threads (base+scale) | **180** |
| Msgs scale | **700** |

### Âncoras de cálculo (scale)

| Âncora | Esperado |
|--------|----------|
| Saídas `SEED_MSX_SAI_*` | cada linha qtd=**3** → unidades = `count × 3` |
| Ajustes `SEED_MSX_AJU_*` | cada linha qtd=**2**; metade `+` / metade `−` |
| Reqs atendida_total | pedida=10, atendida=10 → fill **100%** |
| Reqs atendida_parcial | pedida=10, atendida=5 → fill **50%** |
| Remessa MSX enviada | sempre **10** |
| Remessa parcial | retorno **3** (itens 19–36) |
| Remessa fechada | retorno **5** + baixa **5** (itens 37–54) |
| Receita cards scale fechados | `Σ(1000 + i×100)` para i=1..80 = **404.000** |

---

## Paginação (obrigatório)

Para cada slug listado com `total_count` > 50:

1. Abrir relatório com page_size **50**.
2. Confirmar página 1 com 50 linhas (ou `rows.length === 50`).
3. Ir para página 2 — deve trazer o restante; `total_count` estável.
4. Trocar page_size para **20** — conferir nº de páginas ≈ `ceil(total/20)`.

| Slug | `total_count` alvo (DEV) | Página 2? | OK? |
|------|--------------------------|-----------|-----|
| `ajustes-shrinkage` | ≥80 | sim | ☐ |
| `fill-rate-requisicoes` | ≥80 | sim | ☐ |
| `lead-time-req` | ≥50 | sim | ☐ |
| `remessa-retorno-baixa` | ≥55 | sim | ☐ |
| `skus-criticos` | ≥50 | sim | ☐ |
| `poder-terceiros` | ≥40 (ideal >50) | se >50 | ☐ |
| `excesso-maximo` | ≥15 | page_size 10 | ☐ |
| `valor-estoque` / `giro` / `consumo-doh` | ≥1; agregados coerentes | ☐ | ☐ |

RPC smoke (já medido após scale): ajustes≈93, fill≈89, rem≈62, críticos≥48, excesso≈15, poder≈42.

---

## Consistência (amostra)

| Check | Como | OK? |
|-------|------|-----|
| Receita scale | `wf-receita` 30d ≥ **404.000** só dos Scale Fechado* (ou total ≥ esse piso) | ☐ |
| Fill parcial | reqs `REQ-MSX-026`…`050` → 50% | ☐ |
| Fill total | reqs `REQ-MSX-051`…`070` → 100% | ☐ |
| Remessa mix | 18 aberta / 18 parcial / 18 fechada (`REM-MSX-*`) | ☐ |
| Ajustes signal | ~metade positivo / negativo nos `SEED_MSX_AJU_*` | ☐ |
| Omni handover | threads `seed_msx_*` com `handover_at` ≈ 84 | ☐ |
| Omni volume | ≥ **25–30 dias** com pontos | ☐ |
| Heatmap | várias células (hora × dow) | ☐ |

---

## Performance (rotina)

1. Abrir cada slug Estoque + BI com período **30 dias** (admin MS).
2. Tempo percebido de 1ª carga < ~3s em DEV (anotar outliers).
3. Paginar página 1→2→última sem travar / sem mudar totais.
4. Trocar filtros (família / canal / pipeline) e reabrir — sem timeout.
5. Confirmar no Network que a chamada é **uma** RPC (`est_rpc_relatorio` / `crm_rpc_relatorio`), não N+1.

---

## Inventário SQL (somente leitura)

```sql
SELECT 'mov_msx' AS t, count(*) FROM est_movimentos
 WHERE empresa_id='415854c0-84a4-489f-a357-2cc0142b6b65' AND documento LIKE 'SEED_MSX_%'
UNION ALL SELECT 'req_all', count(*) FROM est_requisicoes
 WHERE empresa_id='415854c0-84a4-489f-a357-2cc0142b6b65'
   AND sistema_origem IN ('seed_relatorios_ms','seed_relatorios_ms_x')
UNION ALL SELECT 'rem_all', count(*) FROM est_remessa_lotes
 WHERE empresa_id='415854c0-84a4-489f-a357-2cc0142b6b65'
   AND observacao IN ('seed_relatorios_ms','seed_relatorios_ms_x')
UNION ALL SELECT 'cards_msx', count(*) FROM crm_cards
 WHERE empresa_id='415854c0-84a4-489f-a357-2cc0142b6b65'
   AND metadados->>'seed_relatorios_ms_x'='true'
UNION ALL SELECT 'thr_all', count(*) FROM crm_chat_threads
 WHERE empresa_id='415854c0-84a4-489f-a357-2cc0142b6b65'
   AND (external_id LIKE 'seed_ms_%' OR external_id LIKE 'seed_msx_%');
```
