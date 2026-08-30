'use client'

import { useTransition, useState, useEffect } from "react"
import { createPipeline } from "../../actions"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { LayoutTemplate, Building2, Info, Lock } from "lucide-react"
import { BackButton } from '@/components/BackButton'
import { createClient } from "@/utils/supabase/client"
import SearchableSelect from "@/components/SearchableSelect"

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
        {label} {required && <span className="text-[#2BAADF]">*</span>}
      </label>
      {children}
    </div>
  )
}

const inputCls = "w-full bg-[#0A0A0A] border border-[#ffffff12] focus:border-[#2BAADF] rounded-xl px-4 py-2.5 text-sm text-white outline-none transition-all placeholder-gray-600 focus:ring-1 focus:ring-[#2BAADF]/30"

export default function NovoFunilPage() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [grupos, setGrupos] = useState<any[]>([])
  const [departamentos, setDepartamentos] = useState<any[]>([])
  const [selectedGrupos, setSelectedGrupos] = useState<string[]>([])
  const [isPublic, setIsPublic] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadInitialData() {
      const supabase = createClient()
      const { data } = await supabase.from('grupos_acesso').select('id, nome').order('nome')
      if (data) setGrupos(data)
      
      const { data: deptos } = await supabase.from('departamentos').select('id, nome').order('nome')
      if (deptos) setDepartamentos(deptos)
      
      setLoading(false)
    }
    loadInitialData()
  }, [])

  const handleSubmit = (formData: FormData) => {
    formData.append('is_public', isPublic ? 'true' : 'false')
    
    // Se não for público, precisamos registrar os grupos
    if (!isPublic && selectedGrupos.length > 0) {
      formData.append('grupos_ids', JSON.stringify(selectedGrupos))
    }
    
    startTransition(async () => {
      try {
        const res = await createPipeline(formData)
        if (res?.error) {
           alert("Erro ao criar funil: " + res.error)
        } else if (res?.success) {
           router.push(`/cockpit/crm/funis/${res.pipelineId}?config=true`)
        } else {
           alert("Erro desconhecido ao criar funil (resposta vazia)")
        }
      } catch (err: any) {
        console.error(err)
        alert("CRASH ao tentar gravar: " + err.message)
      }
    })
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-20">
      <div className="flex items-center gap-4">
        <BackButton fallbackHref="/cockpit/crm/funis" />
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <LayoutTemplate className="w-6 h-6 text-[#2BAADF]" />
            Novo Funil (Kanban)
          </h2>
          <p className="text-sm text-gray-400 mt-0.5">
            Configure seu novo pipeline para gerenciar os negócios de um departamento.
          </p>
        </div>
      </div>

      <form action={handleSubmit} className="space-y-8">
        <div className="bg-[#111111] border border-[#ffffff0a] rounded-2xl p-6 space-y-6 relative overflow-hidden">
          <div className="absolute -top-20 -right-20 w-48 h-48 rounded-full opacity-[0.04] pointer-events-none"
               style={{ background: 'radial-gradient(circle, #2BAADF 0%, transparent 70%)', filter: 'blur(30px)' }} />
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="md:col-span-1">
              <Field label="Nome do Funil" required>
                <input 
                  type="text" 
                  name="nome" 
                  required 
                  placeholder="Ex: Vendas B2B, Recrutamento, etc." 
                  className={inputCls} 
                />
              </Field>
            </div>
            
            <div className="md:col-span-1">
              <Field label="Departamento">
                 <select 
                    name="departamento_id" 
                    className={inputCls}
                 >
                    <option value="">Nenhum (Funil Genérico)</option>
                    {departamentos.map(d => (
                       <option key={d.id} value={d.id}>{d.nome}</option>
                    ))}
                 </select>
              </Field>
            </div>

            <div className="md:col-span-2">
              <Field label="Objetivo / Descrição">
                <textarea 
                  name="descricao" 
                  rows={2}
                  className={`${inputCls} resize-none`} 
                />
              </Field>
            </div>

            <div className="md:col-span-2">
              <div className="p-4 rounded-xl border border-[#ffffff12] bg-[#ffffff02] space-y-4">
                 <h4 className="text-sm font-semibold flex items-center gap-2 text-white">
                   <Lock className="w-4 h-4 text-[#2BAADF]" /> Privilégios e Visibilidade
                 </h4>
                 
                 <label className="flex items-center gap-3 cursor-pointer group w-max">
                   <div className="relative">
                     <input 
                       type="checkbox" 
                       checked={isPublic} 
                       onChange={(e) => {
                           setIsPublic(e.target.checked)
                           if (e.target.checked) setSelectedGrupos([])
                       }} 
                       className="peer sr-only" 
                     />
                     <div className="w-10 h-5 bg-[#ffffff10] rounded-full peer peer-checked:bg-[#2BAADF] transition-colors" />
                     <div className="w-3.5 h-3.5 bg-white rounded-full absolute top-[3px] left-[3px] peer-checked:translate-x-5 transition-transform shadow flex items-center justify-center" />
                   </div>
                   <span className="text-sm text-gray-300 font-medium group-hover:text-white transition-colors">
                     Tornar Visível a Toda a Empresa (Genérico)
                   </span>
                 </label>

                 {!isPublic && (
                   <div className="pt-2">
                     <Field label="Segurança Padrão (Grupos que podem acessar)" required={!isPublic}>
                        {loading ? (
                           <div className="text-sm text-gray-400">Carregando grupos...</div>
                        ) : grupos.length === 0 ? (
                           <div className="text-sm text-[#2BAADF]">Nenhum grupo encontrado na empresa.</div>
                        ) : (
                           <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                             {grupos.map(grupo => (
                               <label key={grupo.id} className="flex items-center gap-3 p-3 rounded-lg border border-[#ffffff10] bg-[#111111] cursor-pointer hover:border-[#2BAADF]/50 transition-colors">
                                 <input
                                   type="checkbox"
                                   checked={selectedGrupos.includes(grupo.id)}
                                   onChange={(e) => {
                                      if(e.target.checked) setSelectedGrupos(prev => [...prev, grupo.id])
                                      else setSelectedGrupos(prev => prev.filter(id => id !== grupo.id))
                                   }}
                                   className="form-checkbox bg-[#0A0A0A] border-[#ffffff20] text-[#2BAADF] focus:ring-[#2BAADF]/30 rounded w-4 h-4 cursor-pointer"
                                 />
                                 <span className="text-sm font-medium text-white">{grupo.nome}</span>
                               </label>
                             ))}
                           </div>
                        )}
                     </Field>
                     <p className="text-xs text-gray-500 mt-3 flex items-center gap-1.5">
                       <Info className="w-3 h-3 shrink-0" /> Essa segurança será aplicada no Funil e herdada nos Buckets Padrões ao ser criado.
                     </p>
                   </div>
                 )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between">
           <span />
           <button
              type="submit"
              disabled={isPending || (!isPublic && selectedGrupos.length === 0)}
              className="bg-gradient-to-r from-[#2BAADF] to-[#1A8FBF] hover:shadow-[0_4px_24px_rgba(43,170,223,0.35)] disabled:opacity-50 disabled:cursor-not-allowed text-white px-8 py-2.5 rounded-xl text-sm font-semibold transition-all"
            >
              {isPending ? 'Criando Funil e Estágios...' : 'Criar e Acessar Quadro'}
           </button>
        </div>
      </form>
    </div>
  )
}
