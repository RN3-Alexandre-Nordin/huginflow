# Roadmap de testes — Go-live do primeiro cliente

**Go-live:** sábado  
**Ambiente principal de validação E2E:** produção (`https://app.huginflow.com`)

## Objetivo

Garantir que o cliente consiga:

1. Fazer login e operar no cockpit com o perfil correto
2. Receber e responder WhatsApp (IA + takeover humano)
3. Gerenciar leads e cards no funil
4. Alimentar a base de conhecimento e a IA usar esse conteúdo
5. Ter usuários e permissões configurados de forma segura

**Fora do escopo do cliente (só RN3):** Financeiro e Contratos.

---

## Pré-requisitos

| # | Item | Critério OK |
|---|------|-------------|
| P0-1 | Supabase prod ativo | Login funciona |
| P0-2 | `OPENAI_API_KEY` em prod | IA responde |
| P0-3 | Evolution API acessível | Health omnichannel OK |
| P0-4 | Webhook HTTPS público | Evolution entrega eventos |
| P0-5 | Deploy atual em prod | Código com OpenAI + RAG 3072 |
| P0-6 | Empresa do cliente em prod | `ativo = true` |
| P0-7 | Usuários de teste | superadmin, admin, operador |

### Personas

| Persona | `role_global` | Valida |
|---------|---------------|--------|
| RN3 | `superadmin` | Empresa, canais, suporte |
| Gestor cliente | `admin` | Dashboard, cadastros, IA |
| Operador cliente | `operador` | Chat, funil |

---

## Prioridades

| Nível | Significado |
|-------|-------------|
| **P0** | Bloqueia go-live |
| **P1** | Degrada experiência |
| **P2** | Cosmético / backlog |

---

## Módulos e casos de teste

### 1. Autenticação

| ID | Teste | Pri |
|----|-------|-----|
| AUTH-01 | Login válido | P0 |
| AUTH-02 | Login inválido | P0 |
| AUTH-03 | Empresa suspensa | P1 |
| AUTH-04 | Trocar senha | P1 |
| AUTH-05 | Logout | P0 |
| AUTH-06 | Esqueci senha (rota ausente) | P2 |

### 2. Cockpit / Dashboards

| ID | Teste | Pri |
|----|-------|-----|
| DASH-01 | Dashboard operador — métricas reais | P1 |
| DASH-02 | Dashboard gestor — KPIs | P1 |
| DASH-03 | Gráfico — 4 indicadores + período | P1 |
| DASH-04 | Realtime | P2 |
| DASH-05 | Financeiro oculto para não-superadmin | P0 |

### 3. Empresa (RN3)

| ID | Teste | Pri |
|----|-------|-----|
| EMP-01 | Criar empresa | P0 |
| EMP-02 | Editar dados | P1 |
| EMP-03 | Config IA | P0 |
| EMP-04 | Isolamento tenant | P0 |

### 4. Usuários, grupos, departamentos

| ID | Teste | Pri |
|----|-------|-----|
| USR-01 | Criar operador | P0 |
| USR-02 | Editar usuário / senha | P0 |
| USR-03 | Grupo permissões mínimas | P1 |
| USR-04 | Admin altera senha de outro | P1 |
| DEP-01 | CRUD departamentos | P2 |

### 5. Funis e cards

| ID | Teste | Pri |
|----|-------|-----|
| FUN-01 | Criar funil | P0 |
| FUN-02 | Criar card | P0 |
| FUN-03 | Mover card | P0 |
| FUN-04 | Finalizar card | P1 |
| FUN-05 | Filtros Kanban | P1 |
| FUN-06 | Anexos | P2 |
| FUN-07 | Excluir card | P1 |

### 6. Leads

| ID | Teste | Pri |
|----|-------|-----|
| LED-01 | Criar lead manual | P0 |
| LED-02 | Busca | P1 |
| LED-03 | Editar / excluir | P1 |
| LED-04 | Lead via inbound | P0 |

### 7. Canais

| ID | Teste | Pri |
|----|-------|-----|
| CAN-01 | Criar canal inbound | P0 |
| CAN-02 | API inbound com token | P1 |
| CAN-03 | Roteamento funil/etapa | P0 |

### 8. Omnichannel WhatsApp

| ID | Teste | Pri |
|----|-------|-----|
| OMN-01 | Health omnichannel | P0 |
| OMN-02 | Criar instância Evolution | P0 |
| OMN-03 | QR conectado | P0 |
| OMN-04 | Mensagem recebida | P0 |
| OMN-05 | Resposta IA + RAG | P0 |
| OMN-06 | Takeover humano | P0 |
| OMN-07 | Timeout silêncio IA | P1 |
| OMN-08 | Lead automático | P0 |
| OMN-09 | Card no funil via IA | P1 |
| OMN-10 | Realtime chat | P1 |

### 9. Base de conhecimento (RAG)

| ID | Teste | Pri |
|----|-------|-----|
| RAG-01 | Upload PDF | P0 |
| RAG-02 | Texto direto | P0 |
| RAG-03 | Clique upload PDF | P1 |
| RAG-04 | Download PDF | P1 |
| RAG-05 | Simulador usa base | P0 |
| RAG-06 | Pergunta fora da base | P0 |
| RAG-07 | Excluir conhecimento | P1 |

### 10. Simulador

| ID | Teste | Pri |
|----|-------|-----|
| SIM-01 | Acesso com permissão | P1 |
| SIM-02 | Conversa básica | P0 |
| SIM-03 | Personalidade do prompt | P1 |

### 11. Chat interno

| ID | Teste | Pri |
|----|-------|-----|
| CHAT-01 | Mensagem global | P2 |
| CHAT-02 | Menção @nome | P2 |

### 12. Financeiro (só RN3)

| ID | Teste | Pri |
|----|-------|-----|
| FIN-01 | Menu só superadmin | P0 |
| FIN-02 | Dashboard financeiro | P1 |
| FIN-03 | CRUD contrato | P1 |
| FIN-04 | Baixa de conta | P1 |

### 13. Infraestrutura

| ID | Teste | Pri |
|----|-------|-----|
| INF-01 | Site prod responde | P0 |
| INF-02 | Deploy CI/CD | P0 |
| INF-03 | Variáveis Portainer | P0 |
| INF-04 | SSL / HTTPS | P0 |

---

## Cronograma por fase

### Fase 1 — Quarta: Fundação
INF, AUTH básico, EMP, USR, FUN-01/02, CAN-01

### Fase 2 — Quinta: CRM + IA
FUN completo, LED, RAG, SIM, DASH

### Fase 3 — Sexta: Omnichannel E2E + UAT
OMN completo, RBAC, UAT seco, deploy final

### Fase 4 — Sábado: Go-live
Smoke P0 + onboarding cliente

---

## Critérios de sign-off

Todos os **P0** ✅ antes do cliente usar o sistema em produção.

---

## Riscos conhecidos

| Risco | Mitigação |
|-------|-----------|
| Webhook sem HTTPS em dev | Testar em prod |
| Embeddings 3072 | Reenviar PDFs |
| Slug `usuarios` vs `admin_usuarios` | Grupo `is_admin` para gestor |
| `/forgot-password` ausente | Reset manual RN3 |
| PDF sem storage | Reenviar documento |

---

## Registro de execução

Use o plano simplificado por blocos: [`docs/plano-testes-go-live.md`](./plano-testes-go-live.md)
