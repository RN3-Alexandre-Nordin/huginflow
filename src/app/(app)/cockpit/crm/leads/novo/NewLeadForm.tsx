"use client";

import { useActionState } from "react"
import Link from "next/link"
import { Save, AlertCircle } from "lucide-react"
import { createLead } from "../actions"

interface NewLeadFormProps {
  canais: { id: string, nome: string }[] | null
  linkCardId?: string | null
  cancelHref?: string
  defaultNome?: string
}

export default function NewLeadForm({
  canais,
  linkCardId,
  cancelHref = '/cockpit/crm/leads',
  defaultNome = '',
}: NewLeadFormProps) {
  const [state, formAction, isPending] = useActionState(
    async (prevState: any, formData: FormData) => createLead(formData),
    null
  )

  return (
    <form action={formAction} className="bg-[#111111] border border-[#ffffff0a] rounded-2xl overflow-hidden shadow-2xl relative">
      {linkCardId && <input type="hidden" name="link_card_id" value={linkCardId} />}

      {isPending && (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] z-50 flex items-center justify-center">
           <div className="w-8 h-8 border-2 border-[#2BAADF]/20 border-t-[#2BAADF] rounded-full animate-spin" />
        </div>
      )}

      <div className="p-8 space-y-8">
         {state?.error && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-500 text-sm animate-in slide-in-from-top-2">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <p className="font-medium">{state.error}</p>
            </div>
          )}
         
         <div>
            <h3 className="text-xs font-bold text-[#2BAADF] uppercase tracking-wider mb-4 border-b border-[#ffffff10] pb-2">Identificação Principal</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
               <div className="space-y-2 col-span-1 md:col-span-2">
                  <label htmlFor="nome" className="text-sm font-semibold text-white">Nome Completo <span className="text-red-500">*</span></label>
                  <input id="nome" name="nome" required defaultValue={defaultNome} placeholder="Nome do contato ou responsável" className="w-full bg-[#0A0A0A] border border-[#ffffff10] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#2BAADF] transition-all" />
               </div>
               <div className="space-y-2">
                  <label htmlFor="documento" className="text-sm font-semibold text-white">CPF / CNPJ</label>
                  <input id="documento" name="documento" placeholder="Opcional" className="w-full bg-[#0A0A0A] border border-[#ffffff10] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#2BAADF] transition-all" />
               </div>
               <div className="space-y-2">
                  <label htmlFor="canal_id" className="text-sm font-semibold text-white">Canal de Aquisição / Origem</label>
                  <select id="canal_id" name="canal_id" className="w-full bg-[#0A0A0A] border border-[#ffffff10] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#2BAADF] transition-all appearance-none">
                     <option value="">-- Não Informado / Autônomo --</option>
                     {canais?.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
               </div>
            </div>
         </div>

         <div>
            <h3 className="text-xs font-bold text-[#2BAADF] uppercase tracking-wider mb-4 border-b border-[#ffffff10] pb-2">Vias de Contato</h3>
            {linkCardId && (
              <p className="text-xs text-amber-400/90 mb-4">
                Informe WhatsApp ou telefone — obrigatório para iniciar conversa no card.
              </p>
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
               <div className="space-y-2">
                  <label htmlFor="whatsapp" className="text-sm font-semibold text-white">
                    WhatsApp {linkCardId && <span className="text-red-500">*</span>}
                  </label>
                  <input id="whatsapp" name="whatsapp" placeholder="5511999998888" className="w-full bg-[#0A0A0A] border border-[#ffffff10] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#2BAADF] transition-all" />
               </div>
               <div className="space-y-2">
                  <label htmlFor="telefone" className="text-sm font-semibold text-white">Telefone</label>
                  <input id="telefone" name="telefone" placeholder="551133334444" className="w-full bg-[#0A0A0A] border border-[#ffffff10] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#2BAADF] transition-all" />
               </div>
               <div className="space-y-2">
                  <label htmlFor="email" className="text-sm font-semibold text-white">E-mail</label>
                  <input id="email" type="email" name="email" placeholder="contato@empresa.com" className="w-full bg-[#0A0A0A] border border-[#ffffff10] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#2BAADF] transition-all" />
               </div>
            </div>
         </div>

         <div>
            <h3 className="text-xs font-bold text-[#2BAADF] uppercase tracking-wider mb-4 border-b border-[#ffffff10] pb-2">Informações B2B</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
               <div className="space-y-2">
                  <label htmlFor="empresa_cliente" className="text-sm font-semibold text-white">Nome da Empresa (Empregador)</label>
                  <input id="empresa_cliente" name="empresa_cliente" placeholder="Empresa XYZ" className="w-full bg-[#0A0A0A] border border-[#ffffff10] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#2BAADF] transition-all" />
               </div>
               <div className="space-y-2">
                  <label htmlFor="cargo" className="text-sm font-semibold text-white">Cargo / Posição</label>
                  <input id="cargo" name="cargo" placeholder="Ex: Diretor de Vendas" className="w-full bg-[#0A0A0A] border border-[#ffffff10] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#2BAADF] transition-all" />
               </div>
            </div>
         </div>

      </div>

      <div className="p-6 bg-[#0A0A0A] border-t border-[#ffffff0a] flex items-center justify-end gap-3">
        <Link href={cancelHref} className="px-6 py-2.5 text-sm font-semibold text-gray-400 hover:text-white transition-colors">Cancelar</Link>
        <button 
          type="submit" 
          disabled={isPending}
          className="bg-gradient-to-r from-[#2BAADF] to-[#1A8FBF] hover:shadow-[0_4px_24px_rgba(43,170,223,0.35)] text-white px-8 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 disabled:opacity-50 active:scale-95"
        >
          <Save className="w-4 h-4" /> {isPending ? 'Cadastrando...' : linkCardId ? 'Cadastrar e voltar ao card' : 'Cadastrar Lead'}
        </button>
      </div>
    </form>
  )
}
