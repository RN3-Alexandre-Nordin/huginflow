# Planejamento: Módulo de Relatórios & Indicadores (BI)

> **Status:** 📋 Planejamento produto · **Backend Dev ✅** (2026-09-02) · Front ⏳  
> **Criado em:** 2026-09-02  
> **Contexto:** Levantamento para gerência da empresa — dashboard operacional + módulo BI com filtros e indicadores auxiliares.  
> **Referência visual:** telas estilo Chatwoot Analytics (Visão Geral + Conversas com KPIs, tendência e heatmap).

---

## 1. Objetivo

Oferecer à gerência da empresa uma visão consolidada de **atendimento, vendas, operação e IA**, em dois níveis complementares:

| Camada | Rota proposta | Público | Pergunta que responde |
|--------|---------------|---------|------------------------|
| **Cockpit operacional** | `/cockpit` | Operador, Gestor | “O que preciso fazer agora?” |
| **Centro de Inteligência (BI)** | `/cockpit/relatorios` | Gestor, Admin, Diretoria | “Como estamos performando? Onde investir?” |

**Princípio de produto:** o Dashboard principal mantém **4–6 KPIs vivos** e atalhos operacionais. O módulo BI concentra **histórico, comparação, drill-down, filtros e exportação**.

---

## 2. Estado atual do HuginFlow (baseline)

Levantamento do código em set/2026 — o que **já existe** vs. o que **falta**.

### 2.1 Dashboard por perfil (`/cockpit`)

Roteamento por `usuarios.role_global` em `src/app/(app)/cockpit/page.tsx`:

| Perfil | Componente | Dados reais? |
|--------|------------|--------------|
| **superadmin** | `SuperAdminDashboard` | ❌ Mock (números estáticos) |
| **admin (gestor)** | `ManagerDashboard` | ✅ CRM + conversas |
| **operador / visualizador** | `OperatorDashboard` | ✅ Produtividade + fila WhatsApp |

### 2.2 KPIs já implementados — Gestor

Fonte: `getManagerDashboardMetrics` e `getManagerDashboardChart` em `src/app/(app)/cockpit/actions.ts`.

| KPI | Lógica |
|-----|--------|
| Vendas concluídas (mês) | Soma `crm_cards.valor` onde `finalizado=true`, `updated_at` no mês |
| % vs mês anterior | Comparativo receita mês atual vs anterior |
| Cards ativos no funil | Count `crm_cards` onde `finalizado=false` |
| Chats operacionais (30d) | Distinct `crm_conversas.sessao_id` últimos 30 dias |
| Gargalo | Etapas com ≥ 3 cards ativos (`GARGALO_MIN_CARDS=3`) |
| Painel de indicadores (Dia/Semana/Mês) | Conversão, Entrada no funil, Receita fechada, WhatsApp |

Visualização: barras CSS (sem biblioteca de gráficos).

### 2.3 KPIs já implementados — Operador

| KPI | Fonte |
|-----|-------|
| Movimentações hoje | `crm_cards_history` (`acao=STATUS_CHANGED`, hoje) |
| Cards atrasados | Cards abertos com `data_prazo < hoje` |
| Atividades para hoje | Cards abertos com `data_prazo = hoje` |
| Gargalo atual | Etapa com mais cards do usuário |
| Fila WhatsApp | Preview `getOmniConversas()` (top 5) |
| Atividades | `ActivityFeed` + cards atribuídos |

### 2.4 Financeiro (separado)

Rota `/cockpit/financeiro` — RN3 superadmin. RPC `fn_finance_dashboard`, view `vw_finance_contas_receber_relatorio`. **Não integrado ao cockpit do tenant.**

### 2.5 CRM Hub — placeholder

Em `src/app/(app)/cockpit/crm/page.tsx`, card **“Relatórios & Analytics”** aponta para `/cockpit/crm/relatorios` com `active: false` (“Em Breve”). **Rota/página não existe.**

Features anunciadas no card: Taxa de Conversão, Previsão Fatura, Velocidade Média.

### 2.6 Lacunas vs. módulo BI completo

