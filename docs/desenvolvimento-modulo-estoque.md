# Desenvolvimento — Módulo Estoque (Hugin Flow)

Documento de **implementação** do módulo Estoque (MVP Atlas / materiais de uso e consumo).

| | |
|--|--|
| **Status** | Pronto para iniciar em **DEV** (F4.1) |
| **Atualizado** | 2026-09-11 |
| **Fases no mapa geral** | F4 / F5 em [plano-desenvolvimento-fases.md](./plano-desenvolvimento-fases.md) |
| **Proposta comercial** | *Controle de Estoques para Materiais de Uso e Consumo* (RN3 / Atlas) |
| **Prod** | Só com **pedido explícito** |

---

> ## REGRA DE OURO — Cardex + Saldo (nunca esquecer)
>
> **Toda operação que movimente estoque grava no Cardex (`est_movimentos`) e atualiza o Saldo (`est_saldos`) na MESMA transação de banco.**
>
> - Um único `BEGIN` … `COMMIT` (preferir **RPC Postgres** atômica).  
> - Qualquer falha → **ROLLBACK** total.  
> - **Proibido:** dois commits, dois round-trips sem transação, ou deixar um lado gravado e o outro não.  
> - Detalhe: §2 (Integridade) · §4.0 · §4.10 · §4.13 (batch também atômico).
>
> *Se uma mudança de código violar esta regra, a mudança está errada — corrija antes de merge.*

---

## 1. Objetivo

Entregar no Hugin um módulo **nativo** de **operações** de estoque de consumíveis.

**MVP — só funcionalidades (criar agora):**

| # | Funcionalidade | Modos |
|---|----------------|--------|
| 1 | Locais de estoque | CRUD |
| 2 | Configuração do módulo | Diretório de rede dos XMLs de NFe (rede **local** do cliente) |
| 3 | Entrada de estoque | (a) lote na tela (**com justificativa**) · (b) planilha · (c) XML NFe |
| 4 | Retirada de estoque | Lote em tela (tabela) — **somente manual** |
| 5 | Transferência entre locais | Manual |
| 6 | Ajuste de estoque | Lote em tela (tabela) — **somente manual** · positivo / negativo |
| 7 | Requisição de materiais | Manual + planilha · requisitante em Pessoas · param. saldo + workflow opcional |
| 8 | Atendimento de requisição | Gera baixa (`saida` / origem `requisicao`) — distinto da tela de Retiradas |
| 9 | Cardex + Saldo + batch | Toda movimentação grava cardex e atualiza saldo; rotina reconstrói saldos |

**Fora do MVP — consultas e relatórios (depois):**

- Tela de saldos / consultas  
- Exportação planilha do consumido  
- Dashboard / KPIs  
- Integração SAP / legado  
- **Contagem cíclica / inventário físico**

**Nota:** regras de negócio do MVP funcional estão **fechadas** (exceto implementação em DEV). Saldos/cardex no banco sustentam operações; **sem** telas de consulta/relatório neste ciclo.

**Escopo piloto:** 1 CNPJ · 2 admins · ~20 usuários departamentais.

---

## 2. Arquitetura (não negociável)

| Decisão | Detalhe |
|---------|---------|
| Onde vive | **Dentro do Hugin** (mesmo Next.js + mesmo Supabase) |
| Comercial | Foundation sempre on · slug **`estoque`** liga/desliga |
| Sem | Produto separado, iframe, segundo banco |
| Tenant | Toda tabela com `empresa_id` |
| Segurança | Entitlement `empresa_addons.estoque` **e** RBAC módulo `estoque` |
| UI | Pasta **Estoque** na sidebar → hub com cards (padrão Bifrost) |
| **REGRA DE OURO** | Cardex + Saldo na **mesma transação**; falha → **ROLLBACK**. Ver box no topo deste doc. |

### REGRA DE OURO — Integridade transacional

Operações envolvidas: entrada, retirada, transferência, ajuste, atendimento de requisição (e qualquer outra que altere posição).

**Enunciado:** gravar Cardex **e** atualizar Saldo no **mesmo** commit atômico — **sempre**.

| Deve | Não pode |
|------|----------|
| Um único `BEGIN` / `COMMIT` (ou RPC Postgres atômica) cobrindo INSERT Cardex + UPSERT/UPDATE Saldo | Gravar Cardex e Saldo em requests/actions separados |
| Rollback se validação, saldo insuficiente ou erro de escrita falhar no meio | Deixar Cardex sem Saldo (ou Saldo sem Cardex) após erro parcial |
| Preferir **RPC/SQL** (`SECURITY DEFINER` + checagens) ou transaction no server action com cliente que suporte multi-statement atômico | “Best effort” no client / dois `await supabase.from` sem transação |
| Lote com N itens: cada item OK na mesma transação do item **ou** lote inteiro atômico conforme política do canal — **nunca** item pela metade (cardex sim / saldo não) | Atualizar só um lado e “corrigir depois” no happy path |

A rotina batch (§4.13) também é atômica **por empresa**: reescrita de saldos em uma transação. Ela é a **única** exceção autorizada a recalcular Saldo **lendo** o Cardex sem criar movimento novo.

### O que **não** entra neste módulo (fica em Cadastros)

| Cadastro | Onde |
|----------|------|
| Pessoas (fornecedor/cliente) | Cadastros → Pessoas (`crm_leads`) |
| SKUs | Cadastros → SKUs (`cad_skus`) |
| Conversões UM | Cadastros → Conversões UM (`cad_sku_unidade_conversao`) |
| De-para parceiro | Cadastros → De-para SKU (`cad_sku_depara`) |
| Ativos / patrimônio | Cadastros → Ativos |

Estoque **consome** esses mestres. Na **entrada**, fornecedor, de-para e conversão de UM são **obrigatórios** conforme §6 (não opcionais). **Retiradas** e **ajustes** são **somente manuais** (sem planilha/XML).

### Diretório de XMLs NFe (rede local × VPS)

O caminho configurado aponta para a **rede local do cliente** (ex.: `\\servidor\nfe\entrada`). **Não** fica na VPS do Hugin.

| Peça | Onde roda | Papel |
|------|-----------|--------|
| Tela Configuração | Hugin (cloud) | Guarda o path UNC/local + opções por `empresa_id` |
| Agente / conector on-prem | Rede do cliente | Lê a pasta, envia XML (ou conteúdo) à API do Hugin |
| Motor de entrada | Hugin (cloud) | Valida (§5) e grava lote / movimentos |

A VPS **não** monta nem varre pastas da LAN do cliente.

---

## 3. Entregáveis × fases

### Agora — funcionalidades (F4.1 → F4.4)

| Entregável | Fase | Rotas |
|------------|------|-------|
| Locais | **F4.1** | `/cockpit/estoque/locais` |
| Configuração do módulo | **F4.1** | `/cockpit/estoque/configuracao` |
| Entrada — lote na tela | **F4.2** | `/cockpit/estoque/entradas/novo` |
| Entrada — planilha | **F4.2** | `/cockpit/estoque/entradas/import` |
| Entrada — XML NFe | **F4.2** | ingestão via agente + fila/processamento em `/cockpit/estoque/entradas` |
| Requisição (manual + planilha) | **F4.3** | `/cockpit/estoque/requisicoes`, `.../import` |
| Saída / atendimento de requisição | **F4.4** | fluxo em `/cockpit/estoque/requisicoes` (atender) |
| Retirada de estoque (lote tabular, manual) | **F4.4** | `/cockpit/estoque/retiradas` |
| Transferência entre locais | **F4.4** | `/cockpit/estoque/transferencias` |
| Ajuste de estoque (lote tabular, manual) | **F4.4** | `/cockpit/estoque/ajustes` |
| Ledger / **Cardex** + **Saldo** + batch reconstruir | **F4.1** | tabelas + RPC; botão em Configuração |

