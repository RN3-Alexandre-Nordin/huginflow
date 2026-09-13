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
    .select('id, codigo, nome, unidade_estoque')
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
    .order('eh_principal', { ascending: false })
    .order('codigo')

  if (!isSuperAdmin) {
    locaisQuery = locaisQuery.eq('empresa_id', empresaId)
  }
  const { data: locais } = await locaisQuery

  // Saldos materializados para label "disp. no local" (SKU × local) — sem recalcular cardex
  let saldosQuery = supabase
    .from('est_saldos')
    .select('sku_id, local_id, quantidade')
    .gt('quantidade', 0)

  if (!isSuperAdmin) {
    saldosQuery = saldosQuery.eq('empresa_id', empresaId)
  } else if (empresaId) {
    saldosQuery = saldosQuery.eq('empresa_id', empresaId)
  }
  const { data: saldos } = await saldosQuery.limit(5000)

  const defaultLocal = locais?.find((l) => l.eh_principal || l.codigo === 'BRANCO') || locais?.[0]

  return (
    <div className="space-y-4 pb-20 font-sans">
      <EstoqueAreaNav />

      <RemessaForm
        pessoas={pessoas}
        skus={skus || []}
        locais={locais || []}
        saldos={(saldos || []).map((s) => ({
          sku_id: s.sku_id as string,
          local_id: s.local_id as string,
          quantidade: Number(s.quantidade) || 0,
        }))}
        defaultLocalId={defaultLocal?.id}
      />
    </div>
  )
}
