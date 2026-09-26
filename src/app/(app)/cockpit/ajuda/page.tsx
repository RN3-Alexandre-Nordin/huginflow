import { ExternalLink, GraduationCap, Package } from 'lucide-react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getMyProfile } from '@/lib/auth/getMyProfile'

export default async function AjudaPage() {
  const me = await getMyProfile()
  const isAdmin =
    me?.role_global === 'admin' || me?.role_global === 'superadmin'
  if (!isAdmin) {
    redirect('/cockpit/acesso-negado')
  }

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)] -m-8 min-h-[480px]">
      <div className="flex items-center justify-between gap-4 px-8 py-4 border-b border-[#ffffff0a] bg-[#0A0A0A]/80 backdrop-blur-md shrink-0">
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight">Manual do Administrador</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Empresa, departamentos, usuários, grupos e canais
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/cockpit/ajuda/estoque"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/10 transition-colors"
          >
            <Package className="w-3.5 h-3.5" />
            Estoque
          </Link>
          <Link
            href="/cockpit/ajuda/treinamento"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider text-orange-400 border border-orange-500/30 hover:bg-orange-500/10 transition-colors"
          >
            <GraduationCap className="w-3.5 h-3.5" />
            Treinamento Operador
          </Link>
          <Link
            href="/api/ajuda/manual"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider text-[#2BAADF] border border-[#2BAADF]/30 hover:bg-[#2BAADF]/10 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Nova aba
          </Link>
        </div>
      </div>
      <iframe
        src="/api/ajuda/manual"
        title="Manual do Administrador HuginFlow"
        className="flex-1 w-full border-0 bg-[#0f1419] custom-scrollbar-main"
      />
    </div>
  )
}
