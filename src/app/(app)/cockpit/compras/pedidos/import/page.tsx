import Link from 'next/link'
import { Lock } from 'lucide-react'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import BackTextButton from '@/components/BackTextButton'
import { empresaHasAddon } from '@/lib/addons/entitlements'
import { hasPermission } from '@/utils/permissions'
import ImportPedidosForm from './ImportPedidosForm'

export const metadata = { title: 'Importar pedidos | HuginFlow' }

export default async function ImportPedidosPage() {
  const me = await getMyProfile()
  const isSuper = me?.role_global === 'superadmin'
  const permitido =
    !!me &&
    (isSuper ||
      (me.empresa_id &&
        (await empresaHasAddon(me.empresa_id, 'compras')) &&
        hasPermission(me, 'compras_pedidos', 'create')))

  if (!permitido) {
    return (
      <div className="flex flex-col items-center py-20 text-center">
        <Lock className="mb-4 h-10 w-10 text-red-500" />
        <h2 className="text-2xl font-semibold text-white">Acesso interditado</h2>
        <BackTextButton className="mt-6 text-sm text-[#2BAADF]">Voltar</BackTextButton>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Importar pedidos</h1>
          <p className="text-sm text-gray-500">A aprovação segue a configuração de compras.</p>
        </div>
        <Link href="/cockpit/compras/pedidos" className="text-sm text-[#2BAADF]">
          Voltar
        </Link>
      </div>
      <ImportPedidosForm />
    </div>
  )
}
