import SimuladorChat from "./SimuladorChat"
import { MessageSquare, Sparkles, Lock } from "lucide-react"
import { getMyProfile } from "@/app/(app)/cockpit/actions"
import { hasPermission } from "@/utils/permissions"
import Link from "next/link"

export const metadata = { title: "Simulador de WhatsApp | HuginFlow CRM" }

export default async function SimuladorPage() {
  const me = await getMyProfile()

  if (!hasPermission(me, 'simulador', 'view')) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in duration-700">
        <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mb-6 border border-red-500/20">
          <Lock className="w-10 h-10 text-red-500" />
        </div>
        <h2 className="text-3xl font-extrabold text-white mb-2 tracking-tight">Recurso Bloqueado</h2>
        <p className="text-gray-400 max-w-md mx-auto mb-8 text-lg">
          Seu grupo de acesso não possui permissão para utilizar o Simulador de IA.
        </p>
        <Link href="/cockpit" className="px-6 py-3 bg-[#ffffff05] hover:bg-[#ffffff10] border border-[#ffffff10] rounded-xl text-white font-semibold transition-all">
          Voltar ao Início
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-10">
      
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-white flex items-center gap-3 italic">
            <Sparkles className="w-8 h-8 text-[#2BAADF]" />
            WHATSAPP SIMULATOR
          </h2>
          <p className="text-sm text-gray-500 mt-1 uppercase tracking-widest font-bold">Ambiente de Teste de Inteligência Artificial e Conversão de Leads</p>
        </div>
        
        <div className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-[#ffffff05] border border-[#ffffff0a] text-gray-400">
           <MessageSquare className="w-4 h-4" />
           <span className="text-[10px] font-black uppercase tracking-widest">IA Powered by OpenAI</span>
        </div>
      </div>

      <SimuladorChat />
      
    </div>
  )
}
