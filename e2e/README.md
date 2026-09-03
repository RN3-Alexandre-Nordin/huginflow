# E2E — Núcleo operador + módulo RN3

## Sessão e browser contínuo

**Um único project Playwright** → **um único browser** o tempo todo.

Ordem na mesma janela: `UI-AUTH-*` → grava sessão → card/omni/funil/chat…

Com **Mostrar browser** / `TEST_HEADED=1`, a janela só fecha no fim da suíte.

Relatório: `docs/homologacao/execucoes/agente-latest.html`

Env: `TEST_BASE_URL`, `TEST_EMAIL`, `TEST_PASSWORD` (ou `MANUAL_*`).

## Agente Fase 1 (scripts + UI)

```bash
npm run test:agent:dev      # SCR-INFRA/AUTH + e2e/core
npm run test:agent:scripts  # só scripts HTTP/Auth
```

## Módulo no sistema (`/cockpit/testes`)

- Só **superadmin** RN3
- Requer `TEST_RUNNER_ENABLED=true` no servidor (DEV local / VM)
- Suite padrão: **Fase 1 — Agente** (`agent-dev`); opção **Só UI** (`e2e-core`)
- Toggle **Mostrar browser** = Chromium headed na máquina do processo Node
- Histórico em tabela `test_runs` + HTML em `docs/homologacao/execucoes/{runId}/report.html`

Plano: [docs/homologacao/agente-testes-plano.md](../docs/homologacao/agente-testes-plano.md)
