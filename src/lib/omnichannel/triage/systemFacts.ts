import type { SupabaseClient } from '@supabase/supabase-js'
import { isWithinBusinessHours } from './businessHours'

export type AptUserFact = {
  id: string
  nome: string
  departamento_ids: string[]
  pipeline_ids: string[]
  pendentes: number
}

export type DepartamentoFact = {
  id: string
  nome: string
}

export type FunilFact = {
  id: string
  nome: string
  departamento_id: string | null
  estagio_inicial_id: string | null
  estagio_inicial_nome: string | null
}

export type SystemFacts = {
  agora_iso: string
  dentro_horario: boolean
  time_zone: string
  card_aberto: boolean
  card_id: string | null
  card_pipeline_id: string | null
  card_responsavel_id: string | null
  departamentos: DepartamentoFact[]
  funis: FunilFact[]
  usuarios_aptos: AptUserFact[]
  texto: string
}

function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

async function loadPendingCounts(
  supabase: SupabaseClient,
  empresaId: string,
  userIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  if (userIds.length === 0) return counts

  const { data } = await supabase
    .from('crm_cards')
    .select('responsavel_id')
    .eq('empresa_id', empresaId)
    .eq('finalizado', false)
    .in('responsavel_id', userIds)

  for (const row of data ?? []) {
    const id = row.responsavel_id as string | null
    if (!id) continue
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  return counts
}

/**
 * Fatos canônicos injetados no prompt: horário, card aberto, departamentos, funis e usuários aptos.
 * Usuários aptos = ativos no grupo com acesso ao funil (pipeline_grupo_acesso), preferindo grupos não-admin.
 */
export async function buildSystemFacts(
  supabase: SupabaseClient,
  empresaId: string,
  leadId: string,
): Promise<SystemFacts> {
  const hours = isWithinBusinessHours()

  const [{ data: departamentos }, { data: pipelines }, { data: openCard }] = await Promise.all([
    supabase.from('departamentos').select('id, nome').eq('empresa_id', empresaId).order('nome'),
    supabase
      .from('pipelines')
      .select('id, nome, departamento_id, pipeline_stages(id, nome, ordem)')
      .eq('empresa_id', empresaId)
      .order('nome'),
    supabase
      .from('crm_cards')
      .select('id, pipeline_id, responsavel_id, finalizado')
      .eq('empresa_id', empresaId)
      .eq('lead_id', leadId)
      .eq('finalizado', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const funis: FunilFact[] = (pipelines ?? []).map((p) => {
    const stages = (p.pipeline_stages as { id: string; nome: string; ordem: number | null }[] | null) ?? []
    const sorted = [...stages].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
    const first = sorted[0] ?? null
    return {
      id: p.id,
      nome: p.nome,
      departamento_id: p.departamento_id,
      estagio_inicial_id: first?.id ?? null,
      estagio_inicial_nome: first?.nome ?? null,
    }
  })

  const pipelineIds = funis.map((f) => f.id)
  const { data: accessRows } =
    pipelineIds.length > 0
      ? await supabase
          .from('pipeline_grupo_acesso')
          .select('pipeline_id, grupo_id, grupos_acesso(id, nome, is_admin)')
          .in('pipeline_id', pipelineIds)
      : { data: [] as { pipeline_id: string; grupo_id: string; grupos_acesso: unknown }[] }

  const grupoToPipelines = new Map<string, { pipelineIds: Set<string>; isAdmin: boolean }>()
  for (const row of accessRows ?? []) {
    const grupo = row.grupos_acesso as { id: string; nome: string; is_admin?: boolean } | null
    if (!grupo?.id) continue
    const entry = grupoToPipelines.get(grupo.id) ?? {
      pipelineIds: new Set<string>(),
      isAdmin: Boolean(grupo.is_admin),
    }
    entry.pipelineIds.add(row.pipeline_id)
    entry.isAdmin = entry.isAdmin || Boolean(grupo.is_admin)
    grupoToPipelines.set(grupo.id, entry)
  }

  const grupoIds = [...grupoToPipelines.keys()]
  const { data: usuarios } =
    grupoIds.length > 0
      ? await supabase
          .from('usuarios')
          .select('id, nome_completo, grupo_id, ativo')
          .eq('empresa_id', empresaId)
          .eq('ativo', true)
          .in('grupo_id', grupoIds)
      : { data: [] as { id: string; nome_completo: string | null; grupo_id: string | null; ativo: boolean }[] }

  const pipelineToDept = new Map(funis.map((f) => [f.id, f.departamento_id]))

  // Prefer usuários de grupos não-admin quando o funil tiver ambos
  const nonAdminGrupoIds = new Set(
    [...grupoToPipelines.entries()].filter(([, v]) => !v.isAdmin).map(([id]) => id),
  )

  const candidates = (usuarios ?? []).filter((u) => {
    if (!u.grupo_id) return false
    if (nonAdminGrupoIds.size === 0) return true
    const info = grupoToPipelines.get(u.grupo_id)
    if (!info) return false
    // Se o grupo é admin mas existe grupo operacional no mesmo pipeline, exclui admin do pool de distribuição
    if (info.isAdmin) {
      const sharesWithOps = [...info.pipelineIds].some((pid) =>
        [...grupoToPipelines.entries()].some(
          ([gid, other]) => gid !== u.grupo_id && !other.isAdmin && other.pipelineIds.has(pid),
        ),
      )
      if (sharesWithOps) return false
    }
    return true
  })

  const pending = await loadPendingCounts(
    supabase,
    empresaId,
    candidates.map((u) => u.id),
  )

  const usuariosAptos: AptUserFact[] = candidates.map((u) => {
    const info = grupoToPipelines.get(u.grupo_id!)!
    const pids = [...info.pipelineIds]
    const deptIds = [
      ...new Set(pids.map((pid) => pipelineToDept.get(pid)).filter(Boolean) as string[]),
    ]
    return {
      id: u.id,
      nome: u.nome_completo || 'Usuário',
      departamento_ids: deptIds,
      pipeline_ids: pids,
      pendentes: pending.get(u.id) ?? 0,
    }
  })

  const cardAberto = Boolean(openCard?.id)
  const facts: SystemFacts = {
    agora_iso: hours.agoraIsoLocal,
    dentro_horario: hours.dentroHorario,
    time_zone: hours.timeZone,
    card_aberto: cardAberto,
    card_id: openCard?.id ?? null,
    card_pipeline_id: openCard?.pipeline_id ?? null,
    card_responsavel_id: openCard?.responsavel_id ?? null,
    departamentos: (departamentos ?? []).map((d) => ({ id: d.id, nome: d.nome })),
    funis,
    usuarios_aptos: usuariosAptos,
    texto: '',
  }

  facts.texto = formatFactsForPrompt(facts)
  return facts
}

export function formatFactsForPrompt(facts: SystemFacts): string {
  const deps = facts.departamentos
    .map((d) => `- id=${d.id} nome=${d.nome}`)
    .join('\n')
  const funis = facts.funis
    .map(
      (f) =>
        `- id=${f.id} nome=${f.nome} departamento_id=${f.departamento_id ?? ''} estagio_inicial_id=${f.estagio_inicial_id ?? ''} estagio=${f.estagio_inicial_nome ?? ''}`,
    )
    .join('\n')
  const users = facts.usuarios_aptos
    .map(
      (u) =>
        `- id=${u.id} nome=${u.nome} departamento_ids=${u.departamento_ids.join('|')} pipeline_ids=${u.pipeline_ids.join('|')} pendentes=${u.pendentes}`,
    )
    .join('\n')

  return [
    `agora_iso=${facts.agora_iso}`,
    `dentro_horario=${facts.dentro_horario}`,
    `time_zone=${facts.time_zone}`,
    `card_aberto=${facts.card_aberto}`,
    `card_id=${facts.card_id ?? ''}`,
    `card_pipeline_id=${facts.card_pipeline_id ?? ''}`,
    `card_responsavel_id=${facts.card_responsavel_id ?? ''}`,
    '',
    'departamentos:',
    deps || '(nenhum)',
    '',
    'funis:',
    funis || '(nenhum)',
    '',
    'usuarios_aptos (NÃO escolha o usuário final — o sistema aplica rodízio/carga):',
    users || '(nenhum)',
  ].join('\n')
}

export function resolveFunilFromTriage(
  facts: SystemFacts,
  triage: { funil_id?: string; funil_nome?: string; departamento_id?: string; departamento_nome?: string },
): FunilFact | null {
  if (triage.funil_id) {
    const byId = facts.funis.find((f) => f.id === triage.funil_id)
    if (byId) return byId
  }
  if (triage.funil_nome) {
    const target = normalizeName(triage.funil_nome)
    const byName = facts.funis.find((f) => normalizeName(f.nome) === target)
    if (byName) return byName
  }
  if (triage.departamento_id) {
    const byDept = facts.funis.find((f) => f.departamento_id === triage.departamento_id)
    if (byDept) return byDept
  }
  if (triage.departamento_nome) {
    const dept = facts.departamentos.find(
      (d) => normalizeName(d.nome) === normalizeName(triage.departamento_nome!),
    )
    if (dept) {
      const byDept = facts.funis.find((f) => f.departamento_id === dept.id)
      if (byDept) return byDept
    }
  }
  if (triage.departamento_id || triage.departamento_nome || triage.funil_id || triage.funil_nome) {
    return null
  }
  return facts.funis[0] ?? null
}

export function pickAssignee(
  facts: SystemFacts,
  pipelineId: string,
  departamentoId?: string | null,
): AptUserFact | null {
  let pool = facts.usuarios_aptos.filter((u) => u.pipeline_ids.includes(pipelineId))
  if (departamentoId) {
    const narrowed = pool.filter((u) => u.departamento_ids.includes(departamentoId))
    if (narrowed.length > 0) pool = narrowed
  }
  if (pool.length === 0) return null

  pool.sort((a, b) => {
    if (a.pendentes !== b.pendentes) return a.pendentes - b.pendentes
    return a.nome.localeCompare(b.nome, 'pt-BR')
  })
  return pool[0] ?? null
}
