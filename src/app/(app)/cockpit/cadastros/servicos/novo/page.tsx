import { Lock } from 'lucide-react'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import BackTextButton from '@/components/BackTextButton'
import { empresaHasAddon } from '@/lib/addons/entitlements'
import { gerarCodigoServico } from '@/lib/servicos/numeros'
import { hasPermission } from '@/utils/permissions'
import { createClient } from '@/utils/supabase/server'
import { createServico } from '../actions'
import ServicoForm from '../ServicoForm'

export const metadata = { title: 'Novo serviço | HuginFlow' }

export default async function NovoServicoPage() {
  const me = await getMyProfile()
  const isSuper = me?.role_global === 'superadmin'
  const permitido =
    !!me &&
    (isSuper ||
      (!!me.empresa_id &&
        (await empresaHasAddon(me.empresa_id, 'compras')) &&
        hasPermission(me, 'servicos', 'create')))

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
  const codigo = await gerarCodigoServico(me.empresa_id, supabase)

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-white">Novo serviço</h1>
        <p className="text-sm text-gray-500">
          Código <span className="font-mono text-[#2BAADF]">{codigo}</span> reservado. Catálogo
          mestre (compras hoje; vendas no futuro).
        </p>
      </div>
      <ServicoForm
        mode="create"
        codigo={codigo}
        cancelHref="/cockpit/cadastros/servicos"
        submitLabel="Cadastrar serviço"
        action={createServico}
      />
    </div>
  )
}
