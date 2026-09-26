import { Metadata } from 'next'
import { createClient } from '@/utils/supabase/server'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { TransferenciaForm } from './TransferenciaForm'

export const metadata: Metadata = {
  title: 'Nova Transferência de Estoque | HuginFlow',
}

export default async function NovaTransferenciaPage() {
  const me = await getMyProfile()
  const supabase = await createClient()
  const empresaId = me?.empresa_id || ''

  const [{ data: locais }, { data: config }] = await Promise.all([
    supabase
      .from('cad_locais_estoque')
      .select('id, codigo, nome, eh_principal')
      .eq('empresa_id', empresaId)
      .eq('ativo', true)
      .eq('eh_terceiros', false)
      .order('eh_principal', { ascending: false })
      .order('codigo'),
    supabase
      .from('est_config')
      .select('bloquear_lotes_vencidos')
      .eq('empresa_id', empresaId)
      .maybeSingle(),
  ])

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <TransferenciaForm
        empresaId={empresaId}
        locais={locais || []}
        bloquearVencidos={Boolean(config?.bloquear_lotes_vencidos)}
      />
    </div>
  )
}