### Depois — consultas e relatórios (F4.5+)

| Entregável | Fase | Rotas |
|------------|------|-------|
| Consulta de saldos | **depois** | `/cockpit/estoque/saldos` |
| Export consumido | **depois** | `/cockpit/estoque/export` |
| Dashboard KPIs | **depois** | `/cockpit/estoque/relatorios` |
| SAP / legado | **F6** | API / webhooks |

---

## 4. Modelo de dados (MVP)

Prefixos: `cad_locais_estoque` (cadastro do módulo) · `est_*` (operacional).

### 4.0 Núcleo obrigatório — Cardex + Saldo

> **REGRA DE OURO:** Cardex + Saldo na **mesma transação** · falha → **ROLLBACK** · ver box no topo do documento.

Duas tabelas centrais. **Toda** operação de estoque (entrada, retirada, transferência, ajuste, atendimento de requisição) deve, **na mesma transação de banco**:

1. **Gravar** uma (ou mais) linha(s) no **Cardex** (`est_movimentos`)  
2. **Atualizar** o **Saldo** (`est_saldos`)  

**Integridade:** se qualquer um dos passos falhar → **ROLLBACK** de tudo. Não existe estado válido com Cardex e Saldo divergentes após um commit de operação online.

| Proibido | Obrigatório |
|----------|-------------|
| Dois commits (Cardex depois Saldo, ou o inverso) | Uma transação única |
| Retry só de um lado | Retry da operação completa |
| Patch manual de saldo “para bater” no happy path | Usar batch §4.13 só para reconciliação / ops |

Nunca atualizar saldo sem cardex · nunca gravar cardex sem refletir no saldo (exceto a rotina batch de reconciliação, que **recalcula** saldos a partir do cardex, também em transação).

| Tabela | Papel | Nome amigável |
|--------|-------|----------------|
| `est_movimentos` | Histórico imutável de movimentações | **Cardex** |
| `est_saldos` | Posição atual por SKU × local | **Saldo de estoque** |

Fonte da verdade para auditoria: **Cardex**. Saldo é projeção materializada para performance e validação de disponibilidade.

### 4.1 `cad_locais_estoque`

| Coluna | Tipo | Notas |
|--------|------|--------|
| id | uuid PK | |
| empresa_id | uuid NOT NULL | FK empresas · índice |
| codigo | text NOT NULL | único por empresa · ver §5 (`BRANCO`) |
| nome | text NOT NULL | |
| tipo | text | `deposito` \| `almoxarifado` \| `loja` \| `outro` \| `principal` |
| eh_principal | boolean | default false · no máx. **1** por empresa |
| departamento_id | uuid NULL | FK departamentos (opcional) |
| ativo | boolean | default true |
| created_at / updated_at | timestamptz | |

**Convenção `BRANCO`:** local principal para empresas que **não** operam com múltiplos locais — ver §5.

### 4.2 `est_config` (1 linha por empresa)

| Coluna | Tipo | Notas |
|--------|------|--------|
| empresa_id | uuid PK | FK empresas |
| nfe_xml_diretorio | text NULL | Path UNC/local na **rede do cliente** (não VPS) |
| nfe_xml_local_padrao_id | uuid NULL | Local default NFe · se null, usa local `eh_principal` / `BRANCO` |
| req_saldo_insuficiente_modo | text NOT NULL | ver §10.4 · default `atende_parcial_pendente` |
| aprovacao_via_workflow | boolean | default false · se true, cria card no funil/estágio abaixo |
| aprovacao_funil_id | uuid NULL | FK funil Workflow (mesmo tenant) |
| aprovacao_estagio_id | uuid NULL | FK estágio/etapa inicial do card de aprovação |
| updated_at | timestamptz | |
| updated_by | uuid NULL | |

**`req_saldo_insuficiente_modo` (atendimento):**

| Valor | Comportamento |
|-------|----------------|
| `atende_parcial_pendente` | Libera a quantidade **existente**; o restante do item fica **pendente** |
| `nao_atende_requisicao` | **Não atende** a requisição inteira (nenhum item baixa) |
| `pula_item` | Atende os **outros** itens; o item sem saldo **não envia nada** (qtd atendida = 0 naquele item) |

### 4.3 `est_saldos` (Saldo de estoque)

Posição **atual** por empresa × SKU × local. Atualizada a cada movimento e reconstruível pelo batch (§4.13).

| Coluna | Tipo | Notas |
|--------|------|--------|
| id | uuid PK | |
| empresa_id | uuid NOT NULL | |
| sku_id | uuid NOT NULL | FK cad_skus |
| local_id | uuid NOT NULL | FK cad_locais_estoque |
| quantidade | numeric(18,4) NOT NULL | sempre em **UM de estoque** do SKU · ≥ 0 no MVP |
| updated_at | timestamptz | |

**Unique:** `(empresa_id, sku_id, local_id)`.

### 4.4 `est_entrada_lotes`

Cabeçalho de cada entrada (tela, planilha ou NFe).

| Coluna | Tipo | Notas |
|--------|------|--------|
| id | uuid PK | |
| empresa_id | uuid NOT NULL | |
| numero | text NOT NULL | legível / sequencial por empresa |
| origem | text | `lote_tela` \| `planilha` \| `nfe_xml` |
| status | text | `rascunho` \| `processando` \| `concluido` \| `erro` \| `parcial` |
| pessoa_id | uuid NOT NULL | fornecedor — FK `crm_leads` |
| local_id | uuid NOT NULL | destino da entrada |
| documento | text NULL | nº NF / chave / ref. |
| nfe_chave | text NULL | chave 44 dígitos (quando NFe) |
| nfe_xml_nome | text NULL | nome do arquivo origem |
| observacao | text NULL | |
| erro_resumo | text NULL | resumo amigável se falhou |
| usuario_id | uuid NULL | quem iniciou |
| movimento_em | timestamptz | data da entrada |
| created_at / updated_at | timestamptz | |

### 4.5 `est_entrada_itens`

| Coluna | Tipo | Notas |
|--------|------|--------|
| id | uuid PK | |
| empresa_id | uuid NOT NULL | |
| lote_id | uuid NOT NULL | FK `est_entrada_lotes` |
| linha | int NOT NULL | |
| codigo_parceiro | text NULL | código do item no fornecedor / NFe |
| sku_id | uuid NULL | preenchido após de-para |
| unidade_origem | text NOT NULL | UM informada (NF / planilha / tela) |
| quantidade_origem | numeric(18,4) NOT NULL | qtd na UM de origem |
| unidade_estoque | text NULL | cópia da UM estoque do SKU |
| quantidade_estoque | numeric(18,4) NULL | após conversão |
| fator_conversao | numeric NULL | fator aplicado |
| justificativa | text NULL | **obrigatória** se `origem` do lote = `lote_tela` (entrada manual) |
| status | text | `ok` \| `erro` |
| erro_codigo | text NULL | ver §6.3 |
| erro_mensagem | text NULL | mensagem clara para o usuário |
| movimento_id | uuid NULL | FK `est_movimentos` se gravou |

### 4.6 `est_retirada_lotes`

Cabeçalho do lote de **retirada manual** (tabela). Sem planilha/XML.

| Coluna | Tipo | Notas |
|--------|------|--------|
| id | uuid PK | |
| empresa_id | uuid NOT NULL | |
| numero | text NOT NULL | legível / sequencial por empresa |
| status | text | `rascunho` \| `concluido` \| `parcial` \| `erro` |
| observacao | text NULL | obs. geral do lote (opcional) |
| erro_resumo | text NULL | |
| usuario_id | uuid NULL | quem confirmou |
| movimento_em | timestamptz | |
| created_at / updated_at | timestamptz | |

