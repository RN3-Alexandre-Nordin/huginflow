import Link from 'next/link'
import { Lock, BarChart3 } from 'lucide-react'
import BackTextButton from '@/components/BackTextButton'
import EstoqueAreaNav from '@/components/estoque/EstoqueAreaNav'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { hasPermission } from '@/utils/permissions'
import { ESTOQUE_REPORTS } from '@/lib/estoque/relatorios/catalog'

export const metadata = { title: 'Relatórios de Estoque | HuginFlow' }

export default async function EstoqueRelatoriosPage() {
  const me = await getMyProfile()
  const canView =
    me?.role_global === 'superadmin' ||
    me?.role_global === 'admin' ||
    hasPermission(me, 'estoque_relatorios', 'view') ||
    hasPermission(me, 'estoque', 'view')

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Lock className="mb-4 h-10 w-10 text-red-500" />
        <h2 className="mb-2 text-2xl font-semibold text-white">Acesso Interditado</h2>
        <p className="mb-8 max-w-md text-gray-400">
          Seu grupo não possui permissão para relatórios de estoque.
        </p>
        <BackTextButton className="text-[#2BAADF]">Voltar</BackTextButton>
      </div>
    )
  }

  const wave1 = ESTOQUE_REPORTS.filter((r) => r.wave === 1)
  const wave2 = ESTOQUE_REPORTS.filter((r) => r.wave === 2)

  return (
    <div className="space-y-8 pb-20">
      <EstoqueAreaNav />
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-white">
          <BarChart3 className="h-5 w-5 text-[#2BAADF]" />
          Relatórios de Estoque
        </h1>
        <p className="mt-0.5 text-xs text-gray-400">
          KPIs operacionais e de capital. Tabelas exportáveis em Excel e PDF.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-xs font-black uppercase tracking-widest text-gray-500">
          Principais (Wave 1)
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {wave1.map((r) => {
            const Icon = r.icon
            return (
              <Link
                key={r.slug}
                href={`/cockpit/estoque/relatorios/${r.slug}`}
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
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-black uppercase tracking-widest text-gray-500">
          Complementares (Wave 2)
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {wave2.map((r) => {
            const Icon = r.icon
            return (
              <Link
                key={r.slug}
                href={`/cockpit/estoque/relatorios/${r.slug}`}
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
      </section>
    </div>
  )
}
