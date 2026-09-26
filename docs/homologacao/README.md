# Homologação de versão — HuginFlow

Processo reutilizável para validar cada deploy em **produção** (`https://app.huginflow.com`) antes de liberar clientes.

Índice geral da documentação: [../README.md](../README.md).

## Quando usar

- Novo deploy em `main` / imagem `:latest`
- Alteração em migrations Supabase
- Mudança em Evolution, webhook ou variáveis Portainer
- Antes de onboarding de novo cliente

## Arquivos

| Item | Uso |
|------|-----|
| [`/cockpit/testes`](../../src/app/(app)/cockpit/testes/page.tsx) | UI RN3: disparar suíte, progresso, histórico HTML |
| `TEST_RUNNER_ENABLED=true` | Obrigatório no `.env.local` (local/self-hosted) para o botão Rodar |
| `npm run test:e2e:core` / `npm run test:agent:dev` | Suíte via CLI |
| [execucoes/](./execucoes/) | Artefatos HTML/JSON por run (+ `agente-latest.html`) |
| [agente-testes-plano.md](./agente-testes-plano.md) | **Controle mestre do agente** (UI+scripts Fases 1–5 · Estoque hold) |
| [plano-homologacao-versao.md](./plano-homologacao-versao.md) | Checklist mestre — copie por release |
| [stress-test-plan.md](./stress-test-plan.md) | Plano opcional de carga / stress |
| [../MIGRACAO-SUPABASE.md](../MIGRACAO-SUPABASE.md) | Pacotes SQL ⏳ PROD + checklists pré-prod |
| [../specs-a-aplicar/CUTOVER-PROD-SET-2026.md](../specs-a-aplicar/CUTOVER-PROD-SET-2026.md) | Runbook go-live |
| `scripts/supabase/run-homologacao-prod.mjs` | Runner automatizado (blocos 1–11) |
| `scripts/supabase/out/prod-test-tenant.json` | Tenant de teste gerado (local, não commitar) |

## Fluxo recomendado

1. Deploy concluído e health OK.
2. Copie o checklist: `cp docs/homologacao/plano-homologacao-versao.md docs/homologacao/execucoes/homologacao-YYYY-MM-DD.md`
3. Preencha **Versão / commit** no topo da cópia.
4. Rode o runner ou blocos individuais (ordem obrigatória):

```bash
# Todos os blocos automatizados (1–11)
npm run homologacao:prod

# Ou bloco a bloco
node scripts/supabase/block3-bootstrap-test-empresa-prod.mjs   # só na 1ª vez ou tenant novo
node scripts/supabase/block2-test-auth-prod.mjs
# … ver plano-homologacao-versao.md
```

5. **Manual obrigatório:** Bloco 9.2 — escanear QR WhatsApp (`block9-verify-whatsapp-connected-prod.mjs` após conectar).
6. **Cliente:** Bloco 12 — UAT com tenant real (ex.: NASU).
7. Sign-off no checklist da execução.

## Pré-requisitos locais

- `.env.production` com Supabase service role, Evolution prod, `OPENAI_API_KEY`
- Node 20+
- Rede até `app.huginflow.com` e `evo.rn3.tec.br`

## Histórico go-live NASU (2026-07-02)

Blocos 1–11 automatizados em prod OK. Bloco 12 pendente (UAT NASU).  
Roteiro contínuo: [agente-testes-plano.md](./agente-testes-plano.md) · pacotes SQL: [../MIGRACAO-SUPABASE.md](../MIGRACAO-SUPABASE.md).
