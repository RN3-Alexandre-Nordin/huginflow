# Homologação — versão _______________

**Data:** _______________  
**Commit / imagem Docker:** _______________  
**Ambiente:** produção — `https://app.huginflow.com`  
**Executor:** _______________

## Regras

1. Um bloco por vez, na ordem.
2. Marque **Sucesso** `[x]` ou **Falha** `[ ]` — pare em qualquer falha.
3. Tenant de teste: rodar `block3-bootstrap-test-empresa-prod.mjs` na primeira homologação ou após limpeza.
4. Credenciais do tenant: `scripts/supabase/out/prod-test-tenant.json` (local).

---

## Bloco 1 — Infraestrutura

| # | Teste | S | F | Notas |
|---|-------|---|---|-------|
| 1.1 | Site `/login` HTTP 200 | [ ] | [ ] | |
| 1.2 | HTTPS válido | [ ] | [ ] | |
| 1.3 | Deploy com commit esperado | [ ] | [ ] | |
| 1.4 | `OPENAI_API_KEY` no health | [ ] | [ ] | |
| 1.5 | Evolution API acessível | [ ] | [ ] | |
| 1.6 | Webhook HTTPS correto | [ ] | [ ] | |
| 1.7 | `GET /api/health/omnichannel` OK | [ ] | [ ] | |

**Script:** `curl` ou health manual · runner bloco 1

---

## Bloco 2 — Login e sessão

| # | Teste | S | F | Notas |
|---|-------|---|---|-------|
| 2.1 | Login correto | [ ] | [ ] | |
| 2.2 | Senha errada → erro | [ ] | [ ] | |
| 2.3 | `/cockpit` sem login → redirect | [ ] | [ ] | |
| 2.4 | Logout | [ ] | [ ] | |
| 2.5 | Trocar senha | [ ] | [ ] | |
| 2.6 | Sem link "Esqueci senha" | [ ] | [ ] | |

**Script:** `block2-test-auth-prod.mjs`

---

## Bloco 3 — Empresa e usuários

| # | Teste | S | F | Notas |
|---|-------|---|---|-------|
| 3.0 | Criar empresa teste | [ ] | [ ] | |
| 3.1 | Empresa ativa | [ ] | [ ] | |
| 3.2 | IA OpenAI (`gpt-4o`) | [ ] | [ ] | |
| 3.3 | Gestor criado + login | [ ] | [ ] | |
| 3.4 | Operador criado + login | [ ] | [ ] | |
| 3.5 | Gestor edita empresa | [ ] | [ ] | |
| 3.6 | Superadmin vê empresa | [ ] | [ ] | |

**Scripts:** `block3-bootstrap-test-empresa-prod.mjs` · `block3-test-empresa-prod.mjs`

---

## Bloco 4 — Funil e cards

| # | Teste | S | F | Notas |
|---|-------|---|---|-------|
| 4.1 | Criar funil | [ ] | [ ] | |
| 4.2 | Criar card | [ ] | [ ] | |
| 4.3 | Editar card | [ ] | [ ] | |
| 4.4 | Atribuir operador | [ ] | [ ] | |
| 4.5 | Anexo | [ ] | [ ] | |
| 4.6 | Mover etapa | [ ] | [ ] | |
| 4.7 | Finalizar | [ ] | [ ] | |
| 4.8 | Excluir card | [ ] | [ ] | |

**Script:** `block4-test-funil-cards-prod.mjs`

---

## Bloco 5 — Leads

| # | Teste | S | F | Notas |
|---|-------|---|---|-------|
| 5.1 | Criar lead | [ ] | [ ] | |
| 5.2 | Buscar nome/telefone | [ ] | [ ] | |
| 5.3 | Editar | [ ] | [ ] | |
| 5.4 | Excluir | [ ] | [ ] | |

**Script:** `block5-test-leads-prod.mjs`

---

## Bloco 6 — Canais

| # | Teste | S | F | Notas |
|---|-------|---|---|-------|
| 6.1 | Canal inbound | [ ] | [ ] | |
| 6.2 | Roteamento funil/etapa | [ ] | [ ] | |
| 6.3 | API inbound token válido/inválido | [ ] | [ ] | |
| 6.3b | Lead + card criados | [ ] | [ ] | |