### 4.7 `est_retirada_itens`

| Coluna | Tipo | Notas |
|--------|------|--------|
| id | uuid PK | |
| empresa_id | uuid NOT NULL | |
| lote_id | uuid NOT NULL | FK `est_retirada_lotes` |
| linha | int NOT NULL | |
| sku_id | uuid NOT NULL | |
| local_id | uuid NOT NULL | default `BRANCO` / `eh_principal` se vazio na UI |
| quantidade | numeric(18,4) NOT NULL | > 0 · **UM de estoque** (sem conversão) |
| justificativa | text NOT NULL | mandatória por linha |
| status | text | `ok` \| `erro` |
| erro_codigo | text NULL | |
| erro_mensagem | text NULL | |
| movimento_id | uuid NULL | FK `est_movimentos` se gravou |

### 4.8 `est_ajuste_lotes`

Cabeçalho do lote de ajuste (várias linhas na mesma confirmação).

| Coluna | Tipo | Notas |
|--------|------|--------|
| id | uuid PK | |
| empresa_id | uuid NOT NULL | |
| numero | text NOT NULL | legível / sequencial por empresa |
| status | text | `rascunho` \| `concluido` \| `parcial` \| `erro` |
| observacao | text NULL | obs. geral do lote (opcional) |
| erro_resumo | text NULL | |
| usuario_id | uuid NULL | quem confirmou |
| movimento_em | timestamptz | data do ajuste |
| created_at / updated_at | timestamptz | |

### 4.9 `est_ajuste_itens`

| Coluna | Tipo | Notas |
|--------|------|--------|
| id | uuid PK | |
| empresa_id | uuid NOT NULL | |
| lote_id | uuid NOT NULL | FK `est_ajuste_lotes` |
| linha | int NOT NULL | ordem na tabela da tela |
| sku_id | uuid NOT NULL | |
| local_id | uuid NOT NULL | default `BRANCO` / `eh_principal` se vazio na UI |
| quantidade | numeric(18,4) NOT NULL | valor absoluto > 0 · UM de estoque |
| sinal | text NOT NULL | `positivo` \| `negativo` |
| justificativa | text NOT NULL | mandatória por linha |
| status | text | `ok` \| `erro` |
| erro_codigo | text NULL | |
| erro_mensagem | text NULL | |
| movimento_id | uuid NULL | FK `est_movimentos` (cardex) se gravou |

### 4.10 `est_movimentos` (Cardex)

Histórico de **todas** as movimentações. Append-only no fluxo normal (correções via novo `ajuste`, não editando linha antiga).

| Coluna | Tipo | Notas |
|--------|------|--------|
| id | uuid PK | |
| empresa_id | uuid NOT NULL | |
| tipo | text | `entrada` \| `saida` \| `transferencia` \| `ajuste` |
| sku_id | uuid NOT NULL | |
| local_id | uuid NOT NULL | destino (entrada/ajuste+) · origem (saída/retirada/ajuste− / transferência) |
| local_destino_id | uuid NULL | obrigatório em `transferencia` |
| quantidade | numeric(18,4) NOT NULL | sempre > 0 e em **UM de estoque** |
| documento | text NULL | NF / OS / ref. |
| pessoa_id | uuid NULL | fornecedor (entrada) — FK `crm_leads` |
| lote_entrada_id | uuid NULL | FK `est_entrada_lotes` |
| lote_retirada_id | uuid NULL | FK `est_retirada_lotes` — rastreio do lote de retirada |
| lote_ajuste_id | uuid NULL | FK `est_ajuste_lotes` — rastreio do lote de ajuste |
| requisicao_id | uuid NULL | quando saída veio de atendimento de requisição |
| origem | text NULL | `lote_tela` \| `planilha` \| `nfe_xml` \| `retirada` \| `requisicao` \| `ajuste` |
| ajuste_sinal | text NULL | `positivo` \| `negativo` quando `tipo = ajuste` |
| motivo | text NULL | justificativa / texto cardex (entrada manual, retirada, ajuste) |
| usuario_id | uuid NULL | quem lançou |
| movimento_em | timestamptz | default now() |
| created_at | timestamptz | |

**REGRA DE OURO (gravação online):** em **uma única transação de banco** — INSERT no Cardex **e** UPDATE/UPSERT em `est_saldos`. Qualquer erro → `ROLLBACK` (sem integridade parcial). Implementação preferencial: **RPC Postgres** atômica por movimento (ou por lote, se a política do canal for all-or-nothing).

| `tipo` | Efeito no saldo |
|--------|-----------------|
| `entrada` | `local_id` += qtd |
| `saida` | `local_id` -= qtd |
| `ajuste` + | `local_id` += qtd |
| `ajuste` − | `local_id` -= qtd |
| `transferencia` | `local_id` -= qtd **e** `local_destino_id` += qtd |

**Transferência / retirada / ajuste:** ver §§7–9.

### 4.11 `est_requisicoes` / `est_requisicao_itens`

| Coluna (req.) | Tipo | Notas |
|---------------|------|--------|
| id | uuid PK | |
| empresa_id | uuid NOT NULL | |
| numero | text NOT NULL | sequencial / legível por empresa |
| requisitante_pessoa_id | uuid NOT NULL | FK `crm_leads` — **obrigatório** · deve existir em Pessoas |
| solicitante_usuario_id | uuid NULL | usuário logado que abriu a req. (auditoria) |
| departamento_id | uuid NULL | opcional / derivado do requisitante |
| status | text | ver §10 |
| origem | text | `manual` \| `planilha` |
| workflow_card_id | uuid NULL | card criado se `aprovacao_via_workflow` |
| observacao | text NULL | |
| created_at / updated_at | timestamptz | |

| Coluna (item) | Tipo | Notas |
|---------------|------|--------|
| id / empresa_id / requisicao_id | … | |
| sku_id | uuid NOT NULL | |
| quantidade_pedida | numeric(18,4) NOT NULL | > 0 · UM de estoque |
| quantidade_atendida | numeric(18,4) | default 0 |
| quantidade_pendente | numeric(18,4) | pedida − atendida (quando modo parcial) |
| local_id | uuid NULL | local de baixa no atendimento (default `BRANCO`) |
| status_item | text | `pendente` \| `atendido` \| `parcial` \| `nao_atendido` \| `pulado` |

### 4.12 RLS

- `ENABLE ROW LEVEL SECURITY` em todas.  
- Policies: `check_permission('estoque', …)` + `empresa_id` do usuário (superadmin bypass).  
- Grants para `authenticated` alinhados às demais tabelas `cad_*`.

### 4.13 Rotina batch — reconstruir saldos a partir do Cardex

> Mesmo sob a **REGRA DE OURO**: a reconstrução dos saldos de uma empresa ocorre em **uma transação** (não metade recalculada).

Objetivo: **recontar o cardex inteiro** (por empresa ou global admin) e **reescrever** `est_saldos`, corrigindo drift (falha parcial, bug, intervenção manual indevida).

