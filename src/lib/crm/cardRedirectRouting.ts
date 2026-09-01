import type { SupabaseClient } from '@supabase/supabase-js'
import {
  buildSystemFacts,
  pickAssignee,
  resolveFunilFromTriage,
  type SystemFacts,
} from '@/lib/omnichannel/triage/systemFacts'

export type RedirectStage = { id: string; nome: string; ordem?: number | null }

export type RedirectDestination = {
  responsavel_id: string | null
  responsavel_nome: string | null
  pipeline_id: string | null
  pipeline_nome: string | null
  stage_id: string | null
  stage_nome: string | null
  departamento_id: string | null
  departamento_nome: string | null
  pendentes: number | null
  auto_reason: string
  pipeline_stages?: RedirectStage[]
}

export async function buildRedirectFacts(
  supabase: SupabaseClient,
  empresaId: string,
  leadId?: string | null,
): Promise<SystemFacts> {
  return buildSystemFacts(supabase, empresaId, leadId || '00000000-0000-0000-0000-000000000000')
}

/** Funil + estágio inicial conforme departamento(s) do operador (mesma lógica da triagem IA). */
export function resolveDestinationForUser(
  facts: SystemFacts,
  userId: string,
): RedirectDestination | null {
  const user = facts.usuarios_aptos.find((u) => u.id === userId)
  if (!user) return null

  let funil = null as ReturnType<typeof resolveFunilFromTriage>
  for (const pid of user.pipeline_ids) {
    const candidate = facts.funis.find((f) => f.id === pid)
    if (
      candidate &&
      candidate.departamento_id &&
      user.departamento_ids.includes(candidate.departamento_id)
    ) {
      funil = candidate
      break
    }
  }

  if (!funil && user.departamento_ids[0]) {
    funil = resolveFunilFromTriage(facts, { departamento_id: user.departamento_ids[0] })
  }

  if (!funil && user.pipeline_ids[0]) {
    funil = facts.funis.find((f) => f.id === user.pipeline_ids[0]) ?? null
  }

  const deptId = funil?.departamento_id ?? user.departamento_ids[0] ?? null
  const dept = facts.departamentos.find((d) => d.id === deptId)

  return {
    responsavel_id: user.id,
    responsavel_nome: user.nome,
    pipeline_id: funil?.id ?? null,
    pipeline_nome: funil?.nome ?? null,
    stage_id: funil?.estagio_inicial_id ?? null,
    stage_nome: funil?.estagio_inicial_nome ?? null,
    departamento_id: deptId,
    departamento_nome: dept?.nome ?? null,
    pendentes: user.pendentes,
    auto_reason: funil
      ? `Funil "${funil.nome}" e estágio "${funil.estagio_inicial_nome ?? 'inicial'}" conforme departamento do operador.`
      : 'Operador selecionado; defina funil manualmente se necessário.',
  }
}

export function resolveFunilForDepartamento(
  facts: SystemFacts,
  departamentoId: string,
): ReturnType<typeof resolveFunilFromTriage> {
  const matches = facts.funis.filter((f) => f.departamento_id === departamentoId)
  if (matches.length === 1) return matches[0]

  const dept = facts.departamentos.find((d) => d.id === departamentoId)

  if (matches.length > 1 && dept) {
    const deptNorm = normalizeDeptName(dept.nome)
    const byName = matches.find((f) => funilMatchesDeptName(f.nome, deptNorm))
    if (byName) return byName
    return matches.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))[0] ?? null
  }

  if (dept) {
    const deptNorm = normalizeDeptName(dept.nome)
    const byLinkedName = facts.funis.find(
      (f) => f.departamento_id === departamentoId || funilMatchesDeptName(f.nome, deptNorm),
    )
    if (byLinkedName) return byLinkedName
  }

  if (matches.length === 0) {
    const fromTriage = resolveFunilFromTriage(facts, { departamento_id: departamentoId })
    if (fromTriage) return fromTriage
    if (dept) {
      const deptNorm = normalizeDeptName(dept.nome)
      return facts.funis.find((f) => funilMatchesDeptName(f.nome, deptNorm)) ?? null
    }
  }

  return null
}

function normalizeDeptName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function funilMatchesDeptName(funilNome: string, deptNorm: string): boolean {
  const fn = normalizeDeptName(funilNome)
  const deptToken = deptNorm.split('/')[0] ?? deptNorm
  return (
    fn === deptNorm ||
    fn.includes(deptToken) ||
    deptNorm.includes(fn) ||
    (deptToken.includes('exped') && fn.includes('exped')) ||
    (deptToken.includes('comerc') && (fn.includes('atend') || fn.includes('comerc'))) ||
    (deptToken.includes('financ') && fn.includes('financ'))
  )
}

