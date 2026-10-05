'use server'

import { createClient } from '@/utils/supabase/server'
import { getMyProfile } from '@/lib/auth/getMyProfile'
import { hasPermission } from '@/utils/permissions'
import { podeAprovarRequisicao } from '@/lib/estoque/aprovacao-requisicao'

export type EstoqueCockpitPendencia = {
  id: string
  numero: string
  status: string
  label: string
  created_at: string
  pessoa?: string | null
  href: string
}

export type EstoqueCockpitMetrics = {
  /** Cards: executado pelo usuário logado no dia */
  movimentosHoje: number
  atendimentosHoje: number
  remessasHoje: number
  aprovacoesHoje: number
  canApprove: boolean
  /** Listas: pendências que ele precisa tratar */
  filaPendencias: EstoqueCockpitPendencia[]
  filaPendenciasTitulo: string
  filaPendenciasHref: string
  remessasPendentes: EstoqueCockpitPendencia[]
}

const EMPTY: EstoqueCockpitMetrics = {
  movimentosHoje: 0,
  atendimentosHoje: 0,
  remessasHoje: 0,
  aprovacoesHoje: 0,
  canApprove: false,
  filaPendencias: [],
  filaPendenciasTitulo: 'Fila de atendimento',
  filaPendenciasHref: '/cockpit/estoque/requisicoes',
  remessasPendentes: [],
}

function startOfTodayIso(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

/**
 * Template `operador_estoque`:
 * - Cards = produção do user logado no dia
 * - Listas = pendências que ele precisa fazer (fila compartilhada de almox + remessas abertas)
 */
export async function getEstoqueCockpitMetrics(): Promise<{
  data?: EstoqueCockpitMetrics
  error?: string
}> {
  const me = await getMyProfile()
  if (!me?.id) return { error: 'Não autenticado' }

  const userId = me.id as string
  const empresaId = me.empresa_id as string | null
  if (!empresaId && me.role_global !== 'superadmin') {
    return { data: EMPTY }
  }

  const canView =
    me.role_global === 'superadmin' ||
    hasPermission(me, 'estoque_requisicoes', 'view') ||
    hasPermission(me, 'estoque_atendimento', 'create') ||
    hasPermission(me, 'estoque_remessas', 'view') ||
    hasPermission(me, 'estoque', 'view')

  if (!canView) return { data: EMPTY }

  const supabase = await createClient()

  const { data: config } = await supabase
    .from('est_config')
    .select('req_aprovacao_ativa, req_aprovador_usuario_id, req_aprovacao_valor_minimo')
    .eq('empresa_id', empresaId ?? '')
    .maybeSingle()

  const canApprove = podeAprovarRequisicao(me, config)
  const todayIso = startOfTodayIso()

  // —— Cards: executado por mim hoje ——
  let movHojeQ = supabase
    .from('est_movimentos')
    .select('id', { count: 'exact', head: true })
    .eq('usuario_id', userId)
    .gte('movimento_em', todayIso)

  let atendHojeQ = supabase
    .from('est_movimentos')
    .select('id', { count: 'exact', head: true })
    .eq('usuario_id', userId)
    .gte('movimento_em', todayIso)
    .not('requisicao_id', 'is', null)

  let remessaHojeQ = supabase
    .from('est_movimentos')
    .select('id', { count: 'exact', head: true })
    .eq('usuario_id', userId)
    .gte('movimento_em', todayIso)
    .in('tipo', [
      'remessa_saida',
      'remessa_retorno',
      'remessa_baixa',
      'remessa_entrada_terceiros',
      'remessa_saida_terceiros',
    ])

  let aprovHojeQ = supabase
    .from('est_requisicoes')
    .select('id', { count: 'exact', head: true })
    .eq('aprovador_usuario_id', userId)
    .gte('aprovado_em', todayIso)

  if (empresaId) {
    movHojeQ = movHojeQ.eq('empresa_id', empresaId)
    atendHojeQ = atendHojeQ.eq('empresa_id', empresaId)
    remessaHojeQ = remessaHojeQ.eq('empresa_id', empresaId)
    aprovHojeQ = aprovHojeQ.eq('empresa_id', empresaId)
  }

  // —— Lista 1: pendências de req (o que o operador precisa fazer) ——
  // Aprovador: fila de aprovação; demais: fila de atendimento (pool do almox).
  const filaStatus = canApprove
    ? (['pendente_aprovacao'] as const)
    : (['aprovada', 'atendida_parcial'] as const)

  let filaQ = supabase
    .from('est_requisicoes')
    .select(
      `
      id,
      numero,
      status,
      created_at,
      crm_leads!est_requisicoes_requisitante_pessoa_id_fkey (nome)
    `,
    )
    .in('status', [...filaStatus])
    .order('created_at', { ascending: true })
    .limit(5)

  // —— Lista 2: remessas abertas/parciais (retorno/baixa pendente) ——
  let remessasQ = supabase
    .from('est_remessa_lotes')
    .select(
      `
      id,
      numero,
      status,
      created_at,
      crm_leads (nome)
    `,
    )
    .in('status', ['aberta', 'parcial'])
    .order('created_at', { ascending: true })
    .limit(5)

  if (empresaId) {
    filaQ = filaQ.eq('empresa_id', empresaId)
    remessasQ = remessasQ.eq('empresa_id', empresaId)
  }

  const [movRes, atendRes, remessaRes, aprovRes, filaRes, remessasPendRes] =
    await Promise.all([
      movHojeQ,
      atendHojeQ,
      remessaHojeQ,
      aprovHojeQ,
      filaQ,
      remessasQ,
    ])

  const filaPendencias: EstoqueCockpitPendencia[] = (filaRes.data || []).map((row) => {
    const lead = row.crm_leads as { nome?: string } | null
    const status = String(row.status)
    return {
      id: row.id as string,
      numero: String(row.numero || ''),
      status,
      label:
        status === 'pendente_aprovacao'
          ? 'Aprovar'
          : status === 'atendida_parcial'
            ? 'Atender (parcial)'
            : 'Atender',
      created_at: String(row.created_at),
      pessoa: lead?.nome ?? null,
      href: `/cockpit/estoque/requisicoes/${row.id}`,
    }
  })

  const remessasPendentes: EstoqueCockpitPendencia[] = (remessasPendRes.data || []).map(
    (row) => {
      const lead = row.crm_leads as { nome?: string } | null
      const status = String(row.status)
      return {
        id: row.id as string,
        numero: String(row.numero || ''),
        status,
        label: status === 'parcial' ? 'Retorno / baixa parcial' : 'Retorno / baixa',
        created_at: String(row.created_at),
        pessoa: lead?.nome ?? null,
        href: `/cockpit/estoque/remessas/${row.id}`,
      }
    },
  )

  return {
    data: {
      movimentosHoje: movRes.count ?? 0,
      atendimentosHoje: atendRes.count ?? 0,
      remessasHoje: remessaRes.count ?? 0,
      aprovacoesHoje: aprovRes.count ?? 0,
      canApprove,
      filaPendencias,
      filaPendenciasTitulo: canApprove ? 'Fila de aprovação' : 'Fila de atendimento',
      filaPendenciasHref: canApprove
        ? '/cockpit/estoque/requisicoes/aprovacao'
        : '/cockpit/estoque/requisicoes',
      remessasPendentes,
    },
  }
}
