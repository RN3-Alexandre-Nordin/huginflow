import { requireEmpresaAddons } from '@/lib/addons/require-addon'

export default async function ComprasLayout({ children }: { children: React.ReactNode }) {
  await requireEmpresaAddons({ all: ['compras'] })
  return children
}
