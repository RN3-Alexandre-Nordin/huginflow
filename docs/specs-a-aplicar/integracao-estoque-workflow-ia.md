# DEV — Estoque × Workflow × IA (mini ERP + orquestrador)

**Status:** a aplicar · playbook de desenvolvimento  
**Branch:** `develop` (nunca `main` sem OK explícito)  
**Como usar:** implementar **um bloco por vez**; marcar checkboxes; não pular dependências (`Depende de`).  
**Fora deste doc:** cutover PROD, inventário físico detalhado, SAP completo.

| Relacionado | Papel |
|-------------|--------|
| [desenvolvimento-modulo-estoque.md](../specs-aplicadas/desenvolvimento-modulo-estoque.md) | Canônico Estoque (já em DEV) |
| [setup/addon-estoque.md](../setup/addon-estoque.md) | Setup básico do addon (seed + switches) |
| [CUTOVER-PROD-SET-2026.md](./CUTOVER-PROD-SET-2026.md) | Go-live PROD |
| [MIGRACAO-SUPABASE.md](../MIGRACAO-SUPABASE.md) | Changelog schema |

---

## 0. Contexto permanente (ler antes de qualquer bloco)

### 0.1 Diretriz

| Antes | Agora |
|-------|--------|
| Orquestrador puro via API | **Mini ERP + CRM** com módulos nativos (Estoque primeiro) |
| Fluxos só de fora | Fluxos nascem **dentro** com o **mesmo contrato** de eventos da API futura |
| IA só no Omni | IA nos atritos operacionais (com gate na Regra de Ouro) |

**Transação no Estoque; caso no Workflow.**  
IA **propõe/classifica**; **nunca** grava cardex sem política/confirmação.

### 0.2 Seed vs uso (decisão fechada)

| Momento | O que acontece |
|---------|----------------|
| Ligar addon **`estoque`** | **Seed sempre roda**: cria funis/templates padrão + grava IDs em `est_config` (mesmo sem Workflow) |
| Addon **`workflow` ausente** | Switches “via Workflow” ocultos/off; **não cria cards**; Estoque opera normal |
| Cliente compra **`workflow` depois** | Seed já existe → só **liga switches** por processo; sem reseed obrigatório |
| Switch do processo **on** + Workflow on | Aí sim emite card / consome callback |

Funis **não são hardcode** de negócio: são **templates editáveis** por tenant. O que é estável é o **mapeamento semântico** (qual estágio = aprovado/rejeitado) e o **envelope de eventos**.

### 0.3 Âncora no código hoje

| Peça | Situação |
|------|----------|
| Estoque → Workflow | Cria card se `aprovacao_via_workflow` (`processar-requisicao.ts`) |
| Workflow → Estoque | **Não existe** (maior buraco) |
| Motor SDD | Só visão em `.cursorrules` |
| IA Omni | Tags `[ACTION:]` / `[STATUS_CRM:]` — reutilizar padrão |

### 0.4 Mapa das ondas

```
Onda 0  Fundação (eventos + seed + config switches)
Onda 1  Ciclo requisição fechado (callback + funil aprovação)
Onda 2  Remessas + NFe → cards
Onda 3  IA nos atritos
Onda 4  Orquestrador / API (gatilho→ação)
```

Cada **bloco** abaixo é uma unidade de PR / sessão de agente.

---

## Envelope de evento (referência — Onda 0)

```json
{
  "empresa_id": "uuid",
  "event": "estoque.requisicao.criada",
  "occurred_at": "ISO-8601",
  "actor": { "type": "user|system|ai|api", "id": "uuid|null" },
  "resource": { "type": "est_requisicao|est_remessa|...", "id": "uuid" },
  "payload": {},
  "correlation_id": "uuid|null",
  "workflow_card_id": "uuid|null"
}
```

Sempre com `empresa_id`. Payload enxuto (ids, status, totais, deep-link).

### Catálogo mínimo (emitir na Onda 0–2)

| Evento | Destino típico |
|--------|----------------|
| `estoque.requisicao.criada` | Workflow se switch on |
| `estoque.requisicao.aprovada` / `.rejeitada` | Domínio + log |
| `estoque.remessa.enviada` / `.atrasada` | Workflow se switch on |
| `estoque.nfe.depara_pendente` | Workflow se switch on |
| Movimentos OK (entrada/saída/transf.) | Só módulo (opcional log) |

---

# Onda 0 — Fundação

Objetivo: seed + switches + bus interno de eventos, **sem** mudar UX operacional ainda.

### Bloco D0.1 — Tipos e helper de eventos
- **Depende de:** —
- **Faz:** `src/lib/estoque/events/` (ou `src/lib/domain-events/`) com tipos TypeScript do envelope + `emitEstoqueEvent(...)` (no-op ou insert em tabela/log).
- **Pronto quando:** chamada tipada compila; multi-tenant obrigatório no helper.
- [ ] Feito

