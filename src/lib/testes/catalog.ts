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
  'UI-CHAT-01': {
    id: 'UI-CHAT-01',
    area: 'Chat interno',
    expectativa: 'O botão flutuante abre o painel Conversas da equipe.',
    passos: 'No Cockpit, clica no botão flutuante de chat e verifica o painel Conversas aberto.',
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
