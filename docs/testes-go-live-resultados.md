# Resultados dos testes — Go-live

Atualizado automaticamente a cada fase executada.

---

## Fase 1 — Quarta: Fundação

**Executado em:** 2026-06-03  
**Ambiente verificado:** produção (`app.ragnar.ia.br`) + Supabase prod + dev local (`localhost:3000`)

### Resumo

| Resultado | Qtd |
|-----------|-----|
| ✅ Passou | 8 |
| ⚠️ Parcial / manual | 6 |
| ❌ Falhou / pendente | 9 |

**Veredito da fase:** **NÃO PRONTA** — infra parcialmente OK, mas **deploy em prod desatualizado**, **Evolution inacessível em prod**, e **tenant do cliente (NASU) sem usuários, funil nem canal**.

---

### Infraestrutura

| ID | Teste | Resultado | Evidência |
|----|-------|-----------|-----------|
| INF-01 | Site prod responde | ✅ | `GET /login` → HTTP 200 |
| INF-02 | Deploy CI/CD atual | ⚠️ | Código local com OpenAI/RN3 finance **não commitado**; health prod ainda reporta `geminiApiKeyConfigured` (build antigo) |
| INF-03 | Variáveis Portainer | ⚠️ | Prod: Supabase OK, token Evolution OK; **Evolution URL** `evo.supa.rn3.tec.br` inacessível; webhook `ragnar.supa.rn3.tec.br` (não `app.ragnar.ia.br`) |
| INF-04 | SSL HTTPS | ✅ | Health: `webhookUrlIsPublic: true` |
| OMN-01 | Health omnichannel prod | ❌ | `evolutionReachable: false`, `evolutionStatus: error` |
| OMN-01 | Health omnichannel **dev local** | ✅ | Evolution 200, OpenAI configurado, webhook HTTPS |

---

### Autenticação

| ID | Teste | Resultado | Notas |
|----|-------|-----------|-------|
| AUTH-01 | Login válido | ⚠️ Manual | Requer credenciais — não executado automaticamente |
| AUTH-02 | Login inválido | ⚠️ Manual | Testar na UI |
| AUTH-05 | Logout | ⚠️ Manual | Testar na UI |
| AUTH-06 | Esqueci senha | ❌ | Rota `/forgot-password` **não existe** (link na tela de login) |
| — | Rota `/cockpit` sem sessão | ✅ | Redireciona (307) para home/login |

---

### Empresa (tenant)

| ID | Teste | Resultado | Evidência |
|----|-------|-----------|-----------|
| EMP-01 | Empresa cliente em prod | ✅ | NASU ativa (`2b87fa27-…`, status `active`) |
| EMP-02 | Editar dados | ⚠️ Manual | Não testado na UI |
| EMP-03 | Config IA | ⚠️ | Prod ainda com `ai_model: gemini-2.0-flash-latest` — migrar para GPT + `OPENAI_API_KEY` no deploy |
| EMP-04 | Isolamento tenant | ⚠️ | 4 empresas em prod; isolamento depende de RLS — testar na Fase 3 com 2 usuários |

**Empresas em prod:** Monte Sinai, NASU, Ragnar, RN3 Soluções (todas ativas).

---

### Usuários

| ID | Teste | Resultado | Evidência |
|----|-------|-----------|-----------|
| USR-01 | Operador NASU | ❌ | **0 usuários** vinculados à NASU em prod |
| USR-02 | Gestor NASU | ❌ | Idem — criar antes do sábado |

**Total usuários prod:** 6 (outras empresas).

---

### Funis e canais

| ID | Teste | Resultado | Evidência |
|----|-------|-----------|-----------|
| FUN-01 | Funil NASU | ❌ | **0 pipelines** em prod (global) |
| FUN-02 | Card no funil | ❌ | Bloqueado — sem funil |
| CAN-01 | Canal inbound NASU | ❌ | **0 canais** para NASU em prod |

**Dev NASU:** grupo "Administradores" existe; sem usuários, funil ou canal.

---

### Código (validação estática — não deployado em prod ainda)

| Item | Resultado |
|------|-----------|
| Menu Financeiro/Contratos `rn3Only` | ✅ Implementado |
| Guards `isRn3SuperAdmin` em financeiro | ✅ Implementado |
| Dashboard gestor com dados reais | ✅ No código local |
| OpenAI + embeddings 3072 | ✅ No código local |

---

### Bloqueadores P0 para corrigir antes da Fase 2

1. **Deploy** — commit + push `main` → Swarm com código OpenAI, dashboard, financeiro RN3-only.
2. **Portainer prod** — `OPENAI_API_KEY`, URLs Evolution/webhook alinhadas ao `.env.production` (`evo.rn3.tec.br`, `app.ragnar.ia.br/api/webhooks/evolution`).
3. **Evolution prod** — instância `evo.supa.rn3.tec.br` inacessível; validar DNS/serviço.
4. **Setup NASU** — criar gestor + operador, funil, canal inbound, atualizar `ai_model` para GPT.
5. **AUTH-06** — remover link esqueci senha ou criar rota (P2, mas confunde no go-live).

---

### Próxima fase

**Fase 2 — Quinta: CRM + IA** (FUN completo, LED, RAG, SIM, DASH) — executar após itens 1–4 acima, ou em **dev** enquanto prod não atualiza.

---

## Fase 2 — Quinta: CRM + IA

*Aguardando execução.*

## Fase 3 — Sexta: Omnichannel E2E + UAT

*Aguardando execução.*

## Fase 4 — Sábado: Go-live

*Aguardando execução.*
