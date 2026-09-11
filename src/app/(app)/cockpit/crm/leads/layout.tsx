import { requireEmpresaAddons } from '@/lib/addons/require-addon'

/** Pessoas (mestre compartilhado): gate workflow|omni. Rota /leads mantida. */
export default async function LeadsLayout({ children }: { children: React.ReactNode }) {
  await requireEmpresaAddons({ any: ['workflow', 'omni'] })
  return children
}
