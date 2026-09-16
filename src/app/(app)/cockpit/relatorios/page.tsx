import Link from 'next/link'
import { Lock, BarChart3 } from 'lucide-react'
import BackTextButton from '@/components/BackTextButton'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { hasPermission } from '@/utils/permissions'
import { BI_REPORTS } from '@/lib/relatorios/catalog'

export const metadata = { title: 'Relatórios | HuginFlow' }

export default async function RelatoriosHubPage() {
  const me = await getMyProfile()
  const canView =
    me?.role_global === 'superadmin' ||
    me?.role_global === 'admin' ||
    hasPermission(me, 'relatorios', 'view')

  if (!canView) {
    return (
      <div data-testid="access-denied" className="flex flex-col items-center justify-center py-20 text-center">
        <Lock className="mb-4 h-10 w-10 text-red-500" />
        <h2 className="mb-2 text-2xl font-semibold text-white">Acesso Interditado</h2>
        <p className="mb-8 max-w-md text-gray-400">
          Seu grupo não possui permissão para Relatórios.
        </p>
        <BackTextButton className="text-[#2BAADF]">Voltar</BackTextButton>
      </div>
    )
  }

  const omni = BI_REPORTS.filter((r) => r.wave === 1)
  const workflow = BI_REPORTS.filter((r) => r.wave === 2)

  return (
    <div data-testid="reports-hub" className="space-y-8 pb-20">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-white">
          <BarChart3 className="h-5 w-5 text-orange-400" />
          Relatórios & Analytics
        </h1>
        <p className="mt-0.5 text-xs text-gray-400">
          Omnichannel e Workflow — KPIs agregados no Postgres, exportáveis em Excel/PDF.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-xs font-black uppercase tracking-widest text-gray-500">
          Omnichannel (Onda 1)
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {omni.map((r) => {
            const Icon = r.icon
            return (
              <Link
                key={r.slug}
                href={`/cockpit/relatorios/${r.slug}`}
                data-testid={`report-card-${r.slug}`}
                className="group rounded-2xl border border-[#ffffff0a] bg-[#111111] p-5 transition hover:border-orange-400/30 hover:bg-[#141414]"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-base font-semibold text-white group-hover:text-orange-300">
                    {r.title}
                  </h3>
                  <Icon className="h-5 w-5 shrink-0 text-orange-400/80" />
                </div>
                <p className="mt-2 text-xs leading-relaxed text-gray-400">{r.description}</p>
              </Link>
            )
          })}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-black uppercase tracking-widest text-gray-500">
          Workflow / Funil (Onda 2)
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {workflow.map((r) => {
            const Icon = r.icon
            return (
              <Link
                key={r.slug}
                href={`/cockpit/relatorios/${r.slug}`}
                data-testid={`report-card-${r.slug}`}
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