### Bloco D0.2 — Persistência leve de eventos (DEV)
- **Depende de:** D0.1
- **Faz:** migration DEV: tabela `domain_events` (ou `est_domain_events`) com `empresa_id`, `event`, `payload`, `occurred_at`, índices `(empresa_id, event, occurred_at)`.
- **Pronto quando:** emit grava linha; RLS/`empresa_id` ok; registrado em MIGRACAO-SUPABASE.
- [ ] Feito

### Bloco D0.3 — Extender `est_config` (switches + IDs de seed)
- **Depende de:** —
- **Faz:** colunas (ou JSON `workflow_hooks`) p.ex.:
  - `wf_req_aprovacao_enabled` (bool, default false)
  - `wf_remessa_enabled` (bool)
  - `wf_nfe_depara_enabled` (bool)
  - IDs: funil/estágios seed + `estagio_aprovado_id` / `estagio_rejeitado_id` para req
  - Manter compat com `aprovacao_via_workflow` + `aprovacao_funil_id` / `aprovacao_estagio_id` (migrar ou alias)
- **Pronto quando:** migration + types; UI Configuração Estoque ainda pode ser D0.5.
- [ ] Feito

### Bloco D0.4 — Seed de funis padrão ao ligar Estoque
- **Depende de:** D0.3
- **Faz:** ao `empresa_addons.estoque` → enabled (e backfill empresas que já têm estoque):
  1. Funil **Aprovação de Requisição** (Pendente / Aprovado / Rejeitado)
  2. Funil **Remessas em aberto**
  3. Funil **Pendências de cadastro NFe**
  - Idempotente (não duplicar se `seed_version` / flag já aplicada)
  - Grava IDs em `est_config`
  - **Não** exige addon `workflow` para rodar
- **Pronto quando:** ligar estoque em empresa limpa cria 3 funis; religar não duplica; empresa sem workflow não quebra.
- [ ] Feito

### Bloco D0.5 — UI Configuração: switches Workflow por processo
- **Depende de:** D0.3, D0.4
- **Faz:** aba Workflow em Config Estoque (padrão de abas Hugin):
  - Se **sem** addon workflow: mensagem “Contrate/ative Workflow para usar processos” + switches disabled
  - Se **com** workflow: switches req / remessa / NFe; mostra funis seed (só leitura ou link para editar no Workflow)
- **Pronto quando:** admin liga/desliga sem SQL; RBAC ok.
- [ ] Feito

### Bloco D0.6 — Doc setup addon Estoque
- **Depende de:** D0.4, D0.5
- **Faz:** manter [docs/setup/addon-estoque.md](../setup/addon-estoque.md) alinhado ao que o seed cria e aos switches.
- **Pronto quando:** onboarding dá para seguir só com o setup doc.
- [ ] Feito

---

# Onda 1 — Ciclo requisição fechado

Objetivo: *req → card → aprovar/rejeitar no funil → status no estoque*.

### Bloco D1.1 — Emitir eventos na requisição
- **Depende de:** D0.1, D0.2
- **Faz:** em `processar-requisicao.ts` (criar/enviar/aprovar/rejeitar interno) emitir eventos do catálogo.
- **Pronto quando:** linhas em `domain_events` nos fluxos manuais atuais.
- [ ] Feito

### Bloco D1.2 — Gate de card: switch + addon workflow
- **Depende de:** D0.5, D1.1
- **Faz:** criar card **somente se** `workflow` enabled **e** `wf_req_aprovacao_enabled` (ou alias `aprovacao_via_workflow`); usar IDs do seed se config vazia.
- **Pronto quando:** sem workflow / switch off → zero card; com ambos on → card + `workflow_card_id`.
- [ ] Feito

### Bloco D1.3 — Callback card → status da requisição
- **Depende de:** D0.3, D1.2
- **Faz:** no move/finaliza de `crm_cards` (actions CRM):
  - Se card ligado a `est_requisicoes.workflow_card_id` e estágio ∈ aprovado/rejeitado → atualiza req + auditoria
  - Idempotente; só `empresa_id` do card
  - Emite `requisicao.aprovada` / `.rejeitada`
- **Pronto quando:** arrastar no Kanban aprova/rejeita req sem tela `/aprovacao`; teste multi-tenant.
- [ ] Feito

### Bloco D1.4 — Metadados do card de aprovação
- **Depende de:** D1.2
- **Faz:** `metadados` com `requisicao_id`, resumo itens, deep-link; título legível.
- **Pronto quando:** operador abre o card e chega na req em 1 clique.
- [ ] Feito

### Bloco D1.5 — Testes / smoke Onda 1
- **Depende de:** D1.3
- **Faz:** script ou E2E: criar req → card → aprovar → status `aprovada`; rejeitar → `rejeitada`; empresa B não vê.
- **Pronto quando:** verde em DEV.
- [ ] Feito

---

# Onda 2 — Remessas + NFe → Workflow

### Bloco D2.1 — Card em `remessa.enviada`
- **Depende de:** D0.4, D0.5, D1.2 (padrão de gate)
- **Faz:** ao confirmar remessa, se switch remessa on + workflow → card no funil Remessas; guardar FK se necessário.
- **Pronto quando:** remessa aparece no Kanban; switch off → só módulo.
- [ ] Feito

