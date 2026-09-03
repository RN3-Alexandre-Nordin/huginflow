# Execuções do agente de testes

Artefatos gerados por `npm run test:e2e:core` ou pelo **Módulo de Testes** (`/cockpit/testes`).

- `{runId}/report.html` — relatório humano (principal)
- `{runId}/summary.json` — máquina
- `{runId}/events.ndjson` — progresso ao vivo
- `agente-latest.html` — atalho do último run CLI

Histórico metadado: tabela Supabase `test_runs` (só superadmin).

Não edite à mão; regenere rodando a suíte.
