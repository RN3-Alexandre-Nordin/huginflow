import { ExternalLink } from 'lucide-react'
import Link from 'next/link'

export default function AjudaPage() {
  return (
    <div className="flex flex-col h-[calc(100vh-10rem)] -m-8 min-h-[480px]">
      <div className="flex items-center justify-between gap-4 px-8 py-4 border-b border-[#ffffff0a] bg-[#0A0A0A]/80 backdrop-blur-md shrink-0">
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight">Manual do Usuário</h2>
          <p className="text-xs text-gray-500 mt-0.5">Guia completo do Cockpit HuginFlow</p>
        </div>
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
      <iframe
        src="/api/ajuda/manual"
        title="Manual do Usuário HuginFlow"
        className="flex-1 w-full border-0 bg-[#0f1419] custom-scrollbar-main"
      />
    </div>
  )
}
