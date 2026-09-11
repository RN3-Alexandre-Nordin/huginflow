import { requireEmpresaAddons } from '@/lib/addons/require-addon'

export default async function OmniChatLayout({ children }: { children: React.ReactNode }) {
  await requireEmpresaAddons({ all: ['omni'] })
  return children
}