| Item | Decisão |
|------|---------|
| Nome | `est_reconstruir_saldos_from_cardex` (RPC/SQL) + job agendável |
| Escopo | Por `empresa_id` (obrigatório no tenant) · opcional filtro `sku_id` / `local_id` |
| Algoritmo | 1) Zerar ou deletar saldos do escopo · 2) Agregar cardex · 3) Upsert saldos |
| Agregação | `entrada`/`ajuste+` somam em `local_id`; `saida`/`ajuste-` subtraem de `local_id`; `transferencia` subtrai origem e soma destino |
| Transação | Tudo atômico por empresa (BEGIN…COMMIT; rollback se falhar) |
| Quem dispara | Cron (ex. noturno) · botão admin em Configuração (“Recalcular saldos”) · CLI/ops |
| Log | Registrar início/fim, `empresa_id`, qtd linhas cardex, divergências detectadas (saldo antigo × novo) |
| UI MVP | Botão em **Estoque → Configuração** (sem tela de relatório); feedback loading + resultado |

Pseudológica:

```
para cada (empresa_id [, sku_id] [, local_id]):
  saldo_calc = map vazio
  para cada movimento no cardex (ordem movimento_em, id):
    aplicar delta conforme tipo
  substituir est_saldos do escopo por saldo_calc
  (linhas com quantidade 0 podem ser removidas ou mantidas em 0)
```

**Importante:** o batch **não** inventa movimentos — só lê o Cardex. Contagem cíclica / inventário físico (gerar ajustes a partir de contagem) = **fora do MVP**.

---

## 5. Regras de negócio — Locais de estoque

### 5.1 Objetivo

Cadastrar os locais onde o saldo vive. Toda movimentação (entrada, saída, transferência) referencia um `local_id`.

### 5.2 Local principal `BRANCO`

Empresas que **não trabalham com locais** (um único “estoque geral”) devem poder criar o local principal:

| Campo | Valor sugerido / regra |
|-------|------------------------|
| `codigo` | **`BRANCO`** (reservado para o local principal) |
| `nome` | ex. “Estoque principal” / “BRANCO” |
| `eh_principal` | `true` |
| `tipo` | `principal` |

Regras:

1. Permitir criar local com código **`BRANCO`** marcado como principal.  
2. No máximo **um** `eh_principal = true` por `empresa_id`.  
3. Ao ativar o módulo / primeiro acesso, UX pode **sugerir** (ou seed opcional) a criação do `BRANCO` se a empresa não usar multi-local.  
4. Entrada, saída e NFe sem local informado usam o local principal (`eh_principal` / `BRANCO`).  
5. `BRANCO` pode coexistir com outros locais depois — se a empresa evoluir para multi-local, mantém o principal e cadastra os demais.  
6. Não permitir excluir o local principal se ainda houver saldo ou for o único local ativo (desativar só com regra clara / migração).

### 5.3 Validações do CRUD

| Regra | Erro se |
|-------|---------|
| `codigo` único por empresa | código já existe |
| Segundo `eh_principal` | já existe principal — desmarque o atual antes |
| Código `BRANCO` sem ser principal | avisar / forçar `eh_principal` (recomendado) |

Mensagens claras na tela (o que corrigir).

---

## 6. Regras de negócio — Entrada de estoque

Fonte única de verdade para os **três** canais. Nenhuma entrada grava saldo/movimento se falhar validação.

### 6.1 Canais

| Canal | Como | `origem` do lote |
|-------|------|------------------|
| **A — Lote na tela** | Tela que monta um lote (cabeçalho + itens) e confirma | `lote_tela` |
| **B — Planilha** | Upload de planilha **pré-formatada** (CSV/XLSX) | `planilha` |
| **C — XML NFe** | Ingestão de XMLs da pasta configurada (via agente na rede local) | `nfe_xml` |

Fluxo comum:

1. Montar/receber lote + itens  
2. Rodar motor de validação (§6.2) item a item  
3. Se **qualquer** item crítico falhar conforme política do lote → **não** efetivar entrada desse item (e deixar mensagem clara)  
4. Itens OK → movimento `entrada` + upsert `est_saldos` (quantidade já em UM de estoque)  
5. Atualizar status do lote (`concluido` / `parcial` / `erro`)

**Política MVP de lote:** item com erro **não entra**; itens OK do mesmo lote **podem** entrar (`status = parcial`), desde que o usuário veja a lista de erros com ação corretiva. Lote inteiro só fica `erro` se nenhum item entrar.

### 6.2 Validações obrigatórias (todos os canais)

Ordem sugerida de checagem por item/lote:

#### V1 — Fornecedor cadastrado em Pessoas

- Identificar o fornecedor (CNPJ/CPF da NFe, documento/código na planilha, seleção na tela).  
- Buscar em `crm_leads` do `empresa_id` (papel fornecedor quando aplicável).  
- **Se não existir:** bloquear entrada do lote/item.  
- **Mensagem (exemplo):**  
  > Fornecedor CNPJ **12.345.678/0001-99** não está cadastrado em **Cadastros → Pessoas**. Cadastre a pessoa com papel fornecedor e tente novamente.

#### V2 — SKU no de-para do fornecedor

- Com `pessoa_id` do fornecedor + `codigo_parceiro` do item (código do produto no fornecedor / `cProd` NFe / coluna da planilha).  
- Buscar em `cad_sku_depara` (`empresa_id`, `pessoa_id`, `codigo_parceiro`).  
- **Se não existir:** bloquear esse item.  
- **Mensagem (exemplo):**  
  > O código do fornecedor **ABC-99** não possui de-para para este fornecedor. Cadastre em **Cadastros → De-para SKU** (pessoa + código parceiro → SKU Hugin) e tente novamente.

#### V3 — Conversão de unidade de medida

- Obter UM de origem do item (NFe / planilha / tela) e `unidade_estoque` do SKU resolvido.  
- Se UM origem = UM estoque → fator `1`, quantidade estoque = quantidade origem.  
- Se diferente → resolver fator em `cad_sku_unidade_conversao` (específica do SKU, senão genérica da empresa) via `resolveFatorConversao`.  
- Quantidade estoque = `quantidade_origem × fator`.  
- **Se não achar conversão:** bloquear esse item (**não** inventar fator).  
- **Mensagem (exemplo):**  
  > Unidade **CX** difere da unidade de estoque **UN** do SKU **LUVA-M** e não há conversão cadastrada. Cadastre em **Cadastros → Conversões UM** (CX → UN, com ou sem SKU) e tente novamente.

#### V4 — Demais checagens operacionais

| Regra | Erro se |
|-------|---------|
| SKU com `controla_estoque = true` | SKU de-para aponta para item que não controla estoque |
| SKU / local ativos | inativo |
| Local informado / default (`eh_principal` / `BRANCO` / config) | local inexistente ou inativo |
| Quantidade > 0 | qtd ≤ 0 ou inválida |
| NFe duplicada (chave) | chave já processada com sucesso (evitar reentrada) |

### 6.3 Códigos de erro (para UI e log)

| Código | Significado | O que o usuário deve fazer |
|--------|-------------|----------------------------|
| `FORNECEDOR_NAO_CADASTRADO` | Pessoa/fornecedor ausente | Cadastrar em Pessoas |
| `DEPARA_NAO_ENCONTRADO` | Sem de-para sku×fornecedor×código | Cadastrar em De-para SKU |
| `CONVERSAO_NAO_ENCONTRADA` | UM origem ≠ estoque sem fator | Cadastrar em Conversões UM |
| `SKU_SEM_CONTROLE_ESTOQUE` | SKU não controla estoque | Ajustar SKU ou de-para |
| `LOCAL_INVALIDO` | Local ausente/inativo | Cadastrar/ativar local ou ajustar config |
| `QUANTIDADE_INVALIDA` | Qtd ≤ 0 / parse | Corrigir quantidade na origem |
| `NFE_DUPLICADA` | Chave já entrada | Conferir lote anterior |
| `XML_INVALIDO` | XML ilegível / sem dados mínimos | Corrigir arquivo / reexportar NFe |
| `JUSTIFICATIVA_OBRIGATORIA` | Entrada manual sem justificativa | Preencher justificativa na linha |

