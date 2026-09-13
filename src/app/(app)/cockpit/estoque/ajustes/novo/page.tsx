import { createClient } from '@/utils/supabase/server'
import { Lock } from 'lucide-react'
import BackTextButton from '@/components/BackTextButton'
import EstoqueAreaNav from '@/components/estoque/EstoqueAreaNav'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { hasPermission } from '@/utils/permissions'
import AjusteForm from './AjusteForm'

export const metadata = { title: 'Novo Ajuste de Estoque | HuginFlow' }

export default async function NovoAjustePage() {
  const me = await getMyProfile()
  const isSuperAdmin = me?.role_global === 'superadmin'

  const canCreate =
    isSuperAdmin ||
    hasPermission(me, 'estoque_ajustes', 'create') ||
    hasPermission(me, 'estoque', 'edit')

  if (!canCreate) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in duration-700">
        <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mb-6 border border-red-500/20">
          <Lock className="w-10 h-10 text-red-500" />
        </div>
        <h2 className="text-3xl font-extrabold text-white mb-2 tracking-tight">Acesso Interditado</h2>
        <p className="text-gray-400 max-w-md mx-auto mb-8 text-lg">
          Seu grupo de acesso não possui permissão para registrar ajustes de estoque.
        </p>
        <BackTextButton className="px-6 py-3 bg-[#ffffff05] hover:bg-[#ffffff10] border border-[#ffffff10] rounded-xl text-white font-semibold transition-all">
          Voltar ao Início
        </BackTextButton>
      </div>
    )
  }

  const empresaId = me?.empresa_id ?? ''
  const supabase = await createClient()

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

  const defaultLocal = locais?.find((l) => l.eh_principal || l.codigo === 'BRANCO') || locais?.[0]

  return (
    <div className="space-y-4 pb-20 font-sans">
      <EstoqueAreaNav />

      <AjusteForm
        skus={skus || []}
        locais={locais || []}
        defaultLocalId={defaultLocal?.id}
      />
    </div>
  )
}
