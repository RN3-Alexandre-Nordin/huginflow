# Decisões — Hugin plataforma + entitlements

Status: **congeladas para implementação** · W0 · 11/09/2026  
Checkpoint: `checkpoint/pre-core-2026-09-11`  
Roadmap: [roadmap-plataforma-entitlements.md](./roadmap-plataforma-entitlements.md)

## 1. Plataforma

- Hugin é a **plataforma** (auth, empresa, shell, entitlements).
- Workflow / Omni deixam de ser obrigatórios — viram **addons**.
- `empresa_id` canônico = `public.empresas.id` do Hugin. Proibido segundo cadastro mestre.

## 2. Dois eixos técnicos (sempre)

1. **Entitlement** da empresa (`empresa_addons.enabled`)
2. **RBAC** do usuário (`hasPermission` / matriz de grupos)

Nenhum substitui o filtro `empresa_id`.

## 3. Três níveis comerciais (não misturar)

| Nível | Tabela / domínio | Dono |
|-------|------------------|------|
| Catálogo | `addon_registry` | Superadmin RN3 |
| Entitlement + linha comercial | `empresa_addons` | Superadmin RN3 |
| Billing SaaS RN3 | `finance_*` / `finance_contratos` | Superadmin RN3 (`rn3Only`) |

## 4. Billing RN3 — decisão fechada

- **Permanece no Hugin** (não vai para Bifrost; não vira sistema à parte nesta fase).
- É capacidade de **plataforma** (`rn3Only`), não addon do tenant.
- Bifrost continua só **chamados**; pode consumir status depois via API, sem dono do ledger.
- Extrair billing RN3 só se no futuro virar ERP pesado ou produto vendável — **sem** levar entitlements.

## 5. Dois “Financeiros”

| | Billing RN3 | FinOps do cliente (futuro) |
|--|-------------|----------------------------|
| Slug | *não é addon* (menu `rn3Only`) | `finops` (reservado) |
| Rotas | `/cockpit/financeiro*` | Rotas **novas** |
| Tabelas | `finance_*` atuais | `finops_*` (proibido reusar `finance_*`) |

**Seed:** não criar addon `financeiro` ligado ao menu RN3. Reservar `finops` desligado.

## 6. Quem liga addons

Só `role_global = 'superadmin'` (RN3). Admin/operador da empresa não alteram entitlements.

## 7. Defaults de backfill (técnico)

| codigo | tipo | default_enabled | billable |
|--------|------|-----------------|----------|
| `cadastros` | foundation | true | false (`included`) |
| `workflow` | addon | true | true |
| `omni` | addon | true | true |
| `estoque` | addon | false | true |
| `crm` | addon | false | true |
| `finops` | addon | false | true (reservado, sem rotas) |

## 8. Regra enabled ≠ pagar

- `enabled` = acesso técnico
- `commercial_status` / `billable` = entra (ou não) no billing RN3
- Piloto/cortesia pode ter módulo ligado sem gerar AR

## 9. Cadastros mestres vs módulo Estoque (2026-09-11)

- **Pessoas / SKUs / Ativos** = Cadastros (mestres compartilhados da plataforma).
- **Centro de custo em Ativos** = `cad_ativos.departamento_id` → tabela `departamentos` (label UI “Centro de custo”). **Não** renomear `departamentos`.
- **Locais de estoque** (`cad_locais_estoque`, `local_padrao_id` no SKU) = **somente** addon `estoque`. Não criar em Cadastros nesta onda.
- Ativo mantém `localizacao` texto livre (lugar físico do bem), separado de local de estoque.
- **Modelo comercial (2026-09-11):** Estoque é módulo **nativo** no Hugin (mesmo app/Supabase). Foundation sempre on; `empresa_addons.estoque` liga/desliga por licença. Sem produto separado nem embed.  
  Planos: [plano-desenvolvimento-fases.md](./plano-desenvolvimento-fases.md) · [desenvolvimento-modulo-estoque.md](./desenvolvimento-modulo-estoque.md).  
  **REGRA DE OURO (estoque):** Cardex + Saldo na mesma transação — box no topo de [desenvolvimento-modulo-estoque.md](./desenvolvimento-modulo-estoque.md).

## 10. API interna (W6)

- Bearer / `X-HuginFlow-Secret`: env `HUGIN_ADDONS_INTERNAL_SECRET`
- `GET /api/v1/addons` — catálogo (`?include_prices=1` para RN3)
- `GET /api/v1/empresas/:id` — `tenant_id` = `empresas.id` (Bifrost intacto)
- `GET /api/v1/empresas/:id/addons` — enabled + commercial_status + plano (preços só com `include_prices=1`)
- Não expõe billing RN3 (`finance_*`) como addon do cliente
