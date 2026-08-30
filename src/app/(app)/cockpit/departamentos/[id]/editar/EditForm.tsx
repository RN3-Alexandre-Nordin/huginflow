'use client'

import { useTransition, useState } from "react"
import { updateDepartamento, deleteDepartamento } from "@/app/(app)/cockpit/actions"
import Link from "next/link"
import { LayoutDashboard, Building2, AlignLeft, Save, Trash2, AlertTriangle } from "lucide-react"
import { BackButton } from '@/components/BackButton'
import SearchableSelect from "@/components/SearchableSelect"

interface Departamento {
  id: string
  nome: string
  descricao: string | null
  empresa_id: string
  empresas?: {
    id: string
    nome: string
  }
}

interface EditFormProps {
  departamento: Departamento
  companies: { id: string, nome: string }[]
  isSuperAdmin: boolean
}

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

const inputCls = "w-full bg-[#0A0A0A] border border-[#ffffff12] focus:border-[#80B828] rounded-xl px-4 py-2.5 text-sm text-white outline-none transition-all placeholder-gray-600 focus:ring-1 focus:ring-[#80B828]/30"

export default function EditForm({ departamento, companies, isSuperAdmin }: EditFormProps) {
  const [isPending, startTransition] = useTransition()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [selectedEmpresa, setSelectedEmpresa] = useState(departamento.empresa_id)

  const handleSubmit = (formData: FormData) => {
    startTransition(() => {
      updateDepartamento(departamento.id, formData)
    })
  }

  const handleDelete = () => {
    startTransition(() => {
      deleteDepartamento(departamento.id)
    })
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-10">
      {/* Header */}
      <div className="flex items-center gap-4">
        <BackButton fallbackHref="/cockpit/departamentos" />
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <LayoutDashboard className="w-6 h-6 text-[#80B828]" />
            Configurações do Departamento
          </h2>
          <p className="text-sm text-gray-400 mt-0.5">
            ID: <span className="font-mono text-gray-500">{departamento.id}</span>
          </p>
        </div>
      </div>

      <form action={handleSubmit} className="space-y-6">
        <div className="bg-[#111111] border border-[#ffffff0a] rounded-2xl p-6 space-y-6 relative overflow-hidden">
          <div className="absolute -top-20 -right-20 w-48 h-48 rounded-full opacity-[0.04] pointer-events-none"
               style={{ background: 'radial-gradient(circle, #80B828 0%, transparent 70%)', filter: 'blur(30px)' }} />
          
          <div className="grid grid-cols-1 gap-5">
            <Field label="Empresa (Tenant)" required>
              <SearchableSelect
                name="empresa_id"
                required
                icon={Building2}
                options={isSuperAdmin ? companies : [{ id: departamento.empresa_id, nome: departamento.empresas?.nome || 'Minha Empresa' }]}
                value={selectedEmpresa}
                onChange={setSelectedEmpresa}
                placeholder="Pesquisar empresa..."
                disabled={!isSuperAdmin}
              />
            </Field>

            <Field label="Nome do Departamento" required>
              <input 
                type="text" 
                name="nome" 
                required 
                defaultValue={departamento.nome}
                className={inputCls} 
              />
            </Field>

            <Field label="Descrição Interna">
              <div className="relative">
                <AlignLeft className="absolute left-3 top-3 w-4 h-4 text-gray-500" />
                <textarea 
                  name="descricao" 
                  defaultValue={departamento.descricao ?? ""}
                  placeholder="Explique o propósito deste departamento..." 
                  rows={4}
                  className={`${inputCls} pl-10 resize-none`} 
                />
              </div>
            </Field>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-[#ffffff0a]">
          <div className="flex items-center gap-4">
            {!showDeleteConfirm ? (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="group flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-red-500/70 hover:text-red-500 hover:bg-red-500/10 transition-all border border-transparent hover:border-red-500/20"
              >
                <Trash2 className="w-4 h-4" />
                Excluir Departamento
              </button>
            ) : (
              <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2 animate-in fade-in slide-in-from-left-2 transition-all">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                <span className="text-[10px] font-bold uppercase tracking-tight text-red-500">Confirmar exclusão?</span>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isPending}
                  className="bg-red-500 hover:bg-red-600 text-white text-[10px] uppercase tracking-wider font-bold px-3 py-1 rounded-lg transition-colors disabled:opacity-50"
                >
                  {isPending ? '...' : 'Sim, Excluir'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="text-gray-400 hover:text-white text-[10px] uppercase tracking-wider font-bold"
                >
                  Cancelar
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={isPending}
              className="bg-gradient-to-r from-[#80B828] to-[#5A8F1A] hover:shadow-[0_4px_24px_rgba(128,184,40,0.35)] disabled:opacity-50 disabled:cursor-not-allowed text-white px-8 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-2"
            >
              {isPending ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Salvar Alterações
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