### Bloco D2.2 — Remessa atrasada (regra simples)
- **Depende de:** D2.1
- **Faz:** job ou check na listagem: prazo configurável → evento `remessa.atrasada` + mover/ Destacar card (sem baixa automática).
- **Pronto quando:** remessa vencida fica visível como atraso.
- [ ] Feito

### Bloco D2.3 — Retorno parcial / baixa → atualizar card
- **Depende de:** D2.1
- **Faz:** retorno total → encerrar card; parcial → estágio exceção; baixa definitiva → estágio/auditoria (sem IA).
- **Pronto quando:** ciclo remessa reflete no funil.
- [ ] Feito

### Bloco D2.4 — Card `nfe.depara_pendente`
- **Depende de:** D0.4, D0.5
- **Faz:** na entrada XML, linha sem de-para → evento + card no funil NFe se switch on.
- **Pronto quando:** pendência visível no Workflow; resolver de-para permite seguir entrada.
- [ ] Feito

### Bloco D2.5 — Smoke Onda 2
- **Depende de:** D2.1–D2.4
- **Faz:** checklist manual/script remessa + NFe.
- [ ] Feito

---

# Onda 3 — IA nos atritos

Princípio: structured output + reasoning log; **proibido** `est_registrar_movimento_atomico` sem gate.

### Bloco D3.1 — Sugestão de-para NFe/planilha
- **Depende de:** D2.4
- **Faz:** IA sugere SKU/UM/fornecedor; UI confirma antes de gravar.
- [ ] Feito

### Bloco D3.2 — Triagem de requisição
- **Depende de:** D1.1
- **Faz:** tags tipo `[TRIAGE_EST:…]` (prioridade, setor, precisa_aprovacao); só metadados.
- [ ] Feito

### Bloco D3.3 — Resumo / próximo passo em remessa atrasada
- **Depende de:** D2.2
- **Faz:** texto no card; ações (cobrar/prorrogar/baixa) só com humano.
- [ ] Feito

### Bloco D3.4 — Omni → consultar saldo / rascunho req
- **Depende de:** Onda 1 estável
- **Faz:** novas tags; consulta OK; rascunho OK; sem movimento direto.
- [ ] Feito

### Bloco D3.5 — Divergência retorno/ajuste com confirmação
- **Depende de:** D2.3
- **Faz:** IA explica risco; confirmação → RPC atômica.
- [ ] Feito

---

# Onda 4 — Orquestrador / API

### Bloco D4.1 — Tabela gatilho → ação
- **Depende de:** Onda 0–1 estáveis
- **Faz:** config “ao evento X → criar card Y / webhook”; sem engine monólito.
- [ ] Feito

### Bloco D4.2 — Webhook outbound dos eventos de domínio
- **Depende de:** D0.2, D4.1
- **Faz:** estender eventos empresa para lifecycle estoque/card.
- [ ] Feito

### Bloco D4.3 — API inbound (mesmo envelope)
- **Depende de:** D4.1
- **Faz:** endpoint autenticado cria/consome eventos (ex. ERP pede req).
- [ ] Feito

### Bloco D4.4 — Spawn pós-aprovação (logística)
- **Depende de:** D1.3, D4.1
- **Faz:** `requisicao.aprovada` → segundo card opcional (atender/separar).
- [ ] Feito

---

## Matriz rápida (consulta)

| Gatilho | Sem Workflow | Workflow + switch off | Workflow + switch on |
|---------|--------------|----------------------|----------------------|
| Req pendente aprovação | Aprovação interna | Idem | Card + callback |
| Remessa enviada | Só módulo | Só módulo | Card acompanhamento |
| NFe sem de-para | Bloqueio/tela estoque | Idem | + card pendência |
| Entrada/saída OK | Só módulo | Só módulo | Só módulo (+ evento log) |

---

## Ordem sugerida de PRs

1. `D0.1` + `D0.2` + `D0.3`  
2. `D0.4` + `D0.5` + `D0.6`  
3. `D1.1` → `D1.2` → `D1.3` → `D1.4` → `D1.5`  ← **primeiro valor de cliente**  
4. Onda 2 em PRs por processo (remessa, depois NFe)  
5. Onda 3 um atrito por PR  
6. Onda 4 só com A/B estáveis  

---

## Não fazer

- Hardcode de funis no código de negócio (use seed + IDs em config).
- Seed só quando Workflow liga (quebra compra Estoque → Workflow depois).
- Card em todo movimento de cardex.
- Motor SDD completo antes de D1.3.
- IA chamando RPC de movimento sem gate.
- Misturar cutover PROD neste playbook.

---

## Critério de sucesso

| Cenário | Alvo |
|---------|------|
| Monte Sinai | Req → funil → status estoque → atendimento |
| Compra Workflow depois | Switches on; funis seed já existem |
| Remessa / NFe | Card só com switch; editável no Workflow |
| Futuro ERP | Mesmo envelope de eventos |

---

## Histórico

| Data | Nota |
|------|------|
| 2026-09-17 | Spec inicial (plano mini ERP + orquestrador) |
| 2026-09-17 | Playbook em blocos; seed sempre no Estoque; cards = Workflow + switch |
