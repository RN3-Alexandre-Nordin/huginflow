import { Lock } from 'lucide-react'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import BackTextButton from '@/components/BackTextButton'
import { empresaHasAddon } from '@/lib/addons/entitlements'
import { hasPermission } from '@/utils/permissions'
import { createClient } from '@/utils/supabase/server'
import { updateServico } from '../../actions'
import ServicoForm from '../../ServicoForm'

export const metadata = { title: 'Editar serviço | HuginFlow' }

export default async function EditarServicoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const me = await getMyProfile()
  const isSuper = me?.role_global === 'superadmin'
  const permitido =
    !!me &&
    (isSuper ||
      (!!me.empresa_id &&
        (await empresaHasAddon(me.empresa_id, 'compras')) &&
        hasPermission(me, 'servicos', 'edit')))

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
  const { data: servico } = await supabase
    .from('cad_servicos')
    .select('id, codigo, nome, unidade, preco_referencia, descricao, ativo')
    .eq('id', id)
    .eq('empresa_id', me.empresa_id)
    .maybeSingle()

  if (!servico) {
    return <p className="text-sm text-gray-400">Serviço não encontrado.</p>
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-white">Editar serviço</h1>
        <p className="text-sm text-gray-500 font-mono text-[#2BAADF]">{servico.codigo}</p>
      </div>
      <ServicoForm
        mode="edit"
        codigo={servico.codigo}
        servico={servico}
        cancelHref="/cockpit/cadastros/servicos"
        submitLabel="Salvar"
        action={updateServico.bind(null, id)}
      />
    </div>
  )
}
