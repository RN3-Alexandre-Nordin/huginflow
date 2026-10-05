import Link from 'next/link'
import { Lock } from 'lucide-react'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import BackTextButton from '@/components/BackTextButton'
import { empresaHasAddon } from '@/lib/addons/entitlements'
import { hasPermission } from '@/utils/permissions'
import { createClient } from '@/utils/supabase/server'
import ImportadosBusca from './ImportadosBusca'

export const metadata = { title: 'Recebimento de importados | HuginFlow' }

export default async function ImportadosPage() {
  const me = await getMyProfile()
  const isSuper = me?.role_global === 'superadmin'
  const permitido =
    !!me &&
    (isSuper ||
      (me.empresa_id &&
        (await empresaHasAddon(me.empresa_id, 'compras')) &&
        (hasPermission(me, 'compras_conferencia', 'view') ||
          hasPermission(me, 'compras_conferencia', 'create') ||
          hasPermission(me, 'compras_conferencia', 'edit') ||
          hasPermission(me, 'compras_pedidos', 'view'))))
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
  const { data: config } = await supabase
    .from('com_config')
    .select('recebimento_importados')
    .eq('empresa_id', me!.empresa_id)
    .maybeSingle()
  if (!config?.recebimento_importados) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-300">
          O recebimento de importados está desligado. Ligue em Compras, Configuração, aba
          Recebimento.
        </p>
        <Link href="/cockpit/compras" className="text-sm text-[#2BAADF]">
          Voltar a Compras
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div>
        <p className="text-xs uppercase tracking-widest text-gray-500">Importados</p>
        <h1 className="text-xl font-semibold text-white">Ler a caixa</h1>
        <p className="text-sm text-gray-500">
          Use o código do fornecedor impresso na caixa. Espaços no início e no fim são ignorados.
        </p>
      </div>
      <ImportadosBusca />
    </div>
  )
}