Toda mensagem na tela deve ser **em português claro**, citar o valor problemático (CNPJ, código, UM, SKU) e **indicar a tela de Cadastros/Estoque** onde corrigir.

### 6.4 Canal A — Lote na tela (manual · tabela)

- UI em **tabela editável** (várias linhas), no mesmo espírito de retiradas/ajustes.  
- Cabeçalho: fornecedor (obrigatório), local destino (default = principal/`BRANCO`), documento/data, observação.  
- Itens (por linha): código parceiro (ou de-para) · UM · quantidade · **justificativa (obrigatória)**.  
- Sem justificativa na linha → erro, **não** entra.  
- Cardex: `motivo` recebe a justificativa (ex.: `Entrada manual — {justificativa}`).  
- Ao confirmar: mesmo motor §6.2 + V5 justificativa.  
- Exibir erros **por linha**; linha com erro não movimenta.

#### V5 — Justificativa (somente canal A / lote_tela)

| Regra | Erro se |
|-------|---------|
| Justificativa preenchida | em branco na linha |

**Mensagem (exemplo):**  
> Informe a **justificativa** na linha 2. Toda entrada manual precisa de motivo no cardex.

### 6.5 Canal B — Planilha pré-formatada

Colunas mínimas:

| Coluna | Exemplo | Obrigatório |
|--------|---------|-------------|
| fornecedor_documento | 12345678000199 | sim (CNPJ/CPF da pessoa) |
| codigo_parceiro | ABC-99 | sim |
| unidade | CX | sim |
| quantidade | 10 | sim |
| local_codigo | ALM-01 / BRANCO | sim (ou default do lote / principal na UI de upload) |
| documento | NF-123 | não |
| movimento_em | 2026-09-11 | não |

- Template baixável na tela de import.  
- Formatos: CSV e XLSX.  
- Relatório de linhas rejeitadas com `erro_codigo` + `erro_mensagem`.

### 6.6 Canal C — XML NFe

1. Admin configura `nfe_xml_diretorio` (+ local padrão ou usa `BRANCO`) em **Estoque → Configuração**.  
2. Agente na rede local observa a pasta e envia XMLs ao Hugin.  
3. Parser extrai: CNPJ emitente, itens (`cProd`, UM, qtd), chave, número.  
4. Motor §6.2; grava lote `origem = nfe_xml`.  
5. UI lista lotes NFe com status e erros acionáveis (mesmas mensagens).

Arquivos com erro **não** devem ser tratados como entrada concluída; manter rastreio (`nfe_xml_nome`, `erro_resumo`) para reprocessar após correção dos cadastros.

### 6.7 O que a entrada **não** faz (MVP)

- Não cria automaticamente pessoa, SKU, de-para ou conversão.  
- Não abre tela de consulta de saldos.  
- Não lê pasta de rede a partir da VPS.

---

## 7. Regras de negócio — Transferências

### 7.1 Objetivo

Mover quantidade de um local de origem para um local de destino, **sem** alterar o total do SKU na empresa (só redistribui saldos).

### 7.2 Campos mandatórios

| Campo | Obrigatório | Notas |
|-------|-------------|--------|
| Local origem | **sim** | de onde retira |
| Local destino | **sim** | para onde envia · ≠ origem |
| SKU | **sim** | com `controla_estoque` |
| Quantidade | **sim** | > 0 |

Sem qualquer um desses campos → **não** grava transferência; mensagem clara pedindo o preenchimento.

### 7.3 Unidade de medida — sem conversão

- Quantidade informada e movimentada **sempre** na **UM de estoque** do SKU (`cad_skus.unidade_estoque`).  
- **Nunca** converter UM na transferência.  
- UI: exibir a UM de estoque ao lado da quantidade (somente leitura / fixa).  
- Não aceitar outra UM nem chamar `resolveFatorConversao`.

### 7.4 Saldo na origem — consulta mandatória

Antes de gravar:

1. Consultar `est_saldos` para `(empresa_id, sku_id, local_origem_id)`.  
2. Se não houver linha ou `quantidade < quantidade_solicitada` → **bloquear**.  
3. **Não** permitir saldo negativo na origem.

**Mensagem (exemplo):**  
> Saldo insuficiente no local **ALM-01** para o SKU **LUVA-M**. Disponível: **3 UN** · Solicitado: **10 UN**. Reduza a quantidade ou escolha outro local de origem.

### 7.5 Demais validações

| Regra | Erro se |
|-------|---------|
| Origem ≠ destino | mesmo local nos dois lados |
| Locais ativos | origem ou destino inativo |
| SKU ativo + controla estoque | SKU inválido |
| Quantidade > 0 | qtd ≤ 0 |

### 7.6 Efeito no ledger / saldo

Na **mesma transação**:

1. Baixa `quantidade` em `est_saldos` do local origem.  
2. Sobe `quantidade` em `est_saldos` do local destino (upsert).  
3. Uma linha em `est_movimentos` com `tipo = transferencia`, `local_id` = origem, `local_destino_id` = destino, `quantidade` em UM de estoque.

### 7.7 Códigos de erro

| Código | Significado | O que fazer |
|--------|-------------|-------------|
| `CAMPOS_OBRIGATORIOS` | Falta origem, destino, SKU ou qtd | Preencher todos os campos |
| `LOCAIS_IGUAIS` | Origem = destino | Escolher locais diferentes |
| `SALDO_INSUFICIENTE` | Origem sem saldo bastante | Ajustar qtd ou origem |
| `LOCAL_INVALIDO` | Local inativo/ausente | Corrigir cadastro de locais |
| `SKU_INVALIDO` | SKU inativo / sem controle | Ajustar SKU |

---

## 8. Regras de negócio — Retiradas de estoque

### 8.1 Objetivo

Baixar saldo **manualmente**, em **lote tabular**, sem planilha/XML e sem vínculo obrigatório com requisição. Cada linha vira movimento no cardex (`tipo = saida`, `origem = retirada`) com justificativa e referência ao lote.

> **Distinção:** atendimento de **requisição** também baixa estoque (`origem = requisicao`), mas **não** usa esta tela — fica no fluxo de Requisições.

### 8.2 Somente manual

- **Sem** import de planilha.  
- **Sem** ingestão NFe.  
- Apenas tela de lote em tabela (igual espírito de entradas manuais e ajustes).

### 8.3 UI — lote em tabela

- Tela `/cockpit/estoque/retiradas` · tabela editável (várias linhas).  
- Colunas: SKU · Local · Quantidade · Justificativa · UM estoque (somente leitura).  
- Ao confirmar → um `est_retirada_lotes` + N `est_retirada_itens`.  
- Cada item OK → uma linha no cardex com `lote_retirada_id`.  
- Itens com erro não baixam; lote pode ficar `parcial`.

### 8.4 Campos mandatórios (por linha)

| Campo | Obrigatório | Notas |
|-------|-------------|--------|
| SKU | **sim** | `controla_estoque` · ativo |
| Quantidade | **sim** | > 0 · **UM de estoque** (sem conversão) |
| Local | **sim** na gravação | se vazio na UI → **`BRANCO`** / `eh_principal` |
| Justificativa | **sim** | texto livre · motivo da retirada |

### 8.5 Validações

| Regra | Erro se |
|-------|---------|
| Campos §8.4 | qualquer um faltando |
| Local default | sem local e sem `BRANCO` / principal |
| Saldo na origem | saldo `< quantidade` → **bloquear** |
| SKU / local | inativo / inválido |

**Mensagens (exemplos):**