| Lacuna | Detalhe |
|--------|---------|
| Sem módulo de relatórios | Apenas placeholder no CRM Hub |
| Sem RBAC para relatórios | Nenhum slug `relatorios` / `analytics` em `permissions.ts` |
| Superadmin cockpit mock | KPIs de plataforma não vêm do banco |
| Gráficos limitados | Barras CSS; sem heatmap, funil, export |
| Agregação em server actions | JS bucketing; sem RPCs/views materializadas |
| Sem SLAs omnichannel | TMA, 1ª resposta, tempo de espera, resolução |
| Sem BI por operador/time | Produtividade individual existe; ranking/export não |
| Sem dimensão departamento | Mencionado em docs; não implementado em relatórios |
| Sem CSAT | Seção prevista na referência; sem tabela/pesquisa |
| Dado morto | `getCockpitMetrics` retorna `chats: 12` hardcoded (não usado na UI) |

---

## 3. Referência visual (telas enviadas)

### 3.1 Visão Geral (Overview)

| Elemento na referência | Equivalente HuginFlow |
|------------------------|----------------------|
| Conversas abertas / não atendidas / não atribuídas | `crm_conversas` por status + `atribuido_a_id` |
| Status do agente (disponível / ocupado / desconectado) | Presença operacional (MVP: inferida por carga; depois: presença real) |
| Tráfego de conversa (heatmap hora × dia) | Volume de `crm_interacoes` ou abertura de `crm_conversas` |

### 3.2 Conversas (KPIs com tendência)

Padrão a adotar: **card + valor + % vs período anterior + mini-gráfico diário**.

| Indicador (referência) | Equivalente HuginFlow | Fonte provável |
|------------------------|----------------------|----------------|
| Conversas (volume + tendência) | Threads omnichannel iniciados | `crm_conversas` |
| Tempo da 1ª resposta | SLA operador/IA | `crm_interacoes` |
| Tempo de espera do cliente | Entre msg cliente e próxima resposta | `crm_interacoes` |
| Tempo de resolução | Abertura → encerramento | `crm_conversas` + histórico |
| Contagem de resolução | Conversas encerradas / cards finalizados | `crm_conversas`, `crm_cards` |
| Mensagens recebidas | Volume inbound | `crm_interacoes` |

### 3.3 Adaptação ao HuginFlow

No HuginFlow, **conversa**, **card CRM** e **lead** são entidades distintas mas relacionadas. O BI deve permitir alternar a **unidade de análise**:

- Thread WhatsApp (`crm_conversas.sessao_id`)
- Card de funil (`crm_cards`)
- Lead (`crm_leads`)

**Diferencial:** sessões por departamento (Comercial vs Financeiro no mesmo lead) — métrica exclusiva do produto.

---

## 4. Arquitetura do módulo

### 4.1 Rota e posição no menu

**Proposta:** `/cockpit/relatorios` como item de **primeiro nível** no menu lateral (ícone de gráfico), não apenas sub-item do CRM Hub — pois consolida atendimento, vendas, IA e canais.

Manter link/atalho no CRM Hub apontando para o mesmo módulo.

### 4.2 Navegação lateral (seções)

```
Relatórios & Indicadores
├── Visão Geral          ← snapshot operacional + heatmap
├── Conversas            ← SLAs omnichannel (referência Chatwoot)
├── CRM & Funis          ← conversão, receita, velocidade, gargalos
├── Agentes & Times      ← produtividade por operador/departamento
├── IA & Automação       ← triagem, handover, silêncio, transbordo
├── Canais & Origens     ← WhatsApp, landing, simulador
├── CSAT & Qualidade     ← fase 2 (pesquisa pós-atendimento)
└── Exportar / Agendar   ← CSV, PDF, e-mail (fase 2)
```

### 4.3 Filtros globais (persistentes no topo)

| Filtro | Opções |
|--------|--------|
| Período | Hoje, 7d, 30d, 90d, intervalo customizado |
| Departamento | Comercial, Financeiro, Logística, etc. |
| Funil / Pipeline | Multi-select |
| Canal | WhatsApp, Landing Page, Simulador |
| Operador / Time | Multi-select |
| Horário comercial | Toggle “considerar só expediente” (como na referência) |

Todos os filtros devem respeitar **`empresa_id`** (multi-tenancy).

