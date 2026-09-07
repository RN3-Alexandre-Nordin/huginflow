# E2E — Núcleo operador + módulo RN3

## Sessão e browser contínuo

**Um único project Playwright** → **um único browser** o tempo todo.

Ordem na mesma janela: `UI-AUTH-*` → grava sessão → card/omni/funil/chat…

Com **Mostrar browser** / `TEST_HEADED=1`, a janela só fecha no fim da suíte.

Relatório: `docs/homologacao/execucoes/agente-latest.html`

Env obrigatória: `TEST_BASE_URL`, `TEST_EMAIL`, `TEST_PASSWORD` e `TEST_TENANT_ID`.

## Agente Fases 1–5 (scripts + UI)

```bash
npm run test:agent:dev             # scripts Fases 1–5 + e2e/core
npm run test:agent:scripts         # todos os SCR-* das Fases 1–5
npm run test:agent:scripts:phase2  # somente EMP/FUNIL/CHAT
npm run test:agent:scripts:phase3  # somente LEAD/CANAL/RBAC
npm run test:agent:scripts:phase4  # somente RAG/SIM/WA/DASH
npm run test:agent:scripts:phase5  # somente Analytics/BI
npm run test:agent:prod-smoke      # produção read-only, com opt-ins próprios
```

Os scripts mutáveis das Fases 2–5 exigem `TEST_ALLOW_MUTATIONS=1`, `TEST_EMAIL`,
`TEST_PASSWORD`, `TEST_TENANT_ID` e `SUPABASE_SERVICE_ROLE_KEY`. A execução falha
antes de escrever caso a credencial não pertença exatamente ao tenant informado.
Todos os dados temporários usam marcador do run e são removidos com filtro de `empresa_id`.
Isolamento por departamento é aplicado somente aos testes do Chat Omnichannel.
Na Fase 4, Evolution é apenas simulado: não há criação de instância, QR, áudio real
ou envio a clientes. Chamadas live de IA não fazem parte da bateria obrigatória.
`UI-BIFROST-01` valida o formulário e a consulta de chamados pelo embed SSO HTTPS,
sem enviar um ticket e sem deixar dados residuais no Bifrost.

## Módulo no sistema (`/cockpit/testes`)

- Só **superadmin** RN3
- Requer `TEST_RUNNER_ENABLED=true` no servidor (DEV local / VM)
- Suite padrão: **Fases 1–5 — Agente** (`agent-dev`); opção **Só UI** (`e2e-core`)
- Toggle **Mostrar browser** = Chromium headed na máquina do processo Node
- Histórico em `test_runs`, sempre com `organization_id`, + HTML em `docs/homologacao/execucoes/{runId}/report.html`

## Smoke de produção

O comando `test:agent:prod-smoke` é estritamente read-only: recusa service role,
`TEST_ALLOW_MUTATIONS=1`, HTTP e localhost. Exige `TEST_TARGET_ENV=prod`,
`TEST_PROD_SMOKE=1`, `TEST_PROD_SUPABASE_REF`, `TEST_PROD_OTHER_TENANT_ID`
e credencial canário de tenant.
Ele não cria registros, não dispara webhook, não chama IA e não gera contas.

Plano: [docs/homologacao/agente-testes-plano.md](../docs/homologacao/agente-testes-plano.md)