> Informe **SKU**, **quantidade** e **justificativa** na linha 1.

> Local não informado — usando **BRANCO**.

> Saldo insuficiente em **BRANCO** para **LUVA-M**. Disponível: **4 UN** · Solicitado: **10 UN**.

### 8.6 Efeito no cardex / saldo

Na mesma transação, por item OK:

1. Baixa `quantidade` em `est_saldos` no `local_id`.  
2. Insert `est_movimentos`: `tipo = saida`, `origem = retirada`, `lote_retirada_id`, `motivo` = `Retirada manual — {justificativa}`.  
3. Preencher `movimento_id` no item.

### 8.7 Códigos de erro

| Código | Significado | O que fazer |
|--------|-------------|-------------|
| `CAMPOS_OBRIGATORIOS` | Falta SKU, qtd ou justificativa | Completar a linha |
| `LOCAL_PADRAO_AUSENTE` | Sem local e sem BRANCO | Cadastrar BRANCO ou informar local |
| `SALDO_INSUFICIENTE` | Sem saldo bastante | Reduzir qtd ou outro local |
| `SKU_INVALIDO` / `LOCAL_INVALIDO` | Cadastro inválido | Corrigir cadastros |

### 8.8 O que a retirada **não** faz

- Não importa planilha nem XML.  
- Não substitui o atendimento de requisição.  
- Não converte UM.

---

## 9. Regras de negócio — Ajuste de estoque

### 9.1 Objetivo

Corrigir saldo **sem** documento de origem (sem NF, fornecedor, requisição ou transferência). O usuário informa quantidades positivas ou negativas; o sistema grava no **cardex** (`est_movimentos`) que foi um **ajuste de estoque**, com sinal e justificativa, vinculado ao **lote** que originou a linha.

### 9.2 Somente manual

- **Sem** import de planilha.  
- **Sem** ingestão NFe.  
- Apenas tela de lote em tabela.

### 9.3 UI — lote em tabela

- Tela `/cockpit/estoque/ajustes` (novo lote) em formato **tabela editável** (várias linhas).  
- Colunas da tabela: SKU · Local · Quantidade (com sinal +/− ou coluna Sinal) · Justificativa · UM estoque (somente leitura).  
- Usuário adiciona/remove linhas; ao **confirmar**, gera **um** `est_ajuste_lotes` e N `est_ajuste_itens`.  
- Cada item OK vira **uma** linha no cardex com `lote_ajuste_id` preenchido.  
- Erros por linha com mensagem clara; política igual à entrada: itens OK podem gravar (`parcial`).

### 9.4 Campos mandatórios (por linha)

| Campo | Obrigatório | Notas |
|-------|-------------|--------|
| SKU | **sim** | `controla_estoque` · ativo |
| Quantidade | **sim** | ≠ 0 · valor em **UM de estoque** (sem conversão) |
| Justificativa | **sim** | texto livre · motivo do ajuste |
| Local de estoque | **sim** na gravação | se vazio na UI → assume local principal **`BRANCO`** / `eh_principal` |

Sem SKU, quantidade ou justificativa → linha com erro, **não** grava no cardex.

### 9.5 Sinal (positivo / negativo)

| Sinal | Efeito no saldo | Texto padrão no cardex (`motivo`) |
|-------|-----------------|-----------------------------------|
| `positivo` | `saldo += quantidade` | `Ajuste de estoque positivo — {justificativa}` |
| `negativo` | `saldo -= quantidade` | `Ajuste de estoque negativo — {justificativa}` |

- Quantidade no banco do movimento: **sempre absoluta** (`> 0`).  
- `tipo = ajuste`, `origem = ajuste`, `ajuste_sinal` = positivo|negativo, `lote_ajuste_id` = lote confirmado.  
- **Sem origem comercial** (sem `pessoa_id`, sem NF, sem requisição).

### 9.6 Validações

| Regra | Erro se |
|-------|---------|
| SKU / local válidos | inativo, inexistente, sem controle de estoque |
| Quantidade ≠ 0 | qtd vazia ou zero |
| Justificativa preenchida | em branco |
| Local default | não existe `BRANCO` / `eh_principal` e local não informado |
| Ajuste negativo | saldo no local `< quantidade` → bloquear (não gerar negativo) |

**Mensagens (exemplos):**

> Informe a **justificativa** na linha 3. Todo ajuste precisa de motivo para auditoria no cardex.

> Local não informado — usando **BRANCO**. (info) · Se BRANCO não existir:  
> Não há local informado e o local principal **BRANCO** não está cadastrado. Crie em **Estoque → Locais** ou selecione um local na linha.

> Ajuste negativo bloqueado: saldo em **BRANCO** para **LUVA-M** é **2 UN**; solicitado **-5 UN**.

### 9.7 Efeito no cardex / saldo

Na mesma transação, por item OK:

1. Upsert/update `est_saldos` no `local_id` (+ ou −).  
2. Insert `est_movimentos` com os campos da §4.10 (`tipo = ajuste`, `lote_ajuste_id`, `motivo` padronizado).  
3. Preencher `movimento_id` no item do lote.

### 9.8 Códigos de erro

| Código | Significado | O que fazer |
|--------|-------------|-------------|
| `CAMPOS_OBRIGATORIOS` | Falta SKU, qtd ou justificativa | Completar a linha |
| `LOCAL_PADRAO_AUSENTE` | Sem local e sem BRANCO | Cadastrar BRANCO ou informar local |
| `SALDO_INSUFICIENTE` | Ajuste negativo maior que saldo | Reduzir qtd ou conferir local |
| `SKU_INVALIDO` / `LOCAL_INVALIDO` | Cadastro inválido | Corrigir cadastros |

### 9.9 O que o ajuste **não** faz

- Não exige fornecedor, de-para, NF ou conversão de UM.  
- Não importa planilha nem XML (**somente manual**).  
- Não é transferência (não muda de local automaticamente).  
- Não substitui entrada/retirada operacional documentada.

---

## 10. Regras de negócio — Requisição de materiais

### 10.1 Objetivo

Registrar pedido de materiais (entrada da requisição) **manual** ou por **planilha**, com requisitante em Pessoas e lista de SKUs/quantidades. O **atendimento** (baixa de estoque) respeita o parâmetro de saldo insuficiente em Configuração. Opcionalmente, a aprovação passa por **workflow** (funil/estágio configurados).

### 10.2 Canais de entrada da requisição

| Canal | Como | `origem` |
|-------|------|----------|
| Manual | Tela (cabeçalho + tabela de itens) | `manual` |
| Planilha | Upload pré-formatado CSV/XLSX | `planilha` |

### 10.3 Campos mandatórios

| Campo | Obrigatório | Notas |
|-------|-------------|--------|
| **Requisitante** | **sim** | Deve existir em **Cadastros → Pessoas** (`crm_leads` do tenant) |
| **Lista de SKUs + quantidades** | **sim** | Pelo menos **1** item · cada linha: SKU + qtd > 0 |

Validações:

- Requisitante inexistente → **não** grava; mensagem: cadastrar em Pessoas.  
- SKU inválido / sem `controla_estoque` → rejeita a linha (planilha) ou bloqueia confirmação.  
- Lista vazia → erro claro.

### 10.4 Parâmetro — saldo insuficiente no atendimento

Em **Estoque → Configuração** (`est_config.req_saldo_insuficiente_modo`):

| Modo | Quando um item não tem saldo suficiente |
|------|----------------------------------------|
| **`atende_parcial_pendente`** | Atende com a qtd **disponível**; diferença fica **pendente** no item |
| **`nao_atende_requisicao`** | **Não atende a requisição inteira** (nenhuma baixa neste ciclo) |
| **`pula_item`** | Atende os demais itens; **este item não envia nada** (`quantidade_atendida = 0`, status `pulado`) |