/** Operadores aptos somente no funil + departamento escolhidos. */
export function pickAssigneeStrict(
  facts: SystemFacts,
  pipelineId: string,
  departamentoId: string,
) {
  const pool = facts.usuarios_aptos.filter(
    (u) =>
      u.pipeline_ids.includes(pipelineId) && u.departamento_ids.includes(departamentoId),
  )
  if (pool.length === 0) return null

  pool.sort((a, b) => {
    if (a.pendentes !== b.pendentes) return a.pendentes - b.pendentes
    return a.nome.localeCompare(b.nome, 'pt-BR')
  })
  return pool[0] ?? null
}

/** Distribui para operador com menor carga no departamento. */
export function resolveAssigneeForDepartamento(
  facts: SystemFacts,
  departamentoId: string,
): RedirectDestination | null {
  const funil = resolveFunilForDepartamento(facts, departamentoId)
  if (!funil) {
    const dept = facts.departamentos.find((d) => d.id === departamentoId)
    return {
      responsavel_id: null,
      responsavel_nome: null,
      pipeline_id: null,
      pipeline_nome: null,
      stage_id: null,
      stage_nome: null,
      departamento_id: departamentoId,
      departamento_nome: dept?.nome ?? null,
      pendentes: null,
      auto_reason: `Nenhum funil vinculado ao departamento ${dept?.nome ?? ''}.`,
    }
  }

  const assignee =
    pickAssigneeStrict(facts, funil.id, departamentoId) ??
    pickAssignee(facts, funil.id, departamentoId)
  const dept = facts.departamentos.find((d) => d.id === departamentoId)

  return {
    responsavel_id: assignee?.id ?? null,
    responsavel_nome: assignee?.nome ?? null,
    pipeline_id: funil.id,
    pipeline_nome: funil.nome,
    stage_id: funil.estagio_inicial_id,
    stage_nome: funil.estagio_inicial_nome,
    departamento_id: departamentoId,
    departamento_nome: dept?.nome ?? null,
    pendentes: assignee?.pendentes ?? null,
    auto_reason: assignee
      ? `${assignee.nome} (${assignee.pendentes} card(s) aberto(s)) — menor carga em ${dept?.nome ?? 'departamento'}, funil ${funil.nome}.`
      : `Departamento ${dept?.nome ?? ''}: funil "${funil.nome}"; nenhum operador apto neste departamento/funil.`,
  }
}

/** Heurística do mapa NASU para sugerir departamento a partir do conteúdo do card. */
export function inferDepartamentoFromCard(
  facts: SystemFacts,
  card: { titulo?: string | null; descricao?: string | null; observacao?: string | null },
): { departamento_id: string; departamento_nome: string } | null {
  const text = [card.titulo, card.descricao, card.observacao]
    .filter(Boolean)
    .join(' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

  if (!text.trim()) return null

  const rules: { keywords: string[]; deptMatch: string[] }[] = [
    {
      keywords: ['cobranca', 'boleto', 'pagamento', 'financeiro', 'nf', 'nota fiscal', 'pix', 'fatura'],
      deptMatch: ['financeiro'],
    },
    {
      keywords: ['expedicao', 'entrega', 'retirada', 'logistica', 'comprovante', 'os '],
      deptMatch: ['expedicao', 'expedição'],
    },
    {
      keywords: [
        'orcamento',
        'locacao',
        'aluguel',
        'betoneira',
        'comercial',
        'proposta',
        'venda',
        'cliente novo',
      ],
      deptMatch: ['comercial'],
    },
  ]

  for (const rule of rules) {
    if (!rule.keywords.some((k) => text.includes(k))) continue
    for (const match of rule.deptMatch) {
      const dept = facts.departamentos.find(
        (d) =>
          d.nome
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase() === match ||
          d.nome.toLowerCase().includes(match),
      )
      if (dept) return { departamento_id: dept.id, departamento_nome: dept.nome }
    }
  }

  return null
}

export function applyDestinationToState(dest: RedirectDestination | null) {
  if (!dest) return null
  return {
    responsavelId: dest.responsavel_id || '',
    targetPipelineId: dest.pipeline_id || '',
    targetStageId: dest.stage_id || '',
    autoReason: dest.auto_reason,
    responsavelNome: dest.responsavel_nome,
    pipelineNome: dest.pipeline_nome,
    stageNome: dest.stage_nome,
    pendentes: dest.pendentes,
  }
}
