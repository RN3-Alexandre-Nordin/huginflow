import Link from 'next/link'
import { Lock } from 'lucide-react'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import BackTextButton from '@/components/BackTextButton'
import { TIPO_COMPRA_LABEL, type TipoCompra } from '@/lib/compras/tipos'
import { empresaHasAddon } from '@/lib/addons/entitlements'
import { hasPermission } from '@/utils/permissions'
import { createClient } from '@/utils/supabase/server'
import NovaCotacaoForm from './NovaCotacaoForm'

export const metadata = { title: 'Nova cotação | HuginFlow' }

export default async function NovaCotacaoPage() {
  const me = await getMyProfile()
  const isSuper = me?.role_global === 'superadmin'
  const permitido =
    !!me &&
    (isSuper ||
      (me.empresa_id &&
        (await empresaHasAddon(me.empresa_id, 'compras')) &&
        hasPermission(me, 'compras_cotacoes', 'create')))

  if (!permitido || !me?.empresa_id) {
    return (
      <div className="flex flex-col items-center py-20 text-center">
        <Lock className="mb-4 h-10 w-10 text-red-500" />
        <h2 className="text-2xl font-semibold text-white">Acesso interditado</h2>
        <BackTextButton className="mt-6 text-sm text-[#2BAADF]">Voltar</BackTextButton>
      </div>
    )
  }

  const supabase = await createClient()
  const [{ data: sols }, { data: cotsAbertas }] = await Promise.all([
    supabase
      .from('com_solicitacoes')
      .select(
        'id, numero, tipo, solicitante_pessoa_id, solicitante:crm_leads!solicitante_pessoa_id(id, nome)',
      )
      .eq('empresa_id', me.empresa_id)
      .eq('status', 'registrada')
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('com_cotacoes')
      .select('id, numero, solicitacao_id')
      .eq('empresa_id', me.empresa_id)
      .in('status', ['rascunho', 'em_cotacao']),
  ])

  const cotPorSol = new Map<string, { id: string; numero: string }>()
  for (const c of cotsAbertas || []) {
    if (c.solicitacao_id) {
      cotPorSol.set(c.solicitacao_id, { id: c.id, numero: c.numero })
    }
  }

  const disponiveis = (sols || []).map((s) => {
    const raw = s.solicitante as
      | { id?: string; nome?: string }
      | { id?: string; nome?: string }[]
      | null
    const sol = Array.isArray(raw) ? raw[0] : raw
    const cotAberta = cotPorSol.get(s.id)
    return {
      id: s.id,
      numero: s.numero,
      tipoLabel: TIPO_COMPRA_LABEL[s.tipo as TipoCompra],
      solicitanteId: sol?.id || s.solicitante_pessoa_id || '',
      solicitanteNome: sol?.nome?.trim() || 'Sem solicitante',
      cotacaoAbertaId: cotAberta?.id || null,
      cotacaoAbertaNumero: cotAberta?.numero || null,
    }
  })

  const solicitantesMap = new Map<string, string>()
  for (const s of disponiveis) {
    if (s.solicitanteId) solicitantesMap.set(s.solicitanteId, s.solicitanteNome)
  }
  const solicitantes = [...solicitantesMap.entries()]
    .map(([id, nome]) => ({ id, nome }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Nova cotação</h1>
          <p className="text-sm text-gray-500">
            Solicitações em aberto. Se já houver cotação, você continua a mesma.
          </p>
        </div>
        <Link href="/cockpit/compras/cotacoes" className="text-sm text-[#2BAADF]">
          Voltar
        </Link>
      </div>
      <NovaCotacaoForm solicitacoes={disponiveis} solicitantes={solicitantes} />
    </div>
  )
}
