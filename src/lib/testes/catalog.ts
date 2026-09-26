/**
 * Catálogo humano dos casos E2E — relatório HTML, log ao vivo e detalhe do run.
 * ID bate com o prefixo [UI-…] no nome do teste.
 */
export type TestCatalogEntry = {
  id: string
  area: string
  /** Frase curta do que se espera (resultado). */
  expectativa: string
  /** O que o teste faz, passo a passo. */
  passos: string
}

export const TEST_CATALOG: Record<string, TestCatalogEntry> = {
  'UI-AUTH-01': {
    id: 'UI-AUTH-01',
    area: 'Login',
    expectativa: 'Com e-mail e senha corretos, o operador entra no Cockpit.',
    passos:
      'Abre /login, preenche credencial válida do tenant de teste, clica Entrar e confirma que a URL vai para /cockpit com o shell carregado.',
  },
  'UI-AUTH-02': {
    id: 'UI-AUTH-02',
    area: 'Login',
    expectativa: 'Senha errada mostra mensagem de erro e permanece na tela de login.',
    passos:
      'Em /login, usa e-mail válido com senha inválida, envia o formulário e verifica o alerta de erro sem redirecionar ao Cockpit.',
  },
  'UI-AUTH-03': {
    id: 'UI-AUTH-03',
    area: 'Login / sessão',
    expectativa: 'Sem sessão ativa, tentar abrir /cockpit redireciona para /login.',
    passos:
      'Limpa cookies, navega para /cockpit e confirma redirecionamento automático para a página de login (proteção de rota).',
  },
  'UI-NAV-01': {
    id: 'UI-NAV-01',
    area: 'Menu lateral',
    expectativa: 'No Cockpit aparecem os atalhos Cockpit, Chat Omnichannel e Funis.',
    passos:
      'Com usuário logado, verifica no menu lateral os itens Cockpit, Chat Omnichannel e Funis visíveis.',
  },
  'UI-NAV-02': {
    id: 'UI-NAV-02',
    area: 'Menu lateral',
    expectativa: 'O menu hambúrguer recolhe e expande a navegação lateral.',
    passos: 'Normaliza o menu aberto, recolhe, confirma o estado fechado e expande novamente.',
  },
  'UI-OMNI-01': {
    id: 'UI-OMNI-01',
    area: 'Chat Omnichannel',
    expectativa: 'A tela do Omnichannel abre e a lista de conversas carrega.',
    passos:
      'Navega para Chat Omnichannel, espera a página, o campo Buscar lead e a lista de conversas (ou vazio).',
  },
  'UI-OMNI-02': {
    id: 'UI-OMNI-02',
    area: 'Chat Omnichannel',
    expectativa: 'Ao escolher uma conversa, o campo de resposta humana fica disponível.',
    passos:
      'Clica na primeira conversa da lista e confirma o campo “Responda aqui…”. Pula se não houver conversas.',
  },
  'UI-OMNI-03': {
    id: 'UI-OMNI-03',
    area: 'Chat Omnichannel',
    expectativa: 'Uma conversa selecionada permite abrir o Contexto do cliente.',
    passos: 'Seleciona uma conversa, abre o contexto e confirma o painel lateral carregado.',
  },
  'UI-OMNI-04': {
    id: 'UI-OMNI-04',
    area: 'Chat Omnichannel',
    expectativa: 'O botão Encaminhar fica disponível para uma conversa selecionada.',
    passos: 'Seleciona uma conversa e valida que Encaminhar está visível e habilitado.',
  },
  'UI-OMNI-MULTI': {
    id: 'UI-OMNI-MULTI',
    area: 'Chat Omnichannel / sessões',
    expectativa: 'Duas sessões do mesmo lead mantêm históricos separados.',
    passos:
      'Cria duas threads em departamentos distintos, seleciona cada sessão e confirma que uma não mostra a mensagem da outra.',
  },
  'UI-FUNIL-01': {
    id: 'UI-FUNIL-01',
    area: 'Funil / Kanban',
    expectativa: 'Da lista de Funis, Abrir Kanban leva ao board do funil.',
    passos:
      'Abre Funis, escolhe um funil com cards (prioriza Financeiro/Vendas), clica Abrir Kanban e valida o board.',
  },
  'UI-FUNIL-02': {
    id: 'UI-FUNIL-02',
    area: 'Funil / Kanban',
    expectativa: 'O board exibe pelo menos uma coluna de estágio.',
    passos: 'No Kanban aberto, exige pelo menos uma coluna de estágio visível.',
  },
  'UI-CARD-01': {
    id: 'UI-CARD-01',
    area: 'Hub do Card',
    expectativa: 'O lápis Gestão do Card abre o modal do hub.',
    passos: 'No Kanban, clica em Gestão do Card no primeiro card e espera o modal do hub.',
  },
  'UI-CARD-02': {
    id: 'UI-CARD-02',
    area: 'Hub do Card',
    expectativa: 'No hub aparecem Responsável, Prazo e Cliente.',
    passos: 'Abre o hub e confere os rótulos Responsável, Prazo e Cliente no bloco de metadados.',
  },
  'UI-CARD-03': {
    id: 'UI-CARD-03',
    area: 'Hub do Card',
    expectativa: 'Área de Observações e botão Salvar estão no hub.',
    passos: 'No hub, localiza o painel Observações e o botão Salvar.',
  },
  'UI-CARD-04': {
    id: 'UI-CARD-04',
    area: 'Hub do Card / Anexos',
    expectativa: 'Faixa de Anexos mostra clipe (upload) e link Ver.',
    passos:
      'No hub, valida a faixa Anexos com ícone de clipe e botão Ver. Pula se não houver permissão de anexos.',
  },
  'UI-CARD-05': {
    id: 'UI-CARD-05',
    area: 'Hub do Card / ações',
    expectativa: 'Quatro ações na mesma linha: Encaminhar, WhatsApp, Editar e Chat.',
    passos:
      'No hub, confere Encaminhar, WhatsApp, Editar e Chat na mesma linha (layout compacto).',
  },
  'UI-CARD-06': {
    id: 'UI-CARD-06',
    area: 'Hub do Card / Anexos',
    expectativa: 'A tela Anexos oferece uma área de upload habilitada.',
    passos: 'Abre o hub, entra em Anexos e valida painel, área de upload e input de arquivo.',
  },
  'UI-CARD-07': {
    id: 'UI-CARD-07',
    area: 'Hub do Card / Encaminhar',
    expectativa: 'A tela Encaminhar oferece seleção de Departamento destino.',
    passos: 'Abre Encaminhar e confirma o modo departamento e o seletor de destino habilitado.',
  },
  'UI-CARD-MOVE': {
    id: 'UI-CARD-MOVE',
    area: 'Funil / Kanban',
    expectativa: 'Arrastar um card para outra coluna persiste a nova etapa.',
    passos:
      'Cria card efêmero, arrasta para o segundo estágio, recarrega o board e confirma a persistência.',
  },
  'UI-CHAT-01': {
    id: 'UI-CHAT-01',
    area: 'Chat interno',
    expectativa: 'O botão flutuante abre o painel Conversas da equipe.',
    passos: 'No Cockpit, clica no botão flutuante de chat e verifica o painel Conversas aberto.',
  },
  'UI-CHAT-02': {
    id: 'UI-CHAT-02',
    area: 'Chat interno / Card',
    expectativa: 'Uma thread de card permite reabrir a Gestão do Card.',
    passos:
      'Abre um Kanban, busca o mesmo card no chat, entra na thread e usa Gestão do Card para abrir o hub.',
  },
  'UI-CHAT-03': {
    id: 'UI-CHAT-03',
    area: 'Chat interno / menções',
    expectativa: 'Digitar @ abre a lista e insere uma menção de usuário.',
    passos: 'Entra numa thread de card, digita @, seleciona um membro e valida o texto inserido.',
  },
  'UI-PERM-01': {
    id: 'UI-PERM-01',
    area: 'RBAC',
    expectativa: 'Usuário sem funis.view não vê o menu nem acessa a tela de Funis.',
    passos:
      'Cria usuário restrito efêmero, valida menu oculto e acesso direto com painel Acesso Interditado.',
  },
  'UI-TENANT-01': {
    id: 'UI-TENANT-01',
    area: 'Multi-tenant',
    expectativa: 'Funil de outra empresa não aparece na lista e não pode ser aberto.',
    passos:
      'Cria funil sentinela em outro tenant, pesquisa pelo nome e tenta a URL direta sem obter o board.',
  },
  'UI-CAD-01': {
    id: 'UI-CAD-01',
    area: 'Cadastros / hub',
    expectativa: 'O hub Cadastros lista Pessoas, SKUs, Famílias, Conversões, De-para e Ativos.',
    passos: 'Abre /cockpit/cadastros e confere os seis hub-cards de mestres.',
  },
  'UI-CAD-02': {
    id: 'UI-CAD-02',
    area: 'Cadastros / Pessoas',
    expectativa: 'A lista de Pessoas carrega sem Acesso interditado.',
    passos: 'Navega para /cockpit/crm/leads e valida o container pessoas-page.',
  },
  'UI-CAD-03': {
    id: 'UI-CAD-03',
    area: 'Cadastros / SKUs',
    expectativa: 'A lista de SKUs carrega sem acesso interditado.',
    passos: 'Navega para /cockpit/cadastros/skus e valida skus-page.',
  },
  'UI-CAD-04': {
    id: 'UI-CAD-04',
    area: 'Cadastros / Famílias',
    expectativa: 'A lista de famílias de SKU carrega.',
    passos: 'Navega para /cockpit/cadastros/sku-familias e valida sku-familias-page.',
  },
  'UI-CAD-05': {
    id: 'UI-CAD-05',
    area: 'Cadastros / Conversões UM',
    expectativa: 'A lista de conversões de unidade carrega.',
    passos: 'Navega para /cockpit/cadastros/conversoes-um e valida conversoes-um-page.',
  },
  'UI-CAD-06': {
    id: 'UI-CAD-06',
    area: 'Cadastros / De-para',
    expectativa: 'A lista de de-para SKU×parceiro carrega.',
    passos: 'Navega para /cockpit/cadastros/sku-depara e valida sku-depara-page.',
  },
  'UI-CAD-07': {
    id: 'UI-CAD-07',
    area: 'Cadastros / Ativos',
    expectativa: 'A lista de ativos/patrimônio carrega.',
    passos: 'Navega para /cockpit/cadastros/ativos e valida ativos-page.',
  },
  'SCR-CAD-01': {
    id: 'SCR-CAD-01',
    area: 'Cadastros',
    expectativa:
      'Família, SKU, conversão UM, pessoa, de-para e ativo CRUD com RLS e cleanup no tenant.',
    passos:
      'Cria cadeia efêmera filtrada por empresa_id, valida leitura autenticada e remove tudo ao final.',
  },
  'UI-ENT-01': {
    id: 'UI-ENT-01',
    area: 'Entitlements',
    expectativa: 'Com addon workflow off, Funis some do menu e a URL é bloqueada.',
    passos:
      'Desliga workflow no tenant, faz login, confere nav/hub sem Funis e /cockpit/crm/funis → acesso-negado; restaura addon.',
  },
  'UI-ENT-02': {
    id: 'UI-ENT-02',
    area: 'Entitlements',
    expectativa: 'Com addon omni off, Chat some do menu e a URL é bloqueada.',
    passos:
      'Desliga omni, valida nav sem Omni e /cockpit/crm/chat → acesso-negado; restaura addon.',
  },
  'UI-ENT-03': {
    id: 'UI-ENT-03',
    area: 'Entitlements / Financeiro',
    expectativa: 'Admin de tenant não vê menu Financeiro e a rota cai em acesso negado.',
    passos: 'No cockpit do tenant, confirma ausência do link Financeiro e bloqueio de /cockpit/financeiro.',
  },
  'API-ENT-01': {
    id: 'API-ENT-01',
    area: 'Entitlements / API v1',
    expectativa: 'API interna de addons exige Bearer e não expõe financeiro como addon.',
    passos:
      'GET /api/v1/addons e /empresas/:id/addons com secret; confirma catalogo sem financeiro e 401 sem auth.',
  },
  'SCR-INFRA-01': {
    id: 'SCR-INFRA-01',
    area: 'Infraestrutura',
    expectativa: 'App responde em /login e o health do omnichannel está saudável.',
    passos: 'GET /login (HTTP 200) e GET /api/health/omnichannel com healthy=true.',
  },
  'SCR-AUTH-01': {
    id: 'SCR-AUTH-01',
    area: 'Auth (API)',
    expectativa: 'Login Supabase com credencial válida cria sessão.',
    passos: 'signInWithPassword com e-mail/senha do tenant de teste; espera session.user.',
  },
  'SCR-AUTH-02': {
    id: 'SCR-AUTH-02',
    area: 'Auth (API)',
    expectativa: 'Senha errada é rejeitada pelo Auth.',
    passos: 'signInWithPassword com senha inválida; espera erro Invalid login credentials.',
  },
  'UI-DASH-01': {
    id: 'UI-DASH-01',
    area: 'Dashboard gestor',
    expectativa: 'KPIs e filtros do gestor carregam dados reais.',
    passos:
      'Abre o cockpit, valida os quatro KPIs, as quatro métricas e alterna os períodos dia, semana e mês.',
  },
  'SCR-EMP-01': {
    id: 'SCR-EMP-01',
    area: 'Empresa / tenant',
    expectativa: 'Empresa e usuário de teste estão ativos e isolados pelo tenant.',
    passos:
      'Autentica o gestor, valida empresa/perfil e confirma que a consulta RLS não retorna usuários de outra empresa.',
  },
  'SCR-FUNIL-01': {
    id: 'SCR-FUNIL-01',
    area: 'Funil / cards',
    expectativa: 'Funil, card, movimento e anexo funcionam com RLS e cleanup.',
    passos:
      'Cria funil e estágios temporários, cria/edita/move card, anexa arquivo, valida URL assinada e remove tudo ao final.',
  },
  'SCR-CHAT-01': {
    id: 'SCR-CHAT-01',
    area: 'Chat interno',
    expectativa: 'Mensagens global, de card e direta ficam acessíveis somente no tenant.',
    passos:
      'Cria mensagens temporárias nos três contextos, valida related_card_id e isolamento RLS, e remove tudo ao final.',
  },
  'SCR-LEAD-01': {
    id: 'SCR-LEAD-01',
    area: 'Leads',
    expectativa: 'Lead pode ser criado, buscado, editado e excluído dentro do tenant.',
    passos:
      'Usa cliente autenticado, filtra todas as operações por empresa_id e confirma cleanup do lead temporário.',
  },
  'SCR-CANAL-01': {
    id: 'SCR-CANAL-01',
    area: 'Canais / inbound',
    expectativa: 'Canal, roteamento e token inbound criam lead e card no destino correto.',
    passos:
      'Cria canal e rota temporários, rejeita token inválido, aceita token válido, valida o destino e limpa os dados.',
  },
  'SCR-RBAC-01': {
    id: 'SCR-RBAC-01',
    area: 'RBAC / RLS',
    expectativa: 'Usuário restrito vê apenas ações e dados permitidos pela matriz.',
    passos:
      'Cria usuário/grupo efêmeros, valida check_permission, bloqueio de escrita e canais, e isolamento entre tenants.',
  },
  'SCR-RAG-01': {
    id: 'SCR-RAG-01',
    area: 'Base de conhecimento / RAG',
    expectativa: 'Fonte, storage, vetor 3072 e busca semântica respeitam tenant e RBAC.',
    passos:
      'Cria fonte e PDF efêmeros, grava vetor determinístico, consulta match_knowledge_base e valida cascade/cleanup.',
  },
  'SCR-SIM-01': {
    id: 'SCR-SIM-01',
    area: 'Simulador IA',
    expectativa: 'Mensagem fora de escopo gera resposta auditável sem chamar WhatsApp real.',
    passos:
      'Usa o simulador pela UI com telefone sintético, valida resposta, sessão e reasoning, e remove os artefatos.',
  },
  'SCR-WA-01': {
    id: 'SCR-WA-01',
    area: 'WhatsApp / webhook',
    expectativa: 'Webhook sintético cria lead, card e histórico sem IA nem envio externo.',
    passos:
      'Cria canal Evolution fictício com IA desligada, posta inbound textual e valida persistência tenant-safe.',
  },
  'SCR-DASH-01': {
    id: 'SCR-DASH-01',
    area: 'Dashboard gestor',
    expectativa: 'KPIs e séries do gestor refletem deltas determinísticos da operação.',
    passos:
      'Cria cards/conversas efêmeros e confirma deltas de ativos, vendas, gargalo, chats e buckets.',
  },
  'UI-OMNI-DEPT': {
    id: 'UI-OMNI-DEPT',
    area: 'Chat Omnichannel / departamentos',
    expectativa: 'Operadores veem somente sessões do próprio departamento; admin vê toda a empresa.',
    passos:
      'Cria dois operadores/departamentos e duas sessões do mesmo lead; compara a lista em três contextos autenticados.',
  },
  'UI-BI-01': {
    id: 'UI-BI-01',
    area: 'Relatórios / Analytics',
    expectativa: 'Relatórios carregam KPIs, série diária, heatmap e filtro de departamento.',
    passos:
      'Abre /cockpit/relatorios, valida os quatro KPIs, série, heatmap e atualização do filtro.',
  },
  'UI-FIN-01': {
    id: 'UI-FIN-01',
    area: 'Financeiro',
    expectativa: 'Financeiro permanece restrito ao superadmin RN3 no MVP.',
    passos:
      'Com um admin de tenant, tenta abrir Financeiro e confirma redirecionamento para Acesso Restrito sem renderizar dados.',
  },
  'SCR-ANALYTICS-01': {
    id: 'SCR-ANALYTICS-01',
    area: 'Relatórios / Analytics',
    expectativa: 'RPCs analytics respeitam tenant e filtros de departamento, canal e pipeline.',
    passos:
      'Cria fixture efêmera em dois departamentos, valida quatro RPCs e recusa chamadas anônimas, helper interno e outro tenant.',
  },
  'UI-BIFROST-01': {
    id: 'UI-BIFROST-01',
    area: 'Suporte / Bifrost',
    expectativa: 'O usuário abre o formulário e consulta seus chamados pelo embed SSO.',
    passos:
      'Abre Central de ajuda → Chamados, valida formulário de novo chamado, fecha e valida a lista Meus chamados no iframe HTTPS.',
  },
  'UI-BIFROST-02': {
    id: 'UI-BIFROST-02',
    area: 'Suporte / Bifrost',
    expectativa: 'O SSO permite acessar diretamente o formulário e a consulta no domínio Bifrost.',
    passos:
      'Emite um JWT curto para cada destino, navega diretamente em bifrost.rn3.tec.br e valida o formulário e a tela Meus chamados.',
  },
  'UI-EST-ADDON-01': {
    id: 'UI-EST-ADDON-01',
    area: 'Estoque / entitlement',
    expectativa: 'Sem addon estoque o menu some e a URL do hub fica bloqueada.',
    passos:
      'Com tenant sem estoque (ou usuário sem entitlement), confirma ausência do item Estoque e bloqueio ao abrir /cockpit/estoque.',
  },
  'UI-EST-NAV-01': {
    id: 'UI-EST-NAV-01',
    area: 'Estoque / hub',
    expectativa: 'Com addon e estoque.view, o hub Estoque abre com os cards operacionais.',
    passos:
      'Login no tenant com estoque, abre Estoque no menu e valida cards (Locais, Entradas, Retiradas, Transferências, Ajustes, Remessas, Requisições).',
  },
  'UI-EST-LOC-01': {
    id: 'UI-EST-LOC-01',
    area: 'Estoque / Locais',
    expectativa: 'CRUD de locais mantém um único principal BRANCO e rejeita segundo principal.',
    passos:
      'Abre Locais, garante/cria BRANCO com eh_principal, tenta segundo principal e valida a mensagem de bloqueio.',
  },
  'UI-EST-CFG-01': {
    id: 'UI-EST-CFG-01',
    area: 'Estoque / Configuração',
    expectativa: 'Configuração guarda path NFe, modo de saldo de req. e aprovador.',
    passos:
      'Abre Configuração, confere abas/campos de NFe e requisição e que o botão de reconstruir saldos aparece para quem pode.',
  },
  'UI-EST-SAL-01': {
    id: 'UI-EST-SAL-01',
    area: 'Estoque / Saldos',
    expectativa: 'A consulta de saldos carrega posição materializada com paginação.',
    passos: 'Abre Saldos, valida lista/paginação e que os totais vêm do servidor (não agregação no cliente).',
  },
  'UI-EST-CAR-01': {
    id: 'UI-EST-CAR-01',
    area: 'Estoque / Cardex',
    expectativa: 'O Cardex lista movimentos com filtro e paginação, sem erro/timeout.',
    passos:
      'Abre Cardex, confirma painel (table/empty) e ausência de “Erro ao carregar” / statement timeout.',
  },
  'UI-EST-CAR-02': {
    id: 'UI-EST-CAR-02',
    area: 'Estoque / Cardex',
    expectativa:
      'Busca livre por código SKU com hífen (ex. DEST-011) resolve sem timeout; não mistura OR ilike+sku_id.',
    passos:
      'Abre /cardex?q=<codigo-com-hífen> do tenant; espera painel OK e zero mensagem de timeout.',
  },
  'UI-EST-REL-01': {
    id: 'UI-EST-REL-01',
    area: 'Estoque / Relatórios',
    expectativa: 'O hub de relatórios abre slugs e a 1ª página respeita limite 50.',
    passos:
      'Abre /cockpit/estoque/relatorios, entra em um slug com volume e confere até 50 linhas na página 1.',
  },
  'UI-EST-ENT-01': {
    id: 'UI-EST-ENT-01',
    area: 'Estoque / Entradas',
    expectativa: 'Entrada em lote na tela exige justificativa e sobe saldo.',
    passos:
      'Cria entrada manual com item, justificativa e local; confirma lote OK e saldo aumentado no local.',
  },
  'UI-EST-ENT-02': {
    id: 'UI-EST-ENT-02',
    area: 'Estoque / Entradas',
    expectativa: 'Import de planilha de entrada valida linhas e grava só as OK.',
    passos: 'Envia planilha de entrada; confere erros por linha e itens válidos persistidos.',
  },
  'UI-EST-ENT-03': {
    id: 'UI-EST-ENT-03',
    area: 'Estoque / Entradas NFe',
    expectativa: 'XML NFe de fixture passa pelo motor V1–V4 e registra status.',
    passos:
      'Usa XML em docs/testes/, processa pela UI de XML e valida parse, bloqueios ou lote conforme cadastros.',
  },
  'UI-EST-ENT-04': {
    id: 'UI-EST-ENT-04',
    area: 'Estoque / Entradas',
    expectativa: 'Sem fornecedor, de-para ou conversão UM a entrada é bloqueada com mensagem clara.',
    passos:
      'Tenta entrar item sem cadastro completo e confere mensagens apontando Pessoas / De-para / Conversões UM.',
  },
  'UI-EST-RET-01': {
    id: 'UI-EST-RET-01',
    area: 'Estoque / Retiradas',
    expectativa: 'Retirada manual em lote baixa saldo e bloqueia quantidade acima do disponível.',
    passos:
      'Cria retirada com SKU+qtd+justificativa (local BRANCO); confirma cardex saida/retirada e bloqueio se insuficiente.',
  },
  'UI-EST-TRF-01': {
    id: 'UI-EST-TRF-01',
    area: 'Estoque / Transferências',
    expectativa: 'Transferência move saldo origem→destino sem converter UM.',
    passos:
      'Monta lote com dois locais distintos, valida saldo na origem e confirma redistribuição após gravar.',
  },
  'UI-EST-AJU-01': {
    id: 'UI-EST-AJU-01',
    area: 'Estoque / Ajustes',
    expectativa: 'Ajuste +/- exige justificativa e não gera saldo negativo.',
    passos: 'Lança ajuste positivo e tenta negativo acima do saldo; valida bloqueio e cardex de ajuste.',
  },
  'UI-EST-REM-01': {
    id: 'UI-EST-REM-01',
    area: 'Estoque / Remessas',
    expectativa: 'Envio a terceiro baixa local e sobe poder de terceiros.',
    passos:
      'Cria remessa com destinatário e motivo do catálogo; confere saldos local e poder de terceiros.',
  },
  'UI-EST-REM-02': {
    id: 'UI-EST-REM-02',
    area: 'Estoque / Remessas',
    expectativa: 'Retorno parcial/total devolve ao local e reduz poder de terceiros.',
    passos: 'Abre retorno da remessa, devolve quantidade e valida saldos sem misturar com entrada de compra.',
  },
  'UI-EST-REM-03': {
    id: 'UI-EST-REM-03',
    area: 'Estoque / Remessas',
    expectativa: 'Baixa definitiva liquida o restante em poder de terceiros no Cardex.',
    passos: 'Liquida item remanescente com motivo de baixa e confere movimento remessa_baixa / TERCEIROS.',
  },
  'UI-EST-REQ-01': {
    id: 'UI-EST-REQ-01',
    area: 'Estoque / Requisições',
    expectativa: 'Requisição manual exige requisitante em Pessoas e itens SKU/qtd.',
    passos: 'Cria requisição nova, seleciona pessoa e itens, salva e vê na listagem.',
  },
  'UI-EST-REQ-02': {
    id: 'UI-EST-REQ-02',
    area: 'Estoque / Requisições',
    expectativa: 'Import de planilha de requisição cria documentos com origem rastreável.',
    passos:
      'Importa modelo Hugin (ou ATC se addon); confere codigo_origem/sistema_origem e itens gerados.',
  },
  'UI-EST-REQ-03': {
    id: 'UI-EST-REQ-03',
    area: 'Estoque / Aprovação',
    expectativa: 'Fila de aprovação interna permite aprovar/reprovar com auditoria.',
    passos:
      'Com req pendente, abre /requisicoes/aprovacao como aprovador e registra decisão auditável.',
  },
  'UI-EST-REQ-04': {
    id: 'UI-EST-REQ-04',
    area: 'Estoque / Atendimento',
    expectativa: 'Atendimento gera saída por requisição e respeita o modo de saldo insuficiente.',
    passos:
      'Atende req aprovada (total ou parcial conforme config) e confere cardex origem=requisicao + saldo.',
  },
  'SCR-EST-GOLD-01': {
    id: 'SCR-EST-GOLD-01',
    area: 'Estoque / Regra de Ouro',
    expectativa: 'Cardex e Saldo gravam no mesmo commit; falha reverte os dois.',
    passos:
      'Chama RPC/fluxo atômico com sucesso e com erro forçado; valida presença/ausência conjunta em est_movimentos e est_saldos.',
  },
  'SCR-EST-BATCH-01': {
    id: 'SCR-EST-BATCH-01',
    area: 'Estoque / Batch',
    expectativa: 'Reconstrução de saldos a partir do cardex fecha divergências por empresa.',
    passos:
      'Dispara est_reconstruir_saldos_from_cardex no tenant de teste e confere coerência com SUM do cardex.',
  },
  'SCR-EST-TENANT-01': {
    id: 'SCR-EST-TENANT-01',
    area: 'Estoque / Multi-tenant',
    expectativa: 'Empresa A não lê estoque da empresa B via RLS.',
    passos:
      'Cria artefato efêmero no tenant A e consulta autenticado no B (ou sentinela); espera zero linhas.',
  },
  'SCR-EST-ENT-01': {
    id: 'SCR-EST-ENT-01',
    area: 'Estoque / Entradas',
    expectativa: 'Entrada service/RPC sobe saldo e cardex tipo entrada.',
    passos: 'Fixture mínima de entrada no tenant; valida movimento e upsert de est_saldos; cleanup.',
  },
  'SCR-EST-SALDO-01': {
    id: 'SCR-EST-SALDO-01',
    area: 'Estoque / Saldo insuficiente',
    expectativa: 'Retirada, transferência e ajuste negativo bloqueiam acima do disponível.',
    passos: 'Com saldo conhecido, tenta três operações acima do limite e espera erro sem alterar posição.',
  },
  'SCR-EST-TRF-01': {
    id: 'SCR-EST-TRF-01',
    area: 'Estoque / Transferências',
    expectativa: 'Transferência redistribui saldos mantendo o total do SKU na empresa.',
    passos: 'Transfere qtd origem→destino; confere origem↓ destino↑ e soma estável; cleanup.',
  },
  'SCR-EST-REM-01': {
    id: 'SCR-EST-REM-01',
    area: 'Estoque / Remessas',
    expectativa: 'Envio e retorno atualizam saldo local e poder de terceiros juntos.',
    passos: 'Envia remessa, valida poder; retorna parcial; confere ambos os saldos e cardex; cleanup.',
  },
  'SCR-EST-REQ-01': {
    id: 'SCR-EST-REQ-01',
    area: 'Estoque / Requisições',
    expectativa: 'Ciclo requisição → aprovação → atendimento respeita o modo de saldo.',
    passos:
      'Cria req efêmera, aprova, atende conforme req_saldo_insuficiente_modo e valida cardex origem=requisicao.',
  },
  'SCR-EST-RPC-01': {
    id: 'SCR-EST-RPC-01',
    area: 'Estoque / Relatórios RPC',
    expectativa: 'est_rpc_relatorio pagina com total_count estável e isola o tenant.',
    passos:
      'Chama slugs com limit/offset 50, confere total_count entre páginas e nega dados de outro empresa_id.',
  },
  'SCR-EST-RBAC-01': {
    id: 'SCR-EST-RBAC-01',
    area: 'Estoque / RBAC',
    expectativa: 'Usuário sem estoque_* não cria lote; com permissão consegue.',
    passos:
      'Cria usuário/grupo efêmeros, tenta operação sem perm (bloqueio) e com perm (sucesso); cleanup.',
  },
  'SCR-EST-CAR-01': {
    id: 'SCR-EST-CAR-01',
    area: 'Estoque / Cardex',
    expectativa:
      'Busca Cardex por código SKU com hífen usa plano sku_ids (índice) e completa sob orçamento; rejeita OR(ilike+id).',
    passos:
      'Cria SKU DEST-* + movimento; planCardexTextSearch → sku_ids; query autenticada com embeds < 8s; cleanup.',
  },
  'SCR-EST-LOTE-01': {
    id: 'SCR-EST-LOTE-01',
    area: 'Estoque / Lote produto',
    expectativa:
      'SKU controla_lote: entrada exige lote; saldo no grão sku×local×lote; SKU sem flag permanece sem lote.',
    passos:
      'Cria SKU+lote; bloqueia entrada sem lote; sobe/baixa com p_lote_produto_id; confere SKU sem flag.',
  },
  'SCR-EST-LOTE-02': {
    id: 'SCR-EST-LOTE-02',
    area: 'Estoque / Lote FEFO + remessa',
    expectativa:
      'Dois lotes: saída no lote de validade mais próxima; remessa preserva lote_produto_id no poder.',
    passos: 'Entrada em 2 lotes; saída no lote cedo; remessa_saida com lote; confere poder.',
  },
  'SCR-EST-SERIE-01': {
    id: 'SCR-EST-SERIE-01',
    area: 'Estoque / Série unitária',
    expectativa:
      'Placeholder até controla_serie no kernel; skip se coluna ausente.',
    passos: 'Probe cad_skus.controla_serie; skip ou implementa grão série.',
  },
  'UI-EST-LOTE-01': {
    id: 'UI-EST-LOTE-01',
    area: 'Estoque / Lote UI consultas',
    expectativa: 'Config lote/FEFO, saldos com filtro validade e cardex/relatório de lotes carregam.',
    passos:
      'Abre configuração (aba Lote), saldos?validade=, cardex e relatório validade-lotes sem erro.',
  },
  'UI-EST-LOTE-02': {
    id: 'UI-EST-LOTE-02',
    area: 'Estoque / LotePicker',
    expectativa: 'Formulários de saída usam LotePicker quando SKU controla_lote.',
    passos: 'Smoke nas rotas novo de retirada/ajuste/transf/remessa (página carrega).',
  },
  'UI-EST-SERIE-01': {
    id: 'UI-EST-SERIE-01',
    area: 'Estoque / Série UI',
    expectativa: 'Reservado para controla_serie (fora do MVP lote).',
    passos: 'Skip até flag/UI de série unitária existir.',
  },
}

export function extractTestId(title: string): string | null {
  const m = title.match(/\[([A-Z]+-[A-Z0-9-]+)\]/)
  return m?.[1] ?? null
}

export function catalogEntry(idOrTitle: string): TestCatalogEntry | null {
  if (TEST_CATALOG[idOrTitle]) return TEST_CATALOG[idOrTitle]
  const id = extractTestId(idOrTitle)
  return id ? TEST_CATALOG[id] ?? null : null
}

export function humanExpectation(idOrTitle: string): string {
  const entry = catalogEntry(idOrTitle)
  if (!entry) return idOrTitle
  return `[${entry.id}] ${entry.expectativa}`
}

export function humanPassos(idOrTitle: string): string {
  const entry = catalogEntry(idOrTitle)
  if (!entry) return ''
  return entry.passos
}
