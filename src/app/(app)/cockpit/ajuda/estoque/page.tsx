import { BookOpen, ExternalLink, GraduationCap, Package } from 'lucide-react'
import Link from 'next/link'
import { getMyProfile } from '@/lib/auth/getMyProfile'

export default async function ManualEstoquePage() {
  const me = await getMyProfile()
  const isAdmin =
    me?.role_global === 'admin' || me?.role_global === 'superadmin'

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)] -m-8 min-h-[480px]">
      <div className="flex items-center justify-between gap-4 px-8 py-4 border-b border-[#ffffff0a] bg-[#0A0A0A]/80 backdrop-blur-md shrink-0">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">
            <span className="text-gray-400">Ajuda</span>
            <span>/</span>
            <span className="text-gray-400">Estoque</span>
          </div>
          <h2 className="text-lg font-bold text-white tracking-tight">Manual de Estoque</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Locais, entradas, saídas, requisições, remessas, saldos e relatórios
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isAdmin ? (
            <Link
              href="/cockpit/ajuda"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider text-gray-400 border border-[#ffffff14] hover:bg-[#ffffff08] transition-colors"
            >
              <BookOpen className="w-3.5 h-3.5" />
              Administrador
            </Link>
          ) : null}
          <Link
            href="/cockpit/ajuda/treinamento"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider text-orange-400 border border-orange-500/30 hover:bg-orange-500/10 transition-colors"
          >
            <GraduationCap className="w-3.5 h-3.5" />
            Treinamento
          </Link>
          <Link
            href="/api/ajuda/manual-estoque"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider text-[#2BAADF] border border-[#2BAADF]/30 hover:bg-[#2BAADF]/10 transition-colors"
          >
            <Package className="w-3.5 h-3.5" />
            <ExternalLink className="w-3.5 h-3.5" />
            Nova aba
          </Link>
        </div>
      </div>
      <iframe
        src="/api/ajuda/manual-estoque"
        title="Manual do Usuário — Estoque"
        className="flex-1 w-full border-0 bg-[#0f1419] custom-scrollbar-main"
      />
    </div>
  )
}