---

## 5. Catálogo de indicadores

### 5.1 Visão Geral — painel da gerência

KPIs quasi-real-time (refresh 30s–5min):

**Operação omnichannel**

- Conversas abertas
- Não atendidas (sem operador há X minutos)
- Não atribuídas
- Em atendimento humano vs. em IA

**Operação CRM**

- Cards ativos no funil
- Cards atrasados (prazo vencido)
- Receita fechada no mês *(já no gestor)*
- Etapas em gargalo (≥ N cards)

**Equipe**

- Operadores com conversas abertas
- Operadores ociosos (sem atribuição)
- Média de cards por responsável

**Visualizações**

- Heatmap tráfego (hora × dia da semana)
- Top 5 gargalos por funil (barra horizontal)
- Funil resumido: Entrada → Qualificação → Proposta → Fechado

---

### 5.2 Conversas — SLAs e volume

| Indicador | Definição | Meta típica (configurável) |
|-----------|-----------|----------------------------|
| Volume de conversas | Threads novos no período | — |
| Mensagens recebidas / enviadas | Inbound vs outbound | Balanceamento |
| Tempo da 1ª resposta (FRT) | Cliente → 1ª resposta (IA ou humano) | < 5 min (IA), < 15 min (humano) |
| Tempo médio de resposta | Média entre msgs do cliente e resposta | Tendência ↓ |
| Tempo de espera do cliente | Soma de esperas na thread | SLA departamental |
| Tempo de resolução | Abertura → encerramento | Por tipo de demanda |
| Taxa de resolução | Encerradas / abertas | > 85% |
| Taxa de reabertura | Thread reaberta em 48h | < 10% |
| Conversas por canal | Distribuição WhatsApp vs outros | Mix de origem |
| Sessões por departamento | Multi-sessão por lead | Diferencial HuginFlow |

**Gráficos auxiliares:** série diária, distribuição por hora, comparativo vs período anterior.

---

### 5.3 CRM & Funis — vendas e processos

| Indicador | Definição | Fonte |
|-----------|-----------|-------|
| Taxa de conversão por etapa | % cards que avançam A → B | `crm_cards_history` |
| Velocidade média do funil | Dias entre criação e `finalizado` | `crm_cards` |
| Tempo médio por etapa | Permanência em cada stage | `crm_cards_history` |
| Receita fechada | Soma `valor` onde `finalizado=true` | `crm_cards` |
| Ticket médio | Receita / deals fechados | Calculado |
| Pipeline weighted | Valor × probabilidade por etapa | `crm_cards` + config funil |
| Taxa de perda / abandono | Cards parados > N dias sem movimento | `crm_cards` + histórico |
| Cards criados vs fechados | Fluxo líquido do funil | `crm_cards` |
| Origem → conversão | Lead source → card fechado | `crm_leads` + cards |
| Gargalos por etapa | Ranking de acúmulo | Parcial no gestor hoje |

**Visualizações:** funil clássico, Sankey de transições, ranking de funis.

---

### 5.4 Agentes & Times — produtividade humana

| Indicador | Definição |
|-----------|-----------|
| Conversas atribuídas / resolvidas | Por operador |
| Cards movimentados | `STATUS_CHANGED` no período |
| Tempo médio 1ª resposta | Por operador |
| Tempo médio resolução | Por operador |
| Carga atual | Conversas + cards abertos |
| Taxa de handover recebido | Encaminhamentos cross-funil |
| Menções chat interno respondidas | Colaboração (`chat_messages`) |
| Ranking de produtividade | Score composto (configurável) |

**Dimensões:** operador, departamento, funil, turno.

**Ação:** botão “Baixar relatório de agentes” → CSV/PDF por período.

---

### 5.5 IA & Automação — diferencial HuginFlow

Indicadores que a referência Chatwoot **não possui**, mas o produto suporta:

| Indicador | Definição |
|-----------|-----------|
| Taxa de resolução pela IA | Threads encerradas sem transbordo |
| Taxa de transbordo (handover) | IA → `atendimento` humano |
| Motivos de transbordo | Tags / structured output |
| Tempo em silêncio | `ia_silence_timeout` + `last_human_interaction` |
| Mensagens multimodais | Texto, áudio, imagem, documento |
| Documentos reconhecidos | Pipeline OCR/match WhatsApp |
| Precisão de triagem | Classificação dept/funil (auditoria manual) |
| Custo estimado IA | Tokens/chamadas (fase 2) |

