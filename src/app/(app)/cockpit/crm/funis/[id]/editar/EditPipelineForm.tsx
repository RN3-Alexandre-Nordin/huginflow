'use client'

import { useTransition, useState, useEffect } from "react"
import { updatePipeline, deletePipeline } from "../../../actions"
import Link from "next/link"
import { LayoutTemplate, Building2, Info, Lock, Trash2 } from "lucide-react"
import { BackButton } from '@/components/BackButton'
import { createClient } from "@/utils/supabase/client"

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

export default function EditPipelineForm({ pipeline, initialGroups }: { pipeline: any, initialGroups: string[] }) {
  const [isPending, startTransition] = useTransition()
  const [isDeleting, setIsDeleting] = useState(false)
  const [grupos, setGrupos] = useState<any[]>([])
  const [selectedGrupos, setSelectedGrupos] = useState<string[]>(initialGroups)
  const [isPublic, setIsPublic] = useState(pipeline.is_public)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadInitialData() {
      const supabase = createClient()
      const { data } = await supabase.from('grupos_acesso').select('id, nome').order('nome')
      if (data) setGrupos(data)
      setLoading(false)
    }
    loadInitialData()
  }, [])

  const handleSubmit = (formData: FormData) => {
    formData.append('id', pipeline.id)
    formData.append('is_public', isPublic ? 'true' : 'false')
    
    if (!isPublic && selectedGrupos.length > 0) {
      formData.append('grupos_ids', JSON.stringify(selectedGrupos))
    }
    
    startTransition(() => {
      updatePipeline(formData)
    })
  }

  const handleDelete = () => {
    if (confirm("Tem certeza que deseja excluir este Funil? Todos os estágios e cards contidos nele serão PERDIDOS e INACESSIVEIS. Esta ação não pode ser desfeita.")) {
       setIsDeleting(true)
       const formData = new FormData()
       formData.append('id', pipeline.id)
       startTransition(() => {
          deletePipeline(formData)
       })
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-20">
      <div className="flex items-center gap-4">
        <BackButton fallbackHref="/cockpit/crm/funis" />
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <LayoutTemplate className="w-6 h-6 text-[#2BAADF]" />
            Editar Funil
          </h2>
          <p className="text-sm text-gray-400 mt-0.5">
            Altere as propriedades ou reconfigure as permissões de acesso deste painel.
          </p>
        </div>
      </div>

      <form action={handleSubmit} className="space-y-8">
        <div className="bg-[#111111] border border-[#ffffff0a] rounded-2xl p-6 space-y-6 relative overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="md:col-span-2">
              <Field label="Nome do Funil" required>
                <input 
                  type="text" 
                  name="nome" 
                  required 
                  defaultValue={pipeline.nome}
                  className={inputCls} 
                />
              </Field>
            </div>

            <div className="md:col-span-2">
              <Field label="Objetivo / Descrição">
                <textarea 
                  name="descricao" 
                  rows={2}
                  defaultValue={pipeline.descricao}
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
                       <Info className="w-3 h-3 shrink-0" /> Ao alterar grupos aqui, NÃO afeta configurações já customizadas diretamente nos pequenos compartimentos do Kanban. Afeta se eles podem ver o pipeline geral.
                     </p>
                   </div>
                 )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between">
           <button
             type="button"
             onClick={handleDelete}
             disabled={isPending || isDeleting}
             className="px-5 py-2.5 rounded-xl border border-red-500/20 text-red-500 hover:bg-red-500/10 text-sm font-semibold transition-colors flex items-center gap-2"
           >
             <Trash2 className="w-4 h-4" /> Excluir Funil
           </button>
           
           <button
              type="submit"
              disabled={isPending || isDeleting || (!isPublic && selectedGrupos.length === 0)}
              className="bg-gradient-to-r from-[#2BAADF] to-[#1A8FBF] hover:shadow-[0_4px_24px_rgba(43,170,223,0.35)] disabled:opacity-50 disabled:cursor-not-allowed text-white px-8 py-2.5 rounded-xl text-sm font-semibold transition-all"
            >
              {isPending ? 'Salvando...' : 'Salvar Alterações'}
           </button>
        </div>
      </form>
    </div>
  )
}