**Script:** `block6-test-canais-prod.mjs`

---

## Bloco 7 — Base de conhecimento (RAG)

| # | Teste | S | F | Notas |
|---|-------|---|---|-------|
| 7.1 | PDF + embeddings 3072 | [ ] | [ ] | |
| 7.2 | UI upload (código) | [ ] | [ ] | |
| 7.3 | Texto direto | [ ] | [ ] | |
| 7.4 | Download PDF | [ ] | [ ] | |
| 7.5 | Excluir fonte | [ ] | [ ] | |

**Script:** `block7-test-conhecimento-prod.mjs`

---

## Bloco 8 — Simulador IA

| # | Teste | S | F | Notas |
|---|-------|---|---|-------|
| 8.1 | Gestor/operador `simulador.view` | [ ] | [ ] | |
| 8.2 | RAG na resposta | [ ] | [ ] | |
| 8.3 | Não inventa fora da base | [ ] | [ ] | |
| 8.4 | Áudio no simulador → Whisper + IA | [ ] | [ ] | **Manual** — botão 🎤 |

**Script:** `block8-test-simulador-prod.mjs`

---

## Bloco 9 — WhatsApp

| # | Teste | S | F | Notas |
|---|-------|---|---|-------|
| 9.1 | Instância + QR | [ ] | [ ] | |
| 9.2 | Status **`open`** (QR escaneado) | [ ] | [ ] | **Manual** |
| 9.3 | Mensagem no cockpit | [ ] | [ ] | |
| 9.4 | IA + RAG | [ ] | [ ] | |
| 9.5 | Takeover pausa IA | [ ] | [ ] | |
| 9.6 | Lead automático | [ ] | [ ] | |
| 9.7 | Card no funil | [ ] | [ ] | |
| 9.8 | Áudio PTT → transcrição + IA responde | [ ] | [ ] | **Manual** — enviar áudio real |

**Scripts:** `block9-test-whatsapp-prod.mjs` · `block9-verify-whatsapp-connected-prod.mjs` · `block9b-test-audio-transcription-prod.mjs`

---

## Bloco 10 — Dashboard gestor

| # | Teste | S | F | Notas |
|---|-------|---|---|-------|
| 10.1 | KPIs numéricos | [ ] | [ ] | |
| 10.2 | Gráfico dia/semana/mês | [ ] | [ ] | |
| 10.3 | 4 métricas | [ ] | [ ] | |

**Script:** `block10-test-dashboard-prod.mjs`

---

## Bloco 10A — Chat interno

| # | Teste | S | F | Notas |
|---|-------|---|---|-------|
| 10A.1 | Mensagem global | [ ] | [ ] | |
| 10A.2 | Chat no card | [ ] | [ ] | |
| 10A.3 | Menção `[Nome]` | [ ] | [ ] | |
| 10A.4 | DM gestor ↔ operador | [ ] | [ ] | |
| 10A.5 | Isolamento empresas | [ ] | [ ] | |
| 10A.6 | Direcionar card no global | [ ] | [ ] | |

**Script:** `block10a-test-chat-interno-prod.mjs`

---

## Bloco 11 — Permissões

| # | Teste | S | F | Notas |
|---|-------|---|---|-------|
| 11.1 | Operador sem Financeiro | [ ] | [ ] | |
| 11.2 | Gestor isolado (RLS) | [ ] | [ ] | |
| 11.3 | Superadmin Financeiro/Contratos | [ ] | [ ] | |
| 11.4 | Operador sem cadastro empresas | [ ] | [ ] | |

**Script:** `block11-test-permissoes-prod.mjs`

---

## Bloco 12 — UAT cliente (manual)

| # | Teste | S | F | Notas |
|---|-------|---|---|-------|
| 12.x | Sessão guiada com cliente | [ ] | [ ] | NASU / tenant real |

**Scripts:** `block12-preflight-nasu-prod.mjs` · `block12-bootstrap-nasu-prod.mjs`

---

## Sign-off

| Item | OK |
|------|-----|
| Blocos 1–11 homologação técnica | [ ] |
| Bloco 12 UAT cliente | [ ] |
| Stress (se aplicável — ver stress-test-plan.md) | [ ] |
| **Release autorizada** | [ ] |

**Responsável:** _______________ **Data:** _______________
