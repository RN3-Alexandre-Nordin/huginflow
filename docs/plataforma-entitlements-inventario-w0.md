# Inventário W0 — nav → addon e páginas com guard

Atualizado em 11/09/2026 (Cadastros / Pessoas; Workflow só processo).

## Menu → gate

### Topo

| Item | Href | Gate |
|------|------|------|
| Cockpit | `/cockpit` | logado |

### Workflow

| Item | Href | Gate |
|------|------|------|
| Funis | `/cockpit/crm/funis` | `workflow` + funis |
| Relatórios | `/cockpit/relatorios` | relatorios |

### Omni

| Item | Href | Gate |
|------|------|------|
| Chat Omnichannel | `/cockpit/crm/chat` | `omni` + omni_chat |
| Base de Conhecimento | `/cockpit/crm/conhecimento` | `omni` + conhecimento |
| Canais Inbound | `/cockpit/configuracoes/canais` | `omni` + canais |

### Cadastros (mestres de negócio)

| Item | Href | Gate |
|------|------|------|
| Pessoas | `/cockpit/crm/leads` *(rota legacy)* | `workflow \|\| omni` + leads |

Futuro: Produtos (gate estoque\|compras), etc. — mapa addon → cadastros.

### Administração (tenant — dados sempre com `empresa_id`)

| Item | Href | Gate |
|------|------|------|
| Empresas | `/cockpit/empresas` | empresas |
| Usuários | `/cockpit/usuarios` | admin_usuarios |
| Grupos de Acesso | `/cockpit/grupos` | admin_grupos |
| Departamentos | `/cockpit/departamentos` | departamentos |

### Administração RN3 (só `role_global = superadmin`)

| Item | Href | Gate |
|------|------|------|
| Addons | `/cockpit/addons` | rn3Only |
| Financeiro | `/cockpit/financeiro` | rn3Only — **não** é addon FinOps |
| Contratos | `/cockpit/financeiro/contratos` | rn3Only |
| Módulo de Testes | `/cockpit/testes` | rn3Only |
| Simulador de Chat | `/cockpit/crm/simulador` | rn3Only |

## Páginas com guard de addon

### `workflow`

- `/cockpit/crm/funis*`
- `/cockpit/crm/cards/[id]/consulta` (híbrido workflow\|omni)
- `/cockpit/crm/leads*` (híbrido — mestre Pessoas)

### `omni`

- `/cockpit/crm/chat`
- `/cockpit/crm/conhecimento`
- `/cockpit/crm/simulador`
- `/cockpit/configuracoes/canais`

### Plataforma / tenant

- empresas, departamentos, usuarios, grupos, cockpit, relatorios, ajuda…

### Billing RN3

- `/cockpit/financeiro*`

## Defaults confirmados (backfill)

- Técnicos ON: `cadastros`, `workflow`, `omni`
- Técnicos OFF: `estoque`, `crm`, `finops`
- Sem slug `financeiro` no catálogo para o menu RN3