---

### 5.6 Canais & Origens

| Indicador | Definição |
|-----------|-----------|
| Volume por canal | WhatsApp, Landing, Simulador |
| Taxa de desconexão | Alertas canal offline (lógica já no cockpit) |
| Conversão por origem | Lead → card → fechamento |
| Horários de pico por canal | Heatmap segmentado |
| Tempo offline acumulado | Impacto em SLA |

---

### 5.7 CSAT & Qualidade (fase 2)

Hoje **não há persistência de CSAT**. Planejar:

- Pesquisa pós-atendimento (WhatsApp ou link)
- NPS / nota 1–5 por operador e departamento
- Correlação CSAT × tempo de resposta × transbordo IA

---

## 6. Dashboard principal vs. módulo BI

### 6.1 O que permanece no `/cockpit` (enxuto)

**Gestor — máximo 6 cards:**

1. Receita fechada (mês) + % vs anterior ✅ *existente*
2. Cards ativos + atrasados
3. Conversas abertas / não atribuídas
4. Tempo médio 1ª resposta (7d)
5. Gargalo principal (1 etapa)
6. Taxa transbordo IA → humano (7d)

**Operador:** manter foco tático (fila, atividades, produtividade) ✅ *existente*

### 6.2 Integração entre camadas

Cada card do dashboard = **atalho clicável** para a tela detalhada no BI com filtros pré-aplicados.

Exemplo: clicar em “Conversas abertas: 78” → `/cockpit/relatorios/conversas?status=aberta&periodo=7d`.

---

## 7. Camada de dados (estratégia técnica)

### 7.1 Fontes existentes

| Domínio | Tabelas / APIs |
|---------|----------------|
| CRM | `crm_cards`, `crm_cards_history`, `pipelines`, `pipeline_stages` |
| Leads / canais | `crm_leads`, `crm_canais`, `crm_canais_roteamento` |
| Omnichannel | `crm_conversas`, `crm_interacoes`, `crm_chat_threads` |
| Chat interno | `chat_messages`, `chat_read_markers` |
| Financeiro (RN3) | `finance_contas_receber`, `fn_finance_dashboard` |
| Tenancy | `empresas`, `usuarios`, `departamentos`, `grupos_acesso` |

Server actions atuais: `src/app/(app)/cockpit/actions.ts`, `omni-chat-actions.ts`.

### 7.2 Evolução recomendada

| Fase | Abordagem |
|------|-----------|
| **Fase 1** | RPCs PostgreSQL tenant-safe: `fn_analytics_overview(empresa_id, periodo, filtros)` |
| **Fase 2** | Views materializadas (refresh horário): `mv_analytics_daily_conversations`, `mv_analytics_stage_dwell_time`, `mv_analytics_agent_performance` |
| **Fase 3** | Campos calculados na ingestão: `first_response_at`, `resolved_at` em conversas/interações |

**Índices sugeridos:** `crm_interacoes(created_at, conversa_id)`, `crm_cards_history(created_at, empresa_id)`.

**Gráficos:** substituir barras CSS por biblioteca (Recharts ou similar) — heatmap, line, funnel.

### 7.3 Regra de ouro

Toda query **obrigatoriamente** filtra por `empresa_id` / `organization_id`. Backend bloqueia mesmo que o front oculte.

---

## 8. Segurança e RBAC

Novos recursos na matriz de permissões (`src/constants/permissions.ts`):

| Recurso | Ver | Exportar |
|---------|-----|----------|
| `relatorios_visao_geral` | Gestor+ | Admin |
| `relatorios_conversas` | Gestor+ | Admin |
| `relatorios_crm` | Gestor+ | Admin |
| `relatorios_agentes` | Admin | Admin |
| `relatorios_ia` | Admin | Admin |

| Perfil | Acesso |
|--------|--------|
| Operador | Sem BI (ou apenas “Meu desempenho”) |
| Visualizador | Ver relatórios; sem exportar |
| Admin / Gestor | Acesso completo conforme matriz |

