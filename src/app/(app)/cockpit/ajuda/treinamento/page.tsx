import { ExternalLink } from 'lucide-react'
import Link from 'next/link'

export default function TreinamentoOperadorPage() {
  return (
    <div className="flex flex-col h-[calc(100vh-10rem)] -m-8 min-h-[480px]">
      <div className="flex items-center justify-between gap-4 px-8 py-4 border-b border-[#ffffff0a] bg-[#0A0A0A]/80 backdrop-blur-md shrink-0">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">
            <Link href="/cockpit/ajuda" className="hover:text-[#2BAADF] transition-colors">
              Ajuda
            </Link>
            <span>/</span>
            <span className="text-gray-400">Treinamento</span>
          </div>
          <h2 className="text-lg font-bold text-white tracking-tight">Treinamento do Operador</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Guia passo a passo para atendimento, chat interno e cards — ideal para treinamento remoto
          </p>
        </div>
        <Link
          href="/api/ajuda/treinamento-operadores"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider text-[#2BAADF] border border-[#2BAADF]/30 hover:bg-[#2BAADF]/10 transition-colors shrink-0"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Nova aba
        </Link>
      </div>
      <iframe
        src="/api/ajuda/treinamento-operadores"
        title="Treinamento do Operador HuginFlow"
        className="flex-1 w-full border-0 bg-[#0f1419] custom-scrollbar-main"
      />
    </div>
  )
}
