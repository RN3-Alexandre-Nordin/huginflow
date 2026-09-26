# Estoque — Lote/batch + validade (kernel)

**Status:** aplicado em DEV (schema/RPC + libs + UIs); PROD pendente de OK explícito  
**Branch:** `develop`  
**Decisões:** só lote/batch (não série); FEFO sugerido com override; opt-in `controla_lote` no SKU

| Relacionado | Papel |
|-------------|--------|
| [desenvolvimento-modulo-estoque.md](../specs-aplicadas/desenvolvimento-modulo-estoque.md) | Canônico Estoque (grão SKU×local hoje) |
| Plano Cursor | Estoque Lote Validade |

---

## Glossário (obrigatório)

| Termo | Significado |
|-------|-------------|
| **Lote documento** | Cabeçalho operacional: `est_entrada_lotes`, `est_retirada_lotes`, … FK `lote_entrada_id` no cardex |
| **Lote produto** | Identidade de fabricação/batch: `est_lotes_produto` (`numero_lote` + `data_validade`); FK `lote_produto_id` |
| **FEFO** | First Expired, First Out — sugere lotes por validade ASC |

Nunca misturar os dois conceitos em UI ou SQL.

---

## Decisões de produto

| Tema | Decisão |
|------|---------|
| Escopo | Só **lote/batch** + validade (série unitária = futuro) |
| Saídas | FEFO **sugerido**; operador pode alterar |
| Opt-in | `cad_skus.controla_lote`; sem flag = grão atual SKU×local |
| Dados existentes | `lote_produto_id` NULL em saldos/movimentos atuais |

---

## Modelo

### `cad_skus`

- `controla_lote boolean NOT NULL DEFAULT false`
- `exige_validade boolean NOT NULL DEFAULT true` (só relevante se `controla_lote`)

### `est_lotes_produto`

- `id`, `empresa_id`, `sku_id`, `numero_lote`, `data_validade`, `data_fabricacao`
- UNIQUE `(empresa_id, sku_id, numero_lote)`

### `est_saldos` / `est_movimentos` / `est_saldos_poder_terceiros`

- `lote_produto_id uuid NULL`
- Uniques parciais: sem lote vs com lote
- RPC `p_lote_produto_id`; rebuild agrega por lote

### Regra

- `controla_lote = true` → movimento **exige** `lote_produto_id`
- `controla_lote = false` → `lote_produto_id` **deve** ser NULL

---

## Aceite MVP

1. Entrada com lote sobe saldo no grão sku×local×lote  
2. Saída sugere FEFO; override manual; cardex audita lote  
3. SKU sem flag inalterado  
4. Remessa preserva lote em poder de terceiros  
5. Testes SCR/UI cobrem grão dual  

## Ondas

0 Spec (este doc) · 1 Schema+RPC · 2 Entrada/Saldos/Cardex · 3 Saídas+FEFO · 4 Relatórios+testes

**PROD:** SQL só com OK explícito.