- Consulta de saldo é **mandatória** antes de baixar (local de atendimento, default `BRANCO`).  
- Mensagens na tela devem citar o modo ativo e o que ficou pendente / pulado / bloqueado.  
- Default sugerido: `atende_parcial_pendente`.

### 10.5 Aprovação via Workflow (preparado)

Parâmetros em Configuração:

| Campo | Uso |
|-------|-----|
| `aprovacao_via_workflow` | Liga criação de card de aprovação |
| `aprovacao_funil_id` | Funil do Workflow onde o card nasce |
| `aprovacao_estagio_id` | Estágio/etapa inicial do card |

Comportamento:

1. Se `aprovacao_via_workflow = false` → fluxo interno de status (§10.6) sem card (aprovação operacional no próprio módulo, se houver papel `estoque_aprovacao`).  
2. Se `true` → ao **enviar** a requisição, criar card no funil/estágio configurados; guardar `workflow_card_id`.  
3. Funil e estágio **obrigatórios** quando a flag está ligada; senão mensagem: “Configure funil e estágio em Estoque → Configuração”.  
4. Transições do card ↔ status da requisição: implementação alinhada ao Workflow existente (hook/evento); detalhe de mapeamento de estágios fica no F4.3 / workshop.  
5. MVP: **estruturar parâmetros + criação do card**; refinamento fino do funil fica nos parâmetros do módulo (não hardcode).

### 10.6 Status da requisição

```
rascunho → enviada → aprovada → atendida
                ↘ cancelada          ↘ parcialmente_atendida (se houver pendência)
         aprovada → cancelada (se ainda não atendida)
```

| Status | Quem | Efeito |
|--------|------|--------|
| rascunho | solicitante | editável |
| enviada | solicitante | aguarda aprovação (interna ou workflow) |
| aprovada | aprovador / workflow | liberada para atendimento |
| parcialmente_atendida | estoquista | houve baixa parcial; itens com pendência |
| atendida | estoquista | todos os itens sem pendência relevante |
| cancelada | admin / regras ok | sem movimento (ou só o já baixado permanece) |

Atendimento gera `saida` com `origem = requisicao` + `requisicao_id` (ver §8 distinção vs retirada manual).

### 10.7 Manual (tela)

- Cabeçalho: requisitante (lookup Pessoas), observação.  
- Itens: tabela SKU + quantidade (+ local opcional).  
- Confirmar → valida §10.3.

### 10.8 Planilha

| Coluna | Exemplo | Obrigatório |
|--------|---------|-------------|
| requisitante_documento | 12345678901 | sim (CPF/CNPJ da pessoa) |
| sku_codigo | LUVA-M | sim |
| quantidade | 10 | sim |
| observacao | | não |

- Uma planilha pode agrupar várias linhas no **mesmo** requisitante em **uma** requisição (ou 1 req. por grupo de documento — default: agrupar por requisitante).  
- Formatos: CSV e XLSX · template baixável.  
- Linhas rejeitadas com motivo claro.

### 10.9 Códigos de erro

| Código | Significado | O que fazer |
|--------|-------------|-------------|
| `REQUISITANTE_NAO_CADASTRADO` | Pessoa ausente | Cadastrar em Pessoas |
| `ITENS_OBRIGATORIOS` | Sem SKU/qtd | Incluir ao menos um item |
| `SKU_INVALIDO` | SKU inválido | Corrigir cadastro / planilha |
| `SALDO_INSUFICIENTE_BLOQUEIO` | Modo `nao_atende_requisicao` | Aguardar reposição ou mudar modo |
| `WORKFLOW_NAO_CONFIGURADO` | Flag on sem funil/estágio | Preencher Configuração |

### 10.10 Relação com outras operações

- **Retirada** = lote tabular **somente manual** (§8) — sem requisição.  
- **Atendimento de requisição** = baixa vinculada (`origem = requisicao`).  
- **Ajuste** = lote tabular **somente manual** (§9).

---

## 11. UI — hub e rotas

### Sidebar

- Item **Estoque** · `href: /cockpit/estoque`  
- `addon: 'estoque'`  
- `permissionAny`: slugs do módulo estoque (view em qualquer tela do hub)

### Hub cards (`/cockpit/estoque`) — MVP (só operação)

| Card | Href |
|------|------|
| Locais | `/cockpit/estoque/locais` |
| Configuração | `/cockpit/estoque/configuracao` |
| Entradas | `/cockpit/estoque/entradas` |
| Retiradas | `/cockpit/estoque/retiradas` |
| Transferências | `/cockpit/estoque/transferencias` |
| Ajustes | `/cockpit/estoque/ajustes` |
| Requisições | `/cockpit/estoque/requisicoes` |

### Hub cards — depois (consultas / relatórios)

| Card | Href |
|------|------|
| Saldos | `/cockpit/estoque/saldos` |
| Exportar | `/cockpit/estoque/export` |
| Relatórios | `/cockpit/estoque/relatorios` |

---

## 12. RBAC

Incluir em `PERMISSION_CATEGORIES` (nova categoria **Estoque**):

| Slug | Uso |
|------|-----|
| `estoque` | acesso geral / hub (view) |
| `estoque_locais` | CRUD locais |
| `estoque_config` | editar path NFe / config do módulo |
| `estoque_entradas` | lotes, planilha e processar NFe |
| `estoque_retiradas` | lotes de retirada (tabela, manual) |
| `estoque_transferencias` | transferir entre locais |
| `estoque_ajustes` | lotes de ajuste (tabela, manual) |
| `estoque_requisicoes` | criar/ver requisições |
| `estoque_aprovacao` | aprovar / cancelar |
| `estoque_atendimento` | atender requisição (baixa por req.) |
| `estoque_relatorios` | export + dashboard (**depois**) |

**MVP enxuto (aceito):** um slug `estoque` com ações view/create/edit/delete + checagens de papel (admin vs departamental) no código; granularizar depois se o piloto pedir.

**Departamental / requisitante:** cria requisições com pessoa do cadastro; escopo de listagem pode filtrar por requisitante/departamento conforme RBAC.

---

## 13. Import — export (depois)

> Planilha de **requisição** está especificada em §10.8 (não duplicar aqui).

### 13.1 Export consumido (F4.5 — depois)

Filtros: período, departamento, SKU, local.  
Colunas: data, sku, nome, qtd, local, depto, requisicao, usuario.

---

## 14. Plano de sprints (DEV)

### F4.0 — Workshop (antes ou em paralelo ao F4.1)

- [ ] Confirmar fluxo to-be Atlas  
- [ ] Modo default de saldo insuficiente (`req_saldo_insuficiente_modo`)  
- [ ] Se piloto usará aprovação via Workflow (funil/estágio)  
- [ ] Definir formato do agente on-prem de NFe (API key / endpoint)  
- [ ] *(KPIs / export — só anotar para a fase depois)*  

### F4.1 — Fundação (~1–1,5 sem)

- [ ] Migration `cad_locais_estoque` (+ `eh_principal` / `BRANCO`) + **`est_saldos`** + **`est_movimentos` (Cardex)** + `est_config` (+ RLS)  
- [ ] RPC/job `est_reconstruir_saldos_from_cardex` + botão em Configuração  
- [ ] Regra online: toda movimentação = Cardex + Saldo na **mesma transação** (RPC atômica; rollback total se falhar)  
- [ ] Proibido: dois commits / dois round-trips sem transação envolvendo Cardex e Saldo  
- [ ] `est_config`: NFe path + `req_saldo_insuficiente_modo` + flags/IDs de workflow de aprovação  
- [ ] Seed permissão `estoque` na matriz  
- [ ] Nav: módulo Estoque + hub (cards da §11)  
- [ ] CRUD Locais (regras §5 — local principal `BRANCO`)  
- [ ] Tela Configuração (NFe, modo saldo req., funil/estágio aprovação)  
- [ ] Ligar `estoque` no tenant piloto (DEV)  
- [ ] Smoke isolamento `empresa_id`  

