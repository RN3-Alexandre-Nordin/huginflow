# Plano de stress / carga — Ragnar

Complemento opcional à [homologação funcional](./plano-homologacao-versao.md).  
**Objetivo:** descobrir limites e regressões de performance antes que clientes sintam lentidão ou queda.

## É possível?

**Sim.** O stack permite stress test de forma controlada:

| Camada | O que estressar | Ferramenta sugerida |
|--------|-----------------|---------------------|
| App Next.js | rotas API, login, dashboard | [k6](https://k6.io), autocannon |
| Webhook Evolution | burst `MESSAGES_UPSERT` | script Node + k6 |
| API inbound | POST `/api/inbound/leads` | k6 |
| Supabase | RLS + inserts/leituras | scripts + monitor Supabase |
| OpenAI | embeddings + chat (IA) | script com rate limit consciente |
| Evolution | send/receive WhatsApp | **cuidado** — risco ban; usar instância teste |

Homologação funcional (blocos 1–11) valida **corretude**. Stress valida **capacidade e degradação**.

---

## Princípios

1. **Nunca** stress pleno em tenant de cliente real no horário comercial.
2. Usar **tenant de teste** (`prod-test-tenant`) ou ambiente staging espelhado.
3. Monitorar durante o teste: CPU/RAM Swarm, logs app, Supabase dashboard, Evolution.
4. Definir **critérios de aborto** (error rate > 5%, p95 > 10s, OpenAI 429 em série).
5. OpenAI e WhatsApp têm **custo e rate limit** — fases de IA/WhatsApp com VU baixo.

---

## Fases sugeridas

### Fase S0 — Baseline (5 min)

Medir sem carga artificial:

- `GET /api/health/omnichannel`
- login + dashboard (1 usuário gestor)
- 1 webhook simulado

Registrar p50/p95 de referência.

### Fase S1 — Smoke load (10 min)

| Cenário | VUs | Duração | Alvo | Pass |
|---------|-----|---------|------|------|
| Health | 5 | 2 min | `/api/health/omnichannel` | 0% 5xx |
| Login page | 10 | 2 min | `GET /login` | p95 < 2s |
| Inbound leads | 3 | 3 min | POST token teste | 201, sem duplicata quebrada |

### Fase S2 — Sustained (20 min)

| Cenário | VUs | Duração | Alvo | Pass |
|---------|-----|---------|------|------|
| Webhook Evolution | 5→15 | 15 min | POST webhook tenant teste | fila processa, 0% 5xx |
| CRM reads | 5 | 10 min | queries dashboard (gestor JWT) | p95 < 3s |
| Chat interno | 3 | 5 min | inserts `chat_messages` | RLS OK, sem deadlock |

### Fase S3 — Spike (5 min)

| Cenário | Padrão | Alvo | Pass |
|---------|--------|------|------|
| Webhook burst | 0→50 VUs em 30s, 2 min | recovery < 60s | sem perda permanente |
| Inbound burst | 20 req/s por 1 min | 429/503 aceitável se graceful | |

### Fase S4 — IA / WhatsApp (opcional, off-hours)

| Cenário | Taxa | Limite | Pass |
|---------|------|--------|------|
| Simulador/RAG | 1 msg/s por 5 min | OpenAI 429 < 10% | respostas coerentes |
| WhatsApp real | 1 msg/5s manual | instância teste | Evolution stable |

---

## Métricas a coletar

- **App:** p50/p95/p99 latência, throughput, 4xx/5xx
- **Supabase:** conexões ativas, slow queries, CPU projeto
- **Swarm/VPS:** CPU, memória, rede do serviço `ragnar-app`
- **Evolution:** fila webhook, instâncias `open` vs `connecting`
- **Negócio:** leads/cards duplicados, conversas órfãs, IA respondendo após takeover

---

## Implementação no repo (próximo passo)

Estrutura proposta:

```
scripts/stress/
  k6-health.js
  k6-webhook-evolution.js
  k6-inbound-leads.js
  run-stress-s1.mjs          # orquestra S0+S1
  README.md
```

Dependência: `k6` instalado localmente ou CI job manual `workflow_dispatch`.

Variáveis: `STRESS_APP_URL`, `STRESS_INBOUND_TOKEN`, `STRESS_INSTANCE`, tenant em `prod-test-tenant.json`.

---

## Quando rodar stress

| Release | Homologação funcional | Stress |
|---------|----------------------|--------|
| Patch pequeno | Blocos afetados | S0 ou skip |
| CRM / webhook / IA | Blocos 4–9 | S1 + S2 |
| Infra / deploy major | 1–11 completo | S1 + S2 + S3 |
| Antes go-live grande | 1–11 + UAT | S1–S4 conforme risco |

---

## Riscos conhecidos

- **OpenAI:** custo e rate limit em testes de IA prolongados.
- **WhatsApp:** número de teste pode ser banido se spam; usar instância dedicada.
- **Supabase free/pro:** connection pool limitado — spike pode saturar antes do app.
- **Dados:** stress em prod cria leads/cards lixo — limpar tenant teste após S2/S3.

---

## Sign-off stress (opcional)

| Fase | Executada | Pass | Notas |
|------|-----------|------|-------|
| S0 Baseline | [ ] | [ ] | |
| S1 Smoke | [ ] | [ ] | |
| S2 Sustained | [ ] | [ ] | |
| S3 Spike | [ ] | [ ] | |
| S4 IA/WhatsApp | [ ] | [ ] | |

**Autorizado para produção sob carga esperada:** [ ] Sim · [ ] Não · [ ] N/A
