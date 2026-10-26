# Plano de Cutover para Produção — próximo ciclo (depois de v0.7.0)

> **Runbook operacional de subida para produção.**  
> Pacotes SQL e changelog: [MIGRACAO-SUPABASE.md](../MIGRACAO-SUPABASE.md).  
> Índice: [README.md](../README.md).  
> **Aberto em:** 06/10/2026  
> **Ambiente Origem (DEV):** `vujqukqsfwmoezwyuoum` ([huginflow-dev](https://supabase.com/dashboard/project/vujqukqsfwmoezwyuoum))  
> **Ambiente Destino (PROD):** `zmypzexefjbovuknjlid` ([huginflow-prod](https://supabase.com/dashboard/project/zmypzexefjbovuknjlid))  
> **Branch de Trabalho:** `develop` | **Branch de Produção:** `main`  
> **VPS Produção:** Docker Swarm em `vps.rn3.tec.br` / Portainer / Traefik  
> **Status:** ciclo anterior `v0.7.0` encerrado (cutover 01–52 em produção em 05/10/2026). Este runbook está zerado. O próximo item será **01**.

---

## 1. Diretriz de Governança e Regra Suprema

> **LEI ABSOLUTA (`develop` ≠ `main`):**  
> Nenhum `push`, `merge` ou `commit` deve ser feito na branch `main` sem autorização explícita do responsável.  
> Qualquer alteração no banco de produção (Supabase Prod) via SQL/MCP só pode ser executada mediante **pedido explícito**.

---

## 2. Resumo executivo deste ciclo

Ainda sem entregas. Preencher aqui o que entrar na próxima versão, à medida que for homologado em DEV.

---

## 3. Dependências e pré-requisitos

Nenhuma dependência nova neste ciclo.

Variáveis já usadas em produção permanecem: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL`.

---

## 4. Roteiro sequencial de migrations SQL (banco prod)

Executar **na ordem numérica**, no SQL Editor de produção ou via MCP Supabase Prod, somente com autorização explícita.

| Ordem | Arquivo de Migration | Escopo / Conteúdo | Verificação pós-execução |
|---|---|---|---|
| 02 | `supabase/migrations/202610211200_crm_interacoes_user_fk_set_null.sql` | FK `crm_interacoes.user_id` com `ON DELETE SET NULL`: excluir usuário não é barrado pelo histórico dele. **Aplicada em PROD em 21/10.** | `SELECT confdeltype FROM pg_constraint WHERE conname = 'crm_interacoes_user_id_fkey';` devolve `n`. |
| 03 | `supabase/migrations/202610261300_omni_chat_indexes.sql` | Índices da lista do Omni e da checagem de acesso do operador: `crm_conversas (empresa_id, created_at desc)` e `crm_cards (empresa_id, conversa_id)`. **Aplicada em PROD em 26/10.** | `SELECT indexname FROM pg_indexes WHERE indexname IN ('idx_crm_conversas_empresa_created', 'idx_crm_cards_empresa_conversa');` devolve as duas linhas. |

---

## 5. Arquivos de código deste release

Ainda sem lista. Registrar aqui os módulos novos ou alterados quando a versão for fechada.

---

## 6. Procedimento de execução

```
[ETAPA 0: SMOKE DEV] ──> [ETAPA 1: PREPARAÇÃO] ──> [ETAPA 2: BANCO PROD] ──> [ETAPA 3: GIT & DEPLOY] ──> [ETAPA 4: SMOKE PROD]
```

### Etapa 0: Smoke em DEV

Homologar em DEV o que este ciclo entregar, antes de qualquer produção.

### Etapa 1: Preparação

1. Janela de baixo tráfego, com a equipe avisada.
2. Backup do banco de produção (Dashboard → Database → Backups).
3. `develop` com smoke verde.

### Etapa 2: Banco de produção

Somente com pedido explícito. Aplicar os itens da Seção 4, na ordem, e rodar a verificação de cada linha.

### Etapa 3: Git e deploy

1. Versionar em **`develop`** (tag `vX.Y.Z`).
2. Merge e push em **`main`** só com a frase explícita do responsável. O push em `main` dispara o deploy da VPS.
3. Voltar para `develop` em seguida.

### Etapa 4: Smoke em produção

Repetir o smoke da Etapa 0 no app publicado.

---

## 7. Rollback

- **Código:** reverter a imagem do serviço na VPS. `reset` ou force-push em `main` só se for expressamente ordenado. Voltar para `develop` na hora.
- **Banco:** migrations deste projeto são aditivas. Expurgo só com o snapshot da Etapa 1, e só com pedido explícito.

---

## 8. Histórico de versões

| Versão | Data | Status | Descrição |
|---|---|---|---|
| `v0.7.0` | 2026-10-05 | Ciclo encerrado · em produção | Cutover 01–52 em DEV e PROD. Addons estoque e compras desligados por empresa. Detalhe no git da tag `v0.7.0`. |
