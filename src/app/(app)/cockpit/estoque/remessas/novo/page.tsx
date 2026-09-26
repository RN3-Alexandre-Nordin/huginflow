import { Truck, Lock } from 'lucide-react'
import BackTextButton from '@/components/BackTextButton'
import EstoqueAreaNav from '@/components/estoque/EstoqueAreaNav'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { hasPermission } from '@/utils/permissions'
import { createClient } from '@/utils/supabase/server'
import { loadPessoasEmpresa } from '@/lib/estoque/cadastros-helpers'
import RemessaForm from './RemessaForm'

export const metadata = { title: 'Nova Remessa para Terceiros | HuginFlow' }

export default async function NovaRemessaPage() {
  const me = await getMyProfile()
  const isSuperAdmin = me?.role_global === 'superadmin'

  const canCreate =
    isSuperAdmin ||
    hasPermission(me, 'estoque_remessas', 'create') ||
    hasPermission(me, 'estoque', 'edit')

  if (!canCreate) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in duration-700">
        <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mb-6 border border-red-500/20">
          <Lock className="w-10 h-10 text-red-500" />
        </div>
        <h2 className="text-3xl font-extrabold text-white mb-2 tracking-tight">Acesso Interditado</h2>
        <p className="text-gray-400 max-w-md mx-auto mb-8 text-lg">
          Seu grupo de acesso não possui permissão para criar remessas de estoque.
        </p>
        <BackTextButton className="px-6 py-3 bg-[#ffffff05] hover:bg-[#ffffff10] border border-[#ffffff10] rounded-xl text-white font-semibold transition-all">
          Voltar ao Início
        </BackTextButton>
      </div>
    )
  }

  const empresaId = me?.empresa_id ?? ''
  const supabase = await createClient()

  // Qualquer pessoa ativa do cadastro (cliente, fornecedor, etc.)
  const pessoas = await loadPessoasEmpresa(supabase, empresaId)

  let skusQuery = supabase
    .from('cad_skus')
    .select('id, codigo, nome, unidade_estoque, controla_lote')
    .eq('ativo', true)
    .eq('controla_estoque', true)
    .order('codigo')

  if (!isSuperAdmin) {
    skusQuery = skusQuery.eq('empresa_id', empresaId)
  }
  const { data: skus } = await skusQuery

  let locaisQuery = supabase
    .from('cad_locais_estoque')
    .select('id, codigo, nome, eh_principal')
    .eq('ativo', true)
    .eq('eh_terceiros', false)
    .order('eh_principal', { ascending: false })
    .order('codigo')

  if (!isSuperAdmin) {
    locaisQuery = locaisQuery.eq('empresa_id', empresaId)
  }
  const { data: locais } = await locaisQuery

  // Saldos materializados agregados SKU × local (soma lotes)
  let saldosQuery = supabase
    .from('est_saldos')
    .select('sku_id, local_id, quantidade')
    .gt('quantidade', 0)

  if (!isSuperAdmin) {
    saldosQuery = saldosQuery.eq('empresa_id', empresaId)
  } else if (empresaId) {
    saldosQuery = saldosQuery.eq('empresa_id', empresaId)
  }
  const { data: saldosRaw } = await saldosQuery.limit(5000)

  const saldosAgg = new Map<string, { sku_id: string; local_id: string; quantidade: number }>()
  for (const s of saldosRaw || []) {
    const key = `${s.sku_id}|${s.local_id}`
    const prev = saldosAgg.get(key)
    const q = Number(s.quantidade) || 0
    if (prev) prev.quantidade += q
    else
      saldosAgg.set(key, {
        sku_id: s.sku_id as string,
        local_id: s.local_id as string,
        quantidade: q,
      })
  }

  const { data: config } = await supabase
    .from('est_config')
    .select('bloquear_lotes_vencidos')
    .eq('empresa_id', empresaId)
    .maybeSingle()

  const defaultLocal = locais?.find((l) => l.eh_principal || l.codigo === 'BRANCO') || locais?.[0]

  return (
    <div className="space-y-4 pb-20 font-sans">
      <EstoqueAreaNav />

      <RemessaForm
        empresaId={empresaId}
        pessoas={pessoas}
        skus={skus || []}
        locais={locais || []}
        saldos={[...saldosAgg.values()]}
        defaultLocalId={defaultLocal?.id}
        bloquearVencidos={Boolean(config?.bloquear_lotes_vencidos)}
      />
    </div>
  )
}
