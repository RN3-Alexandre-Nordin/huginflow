# Demo — Entrada de estoque via NF-e (XML)

**Tenant:** Monte Sinai Atacado (DEV)  
**Tela:** Cockpit → Estoque → Entradas → **Importar XML**  
**Arquivos:** nesta pasta

| Ordem | Arquivo | O que mostrar |
|-------|---------|---------------|
| **1º** | [nfe-demo-entrada-fornecedor-novo.xml](./nfe-demo-entrada-fornecedor-novo.xml) | Fornecedor **novo** + de-para assistido |
| **2º** | [nfe-demo-entrada-depara-pronto.xml](./nfe-demo-entrada-depara-pronto.xml) | Caminho feliz (tudo já cadastrado) |

## Cenário A — Fornecedor novo

| Campo | Valor |
|-------|--------|
| Emitente | DISTRIBUIDORA DELTA DEMO LTDA |
| CNPJ | **88.777.666/0001-55** (não existe no tenant) |
| NF | 900 · R$ 560,80 |
| Itens (`cProd`) | `DL-AGUA500SG`, `DL-HEIN330`, `DL-REDLBL1L` |

**Roteiro sugerido**

1. Upload do XML A.  
2. Sistema não acha o CNPJ → **Cadastrar fornecedor** (confirma dados do emit).  
3. Em cada linha sem de-para → **apontar SKU existente** (rápido na demo):
   - `DL-AGUA500SG` → `AGUA-044`
   - `DL-HEIN330` → `CERV-001`
   - `DL-REDLBL1L` → `DEST-011`
4. Confirmar entrada → saldo sobe no local principal.

## Cenário B — De-para pronto

| Campo | Valor |
|-------|--------|
| Emitente | DISTRIBUIDORA BETA TESTE LTDA |
| CNPJ | **99.888.777/0001-66** (já em Pessoas) |
| NF | 901 · R$ 1.102,00 |
| Itens | `BT-AGUA500SG` → AGUA-044 · `BT-HEIN330` → CERV-001 · `BT-REDLBL1L` → DEST-011 |

**Roteiro sugerido**

1. Upload do XML B.  
2. Fornecedor e 3 SKUs já resolvidos.  
3. Confirmar → cardex + saldo (mostrar Saldos / Cardex depois).

## Pré-check (antes da reunião)

- [ ] Login no tenant Monte Sinai DEV  
- [ ] Addon estoque + permissão de entradas  
- [ ] Local principal (BRANCO) ok  
- [ ] CNPJ Delta **ainda não** está em Pessoas (se já cadastrou num ensaio, apague ou use outro XML)  
- [ ] Beta + 3 de-paras BT-* ainda existem (conferido em DEV em 2026-09-17)

## Observação

O de-para usa só o **`cProd`** do XML (`codigo_parceiro`), por fornecedor. EAN/NCM/xProd preenchem cadastro de SKU novo, mas **não** fazem o match automático.
