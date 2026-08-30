"use client";

import Link from "next/link"
import { Target, Save, AlertCircle } from "lucide-react"
import { BackButton } from '@/components/BackButton'
import { createCanal } from "../actions"
import { useActionState } from "react"

export default function NovoCanalPage() {
  const [state, formAction, isPending] = useActionState(
    async (prevState: any, formData: FormData) => createCanal(formData),
    null
  )

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-20 animate-in fade-in duration-500">
      <div className="flex items-center gap-4">
        <BackButton fallbackHref="/cockpit/crm/canais" />
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <Target className="w-6 h-6 text-[#2BAADF]" />
            Novo Canal de Aquisição
          </h2>
          <p className="text-sm text-gray-400 mt-1">Crie canais para monitorar o faturamento por origem.</p>
        </div>
      </div>

      <div className="bg-[#111111] border border-[#ffffff0a] rounded-2xl overflow-hidden p-8 shadow-2xl relative">
        {/* Loading Overlay */}
        {isPending && (
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] z-50 flex items-center justify-center">
             <div className="w-8 h-8 border-2 border-[#2BAADF]/20 border-t-[#2BAADF] rounded-full animate-spin" />
          </div>
        )}

        <form action={formAction} className="space-y-6">
          {state?.error && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-500 text-sm animate-in slide-in-from-top-2">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <p className="font-medium">{state.error}</p>
            </div>
          )}
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2 col-span-1 md:col-span-2">
              <label htmlFor="nome" className="text-sm font-semibold text-white ml-1">Nome do Canal <span className="text-red-500">*</span></label>
              <input 
                id="nome" 
                name="nome" 
                required 
                placeholder="Ex: Meta Ads, Indicação de Parceiro, Google Orgânico" 
                className="w-full bg-[#0A0A0A] border border-[#ffffff10] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-[#2BAADF] focus:ring-1 focus:ring-[#2BAADF] transition-all"
              />
            </div>

            <div className="space-y-2 col-span-1 md:col-span-2">
              <label htmlFor="tipo" className="text-sm font-semibold text-white ml-1">Tipo / Categoria Relevante</label>
              <select 
                id="tipo" 
                name="tipo" 
                className="w-full bg-[#0A0A0A] border border-[#ffffff10] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#2BAADF] focus:ring-1 focus:ring-[#2BAADF] transition-all appearance-none"
              >
                <option value="whatsapp">WhatsApp (Mensageria)</option>
                <option value="Pago">Tráfego Pago (Ads)</option>
                <option value="Orgânico">Tráfego Orgânico</option>
                <option value="Indicação">Indicação / Boca a boca</option>
                <option value="Físico">Físico / Porta a porta</option>
                <option value="Outros">Outros</option>
              </select>
            </div>
          </div>

          <div className="pt-6 border-t border-[#ffffff0a] flex items-center justify-end gap-3">
            <Link href="/cockpit/crm/canais" className="px-6 py-2.5 text-sm font-semibold text-gray-400 hover:text-white transition-colors">
              Cancelar
            </Link>
            <button 
              type="submit" 
              disabled={isPending}
              className="bg-gradient-to-r from-[#2BAADF] to-[#1A8FBF] hover:shadow-[0_4px_24px_rgba(43,170,223,0.35)] text-white px-8 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
            >
              <Save className="w-4 h-4" /> {isPending ? 'Registrando...' : 'Registrar Canal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
