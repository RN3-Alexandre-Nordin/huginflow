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
