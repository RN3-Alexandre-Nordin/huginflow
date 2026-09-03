import SimuladorChat from "./SimuladorChat"
import { MessageSquare, Lock } from "lucide-react"
import { getMyProfile } from "@/app/(app)/cockpit/actions"
import { canAccessSimulador } from "@/utils/permissions"
import BackTextButton from '@/components/BackTextButton'

export const metadata = { title: "Simulador de WhatsApp | HuginFlow CRM" }

export default async function SimuladorPage() {
  const me = await getMyProfile()

  if (!canAccessSimulador(me)) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in duration-700">
        <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mb-6 border border-red-500/20">
          <Lock className="w-10 h-10 text-red-500" />
        </div>
        <h2 className="text-3xl font-extrabold text-white mb-2 tracking-tight">Recurso Bloqueado</h2>
        <p className="text-gray-400 max-w-md mx-auto mb-8 text-lg">
          O Simulador de IA é exclusivo para administradores da empresa.
        </p>
        <BackTextButton className="px-6 py-3 bg-[#ffffff05] hover:bg-[#ffffff10] border border-[#ffffff10] rounded-xl text-white font-semibold transition-all">
          Voltar ao Início
        </BackTextButton>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-10">
      
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 uppercase tracking-widest font-bold">
          Teste de triagem e prompts sem WhatsApp / Evolution
        </p>
        
        <div className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-[#ffffff05] border border-[#ffffff0a] text-gray-400">
           <MessageSquare className="w-4 h-4" />
           <span className="text-[10px] font-black uppercase tracking-widest">IA Powered by OpenAI</span>
        </div>
      </div>

      <SimuladorChat />
      
    </div>
  )
}
