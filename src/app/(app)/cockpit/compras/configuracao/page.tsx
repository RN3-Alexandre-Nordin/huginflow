import { Lock } from 'lucide-react'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import BackTextButton from '@/components/BackTextButton'
import { empresaHasAddon } from '@/lib/addons/entitlements'
import { hasPermission } from '@/utils/permissions'
import { createClient } from '@/utils/supabase/server'
import ComprasConfigForm from './ComprasConfigForm'

export const metadata = { title: 'Configuração de Compras | HuginFlow' }

export default async function ComprasConfigPage() {
  const me = await getMyProfile()
  const isSuper = me?.role_global === 'superadmin'
  const permitido =
    !!me &&
    (isSuper ||
      (me.empresa_id &&
        (await empresaHasAddon(me.empresa_id, 'compras')) &&
        (hasPermission(me, 'compras_config', 'view') || hasPermission(me, 'compras', 'view'))))

  if (!permitido) {
    return (
      <div className="flex flex-col items-center py-20 text-center">
        <Lock className="mb-4 h-10 w-10 text-red-500" />
        <h2 className="text-2xl font-semibold text-white">Acesso interditado</h2>
        <BackTextButton className="mt-6 text-sm text-[#2BAADF]">Voltar</BackTextButton>
      </div>
    )
  }

  const supabase = await createClient()
  const [{ data: config }, { data: grupos }] = await Promise.all([
    supabase
      .from('com_config')
      .select(
        'aprovacao_ativa, nivel1_grupo_id, nivel1_teto, nivel2_grupo_id, nivel2_a_partir, recebimento_por_caixa, caixa_proximo',
      )
      .eq('empresa_id', me!.empresa_id)
      .maybeSingle(),
    supabase
      .from('grupos_acesso')
      .select('id, nome')
      .eq('empresa_id', me!.empresa_id)
      .order('nome'),
  ])

  const canEdit = isSuper || hasPermission(me, 'compras_config', 'edit')

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-white">Configuração</h1>
        <p className="text-sm text-gray-500">
          Alçada em dois valores. Recebimento por caixa fica na aba Recebimento e nasce desligado.
        </p>
      </div>
      {canEdit ? (
        <ComprasConfigForm grupos={grupos || []} config={config} />
      ) : (
        <p className="text-sm text-gray-400">Somente leitura. Sem permissão para editar.</p>
      )}
    </div>
  )
}
