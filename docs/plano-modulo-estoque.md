# Plano de desenvolvimento — Módulo Estoque (resumo)

> **Spec completa de implementação:**  
> **[desenvolvimento-modulo-estoque.md](./desenvolvimento-modulo-estoque.md)**  
>  
> **Mapa de fases da plataforma:**  
> [plano-desenvolvimento-fases.md](./plano-desenvolvimento-fases.md) (bloco F4 / F5)

**REGRA DE OURO:** Cardex (`est_movimentos`) + Saldo (`est_saldos`) na **mesma transação** · falha → rollback. Detalhe no topo de [desenvolvimento-modulo-estoque.md](./desenvolvimento-modulo-estoque.md).

**Resumo:** módulo nativo no Hugin · slug `estoque` on/off · Cadastros fora deste módulo · MVP = locais (`BRANCO`) + config NFe + entrada (lote c/ justificativa / planilha / XML) + retirada (lote manual) + transferência + ajuste (lote manual) + requisição · consultas/export/KPIs depois.

**Próximo passo:** iniciar **F4.1** em DEV (locais + Cardex/Saldo + hub) após OK — prod só com pedido explícito.