### F4.2 — Entradas (regras §6)

- [ ] Tabelas `est_entrada_lotes` / `est_entrada_itens`  
- [ ] Motor único de validação (V1–V4) + mensagens §6.3  
- [ ] Canal A — lote na tela (**tabela** + **justificativa** obrigatória)  
- [ ] Canal B — planilha pré-formatada + template + erros por linha  
- [ ] Canal C — endpoint de ingestão XML + parser NFe + UI de status/erros  
- [ ] Spec/agente on-prem (lê pasta da rede local; não roda na VPS)  
- [ ] Service/RPC: movimento `entrada` + upsert saldo (só itens OK)  
- [ ] Listagem operacional de lotes/entradas  

### F4.3 — Requisições (regras §10)

- [ ] Tabelas `est_requisicoes` / `est_requisicao_itens` (requisitante = pessoa)  
- [ ] Entrada **manual** (requisitante + lista SKU/qtd)  
- [ ] Entrada por **planilha** (§10.8)  
- [ ] Máquina de status §10.6  
- [ ] Hook preparado: se `aprovacao_via_workflow`, criar card no funil/estágio  
- [ ] Atendimento respeitando `req_saldo_insuficiente_modo` (§10.4)  
- [ ] Filtro / listagem  

### F4.4 — Retiradas + Transferências + Ajustes + atendimento

- [ ] Retirada (regras §8): tela **tabela**, lote, **somente manual**  
- [ ] Campos mandatórios: SKU, qtd, justificativa, local (default `BRANCO`)  
- [ ] Cardex `tipo = saida` / `origem = retirada` + `lote_retirada_id` + justificativa  
- [ ] Bloquear saldo insuficiente na retirada  
- [ ] Atendimento de requisição → `saida` / `origem = requisicao` + saldo (modos §10.4)  
- [ ] Transferência (regras §7): origem/destino/SKU/qtd obrigatórios  
- [ ] Consulta mandatória de saldo na origem antes de transferir  
- [ ] Quantidade só em UM de estoque — **sem** conversão  
- [ ] Ajuste (regras §9): tela **tabela**, lote, **somente manual**  
- [ ] Campos mandatórios ajuste: SKU, qtd, justificativa, local (default `BRANCO`)  
- [ ] Cardex `tipo = ajuste` + observação positivo/negativo + `lote_ajuste_id`  
- [ ] Listagens operacionais  

### F4.5 — Consultas e relatórios (**depois**)

- [ ] Tela Saldos  
- [ ] Export CSV/XLSX do consumido  
- [ ] Dashboard / KPIs  

### F5 — Piloto / go-live

- [ ] Treino 2 admins + amostra departamental  
- [ ] Homolog DEV verde (F4.1–F4.4)  
- [ ] **Pedido explícito** → SQL + deploy prod  
- [ ] Hiper-care  

### F6 — Depois

- [ ] Integração SAP / legado (API-first)  
- [ ] `local_padrao_id` no SKU (opcional)  
- [ ] F4.5 (consultas/relatórios) se ainda não feito  

---

## 15. Critérios de aceite (piloto — só funcionalidades)

1. Sem addon `estoque` → sem menu e URL bloqueada.  
2. É possível criar local principal **`BRANCO`** (`eh_principal`) para empresa sem multi-local.  
3. Configuração guarda path de XML da **rede local** (não assume pasta na VPS).  
4. Entrada por **lote na tela**, **planilha** e **XML NFe** usam o mesmo motor de regras.  
5. Entrada **manual** (lote tela) exige **justificativa** por linha.  
6. Sem fornecedor em Pessoas → **não entra**; mensagem indica cadastrar em Pessoas.  
7. Sem de-para do código×fornecedor → **não entra**; mensagem indica De-para SKU.  
8. UM diferente sem conversão → **não entra**; mensagem indica Conversões UM.  
9. Com cadastros OK, quantidade grava em UM de estoque e atualiza saldo interno.  
10. Transferência exige origem, destino, SKU e quantidade; consulta saldo na origem; bloqueia se insuficiente.  
11. Transferência usa **somente** UM de estoque (nunca converte).  
12. Retirada em **tabela/lote** (**só manual**): SKU + qtd + justificativa; local vazio → `BRANCO`; cardex com `lote_retirada_id`.  
13. Retirada e ajuste **não** têm import planilha/XML.  
14. Ajuste em **tabela/lote** (**só manual**): SKU + qtd + justificativa; local vazio → `BRANCO`; cardex com `lote_ajuste_id`.  
15. Ajuste/retirada negativos não geram saldo negativo (bloqueiam com mensagem clara).  
16. Requisição exige **requisitante** em Pessoas + lista SKU/qtd; entrada **manual** ou **planilha**.  
17. Configuração define modo de saldo insuficiente (`parcial_pendente` / `nao_atende_requisicao` / `pula_item`) e o atendimento respeita o modo.  
18. Com `aprovacao_via_workflow`, funil e estágio vêm dos parâmetros; envio da req. prepara/cria card no Workflow.  
19. Após aprovação, atendimento gera saída por requisição e baixa saldo conforme o modo.  
20. Dados de empresa A invisíveis para empresa B.  
21. **REGRA DE OURO:** toda movimentação grava **Cardex** + atualiza **Saldo** na **mesma transação**; falha → rollback (sem divergência).  
22. Rotina batch reconstrói saldos a partir do cardex completo (por empresa), também de forma atômica.  

*(Saldos UI, export, KPIs e **contagem cíclica** = fora deste ciclo / depois.)*

---

## 16. Fora do MVP

- Consultas / saldos UI / export / dashboard *(fase depois)*  
- **Contagem cíclica / inventário físico** (não neste ciclo)  
- Auto-cadastro de pessoa/SKU/de-para/conversão a partir da NFe  
- Conversão de UM em transferência, retirada ou ajuste  
- Import planilha/XML para retirada ou ajuste  
- MRP / reposição automática  
- Multi-CNPJ no mesmo login  
- Locais no hub Cadastros  
- Embed de outro sistema  
- Leitura direta de pasta UNC pela VPS  

---

## 17. Ordem de execução sugerida

1. Fechar F4.0 (workshop operacional + agente NFe) **ou** começar F4.1 com defaults deste doc.  
2. Implementar **F4.1→F4.4 só em DEV**.  
3. Homologar operações (entrada, retirada, transferência, ajuste, requisição).  
4. Cutover prod **somente com pedido explícito**.  
5. Depois: F4.5 consultas/relatórios.  

---

## 18. Referências

- **REGRA DE OURO** (topo deste doc): Cardex + Saldo na mesma transação  
- Mapa geral: [plano-desenvolvimento-fases.md](./plano-desenvolvimento-fases.md)  
- Decisões plataforma: [plataforma-entitlements-decisoes.md](./plataforma-entitlements-decisoes.md) §9  
- Cutover SQL: [supabase-prod-deploy-pending.md](./supabase-prod-deploy-pending.md)  
- Conversão UM (código existente): `src/lib/skus/resolve-conversao.ts`  
- De-para: `cad_sku_depara` · Pessoas: `crm_leads`  
- Anexo comercial: `attachments/.../Controle_de_estoque_proposta.pdf`