Sincronia front + backend na mesma tabela de permissões (regra do produto).

---

## 9. Roadmap de entregas

### Entrega 1 — MVP “Visão Geral + Conversas” (4–6 semanas)

- [ ] Rota `/cockpit/relatorios` com layout BI (sidebar + filtros globais)
- [ ] Seções: Visão Geral + Conversas (6 KPIs da referência)
- [ ] Heatmap de tráfego
- [ ] RPCs básicas + gráficos diários com tendência
- [ ] Ativar card no CRM Hub
- [ ] KPIs do `ManagerDashboard` como atalhos para o BI

**Valor:** gestor deixa de depender de planilha externa para SLAs de atendimento.

### Entrega 2 — CRM & Funis (3–4 semanas)

- [ ] Funil de conversão, velocidade, gargalos, receita
- [ ] Filtro por pipeline/departamento
- [ ] Export CSV básico

**Valor:** diretoria enxerga vendas e processos no mesmo lugar que atendimento.

### Entrega 3 — Agentes, Times e IA (3–4 semanas)

- [ ] Ranking operadores, relatório exportável
- [ ] Painel IA (transbordo, silêncio, documentos)
- [ ] Comparativo departamentos

**Valor:** gestão de equipe e ROI da automação.

### Entrega 4 — CSAT, agendamento e alertas (fase 2)

- [ ] Pesquisa pós-atendimento
- [ ] Relatórios agendados por e-mail
- [ ] Metas/SLA configuráveis com alerta no cockpit

---

## 10. Decisões de produto pendentes

Antes de implementar, alinhar com stakeholders:

| # | Decisão |
|---|---------|
| 1 | **Unidade principal de análise:** conversa, card ou lead? |
| 2 | **SLA de expediente:** horário comercial configurável por departamento? |
| 3 | **IA conta como “agente”** nos rankings ou seção separada? |
| 4 | **Financeiro do tenant** entra no BI (AR) ou continua só RN3? |
| 5 | **Metas:** gestor define meta mensal (receita/conversas) e vê % atingido? |
| 6 | **Retenção:** quantos meses de histórico nos gráficos (12? 24?)? |
| 7 | **Rota final:** `/cockpit/relatorios` vs. `/cockpit/crm/relatorios` (redirect)? |

---

## 11. Arquivos relacionados no repositório

| Arquivo | Papel |
|---------|-------|
| `src/app/(app)/cockpit/page.tsx` | Roteamento dashboard por perfil |
| `src/app/(app)/cockpit/actions.ts` | Server actions KPIs gestor/operador |
| `src/app/(app)/cockpit/_components/ManagerDashboard.tsx` | Dashboard gestor |
| `src/app/(app)/cockpit/_components/OperatorDashboard.tsx` | Dashboard operador |
| `src/app/(app)/cockpit/crm/page.tsx` | CRM Hub — placeholder relatórios |
| `src/constants/permissions.ts` | Matriz RBAC (estender) |
| `src/app/(app)/cockpit/financeiro/actions.ts` | Referência RPC dashboard financeiro |
| `docs/homologacao/plano-homologacao-versao.md` | Bloco 10 — testes dashboard |
| `scripts/supabase/block10-test-dashboard.mjs` | Script homologação dashboard |

---

## 12. Resumo executivo

| Aspecto | Proposta |
|---------|----------|
| **Onde** | `/cockpit/relatorios` — módulo dedicado, menu principal |
| **Modelo visual** | Cards KPI + tendência + mini-gráfico + heatmap (referência Chatwoot) |
| **Diferencial** | CRM + omnichannel + IA + workflows no mesmo BI |
| **Dashboard** | 4–6 KPIs vivos; BI = profundidade, filtros, histórico |
| **Dados** | Evoluir: server actions → RPCs → views materializadas |
| **Prioridade MVP** | Visão Geral + Conversas (SLAs) |
| **Status** | Planejamento — aguardando decisões §10 |

---

## Histórico do documento

| Data | Alteração |
|------|-----------|
| 2026-09-02 | Criação — levantamento completo a partir de conversa de produto + baseline do código |
