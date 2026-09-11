import { requireEmpresaAddons } from '@/lib/addons/require-addon'

export default async function FunisLayout({ children }: { children: React.ReactNode }) {
  await requireEmpresaAddons({ all: ['workflow'] })
  return children
}
