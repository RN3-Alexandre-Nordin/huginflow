# Setup básico — Addon Estoque

**Quando usar:** empresa nova com Estoque, ou Estoque ligado depois do cadastro.  
**Playbook técnico:** [specs-a-aplicar/integracao-estoque-workflow-ia.md](../specs-a-aplicar/integracao-estoque-workflow-ia.md) (Onda 0).

## O que o seed cria (sempre ao ligar Estoque)

Independente de ter o addon **Workflow**:

| Funil (template) | Estágios padrão | Uso |
|------------------|-----------------|-----|
| Aprovação de Requisição | Pendente → Aprovado / Rejeitado | Aprovação via Kanban |
| Remessas em aberto | Em poder de terceiros → Atrasada / Retorno parcial / Encerrada | Acompanhamento |
| Pendências de cadastro NFe | De-para pendente → Em revisão → Resolvido | Entrada XML |

IDs dos funis/estágios ficam em `est_config`. Seed é **idempotente** (não duplica).

Os funis são **editáveis** depois (renomear estágio, inserir etapa). O que não se perde é o mapeamento “este estágio = aprovado/rejeitado” na config.

## O que NÃO acontece sem Workflow

- Não cria cards no Kanban.
- Switches “via Workflow” ficam desabilitados/ocultos na Configuração do Estoque.
- Requisição usa aprovação **interna** (`/requisicoes/aprovacao`) se a política exigir.

## Quando o cliente compra Workflow depois

1. Ativar addon `workflow` na empresa.
2. Em **Estoque → Configuração → Workflow**, ligar por processo:
   - Aprovação de requisição
   - Remessas em aberto
   - Pendências NFe
3. Conferir se os funis seed aparecem (já devem existir desde o Estoque).
4. Opcional: ajustar nomes/estágios no hub Workflow.

Não é necessário “rodar seed de novo”, salvo empresa legada sem seed (aí backfill da Onda 0).

## Checklist “Estoque pronto”

- [ ] Addon `estoque` enabled
- [ ] Locais (ex. BRANCO) ok
- [ ] Três funis seed presentes (mesmo sem Workflow)
- [ ] RBAC dos submódulos ok
- [ ] Se tiver Workflow: switches desejados on + teste de 1 requisição no funil

## Checklist “Workflow + Estoque”

- [ ] Addon `workflow` enabled
- [ ] Switch aprovação req on
- [ ] Mover card para Aprovado atualiza status da requisição
- [ ] Rejeitado idem
- [ ] Multi-tenant: empresa B não vê cards/req da A

## Fora deste setup

Inventário físico, SAP, IA de-para — ver Ondas 2–4 do playbook de integração.
