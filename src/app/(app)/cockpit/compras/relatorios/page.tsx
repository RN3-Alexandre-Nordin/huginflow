import Link from 'next/link'
import { BarChart3, Lock } from 'lucide-react'
import BackTextButton from '@/components/BackTextButton'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { hasPermission } from '@/utils/permissions'
import { COMPRAS_REPORTS } from '@/lib/compras/relatorios/catalog'

export const metadata = { title: 'Relatórios de Compras | HuginFlow' }

export default async function ComprasRelatoriosPage() {
  const me = await getMyProfile()
  const canView =
    me?.role_global === 'superadmin' ||
    me?.role_global === 'admin' ||
    hasPermission(me, 'compras_relatorios', 'view')

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Lock className="mb-4 h-10 w-10 text-red-500" />
        <h2 className="mb-2 text-2xl font-semibold text-white">Acesso interditado</h2>
        <p className="mb-8 max-w-md text-gray-400">
          Seu grupo não possui permissão para ver os relatórios de compras.
        </p>
        <BackTextButton className="text-[#2BAADF]">Voltar</BackTextButton>
      </div>
    )
  }

  return (
    <div className="space-y-8 pb-20">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-white">
          <BarChart3 className="h-5 w-5 text-[#2BAADF]" />
          Relatórios de Compras
        </h1>
        <p className="mt-0.5 text-xs text-gray-400">
          Só leitura. Cada lista tem no máximo 50 linhas por página.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {COMPRAS_REPORTS.map((r) => {
          const Icon = r.icon
          return (
            <Link
              key={r.slug}
              href={`/cockpit/compras/relatorios/${r.slug}`}
              className="group rounded-2xl border border-[#ffffff0a] bg-[#111111] p-5 transition hover:border-[#2BAADF]/30 hover:bg-[#141414]"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-base font-semibold text-white group-hover:text-[#2BAADF]">
                  {r.title}
                </h3>
                <Icon className="h-5 w-5 shrink-0 text-[#2BAADF]/80" />
              </div>
              <p className="mt-2 text-xs leading-relaxed text-gray-400">{r.description}</p>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
