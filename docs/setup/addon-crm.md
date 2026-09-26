# Setup básico — Addon CRM

**Quando usar:** ativar CRM comercial em empresa nova ou existente.  
**Doc único (inventário + playbook):** [specs-a-aplicar/desenvolvimento-addon-crm.md](../specs-a-aplicar/desenvolvimento-addon-crm.md)

## Dependências

| Addon | Obrigatório? | Motivo |
|-------|--------------|--------|
| `workflow` | **Sim** (padrão do playbook) | Funis / Kanban de oportunidades |
| `omni` | Não | Chat na oportunidade |
| `estoque` | Não | Itens SKU (P1) e pedido (P3) |
| `cadastros` | Recomendado | SKUs / masters |

## Ao ativar `crm` (sempre seedar)

Independente de Omni/Estoque:

| Template | Conteúdo (ajustar na P0.3) |
|----------|----------------------------|
| Funil **Vendas** | Estágios comerciais (ex.: Qualificação → Proposta → Negociação → Ganhou / Perdeu) |

- IDs gravados na config do tenant  
- Seed **idempotente**  
- Funil **editável** depois; estável é o mapeamento ganhou/perdeu (win/loss)

## O que o cliente vê por fase

| Fase | Disponível após implementar |
|------|----------------------------|
| **P0** | Hub CRM, funil Vendas, win/loss, Pessoas |
| **P1** | Contas, tarefas/agenda, itens na oportunidade |
| **P2** | Propostas PDF, origem/UTM, metas, IA próximo passo |
| **P3** | E-mail/cadência, pedido→estoque, scoring… |

## Checklist onboarding (P0)

- [ ] Addon `workflow` enabled  
- [ ] Addon `crm` enabled  
- [ ] Funil Vendas seed presente (sem duplicar)  
- [ ] Hub CRM acessível (RBAC)  
- [ ] Finalizar oportunidade exige ganhou/perdeu + motivo  
- [ ] Empresa B não vê dados da A  

## Checklist (P1+)

- [ ] Conta com contatos  
- [ ] Tarefa de follow-up no card  
- [ ] Itens SKU somam valor da oportunidade  
- [ ] (P2) PDF de proposta gerado  
- [ ] (P2) Origem preenchida em lead inbound  

## Fora deste setup

Cutover PROD, marketing automation, e-sign — ver playbook P3 / backlog.
