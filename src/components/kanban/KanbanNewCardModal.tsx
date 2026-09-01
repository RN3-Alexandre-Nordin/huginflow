'use client'

import { useTransition, useState } from 'react'
import { X, Plus, User, CalendarDays, DollarSign, LayoutTemplate } from 'lucide-react'
import { createCrmCard } from '@/app/(app)/cockpit/crm/actions'

interface Stage { id: string; nome: string; ordem: number }
interface Usuario { id: string; nome_completo: string }

interface KanbanNewCardModalProps {
  pipelineId: string
  stages: Stage[]
  usuarios: Usuario[]
  currentUserId?: string
  onClose: () => void
}

const inputCls = "w-full bg-[#0A0A0A] border border-[#ffffff10] focus:border-[#2BAADF]/50 rounded-xl p-3 text-sm text-white outline-none transition-all placeholder-gray-600 [color-scheme:dark]"
const selectCls = "w-full bg-[#0A0A0A] border border-[#ffffff10] focus:border-[#2BAADF]/50 rounded-xl p-3 text-sm text-gray-300 outline-none transition-all"
const labelCls = "text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1.5 block"

export default function KanbanNewCardModal({
  pipelineId,
  stages,
  usuarios,
  currentUserId,
  onClose,
}: KanbanNewCardModalProps) {
  const [isPending, startTransition] = useTransition()
  const [selectedStage, setSelectedStage] = useState(stages[0]?.id || '')

  const sortedStages = [...stages].sort((a, b) => a.ordem - b.ordem)

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)

    startTransition(async () => {
      const res = await createCrmCard(pipelineId, selectedStage, fd)
      if (res?.error) {
        alert('Erro ao criar card: ' + res.error)
      } else {
        onClose()
      }
    })
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="bg-[#0F0F0F] border border-[#ffffff10] rounded-2xl w-full max-w-2xl shadow-[0_0_60px_-12px_rgba(0,0,0,0.8)] overflow-hidden animate-in fade-in zoom-in-95 duration-300">

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[#ffffff08] bg-gradient-to-r from-[#111] to-[#161616]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#2BAADF]/10 flex items-center justify-center border border-[#2BAADF]/20">
              <Plus className="w-5 h-5 text-[#2BAADF]" />
            </div>
            <div>
              <h3 className="text-lg font-black text-white">Novo Card</h3>
              <p className="text-xs text-gray-500">Adicionar nova oportunidade ao quadro</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-gray-500 hover:text-white rounded-xl hover:bg-[#ffffff08] transition-all border border-transparent hover:border-[#ffffff10]">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            
            {/* Título */}
            <div className="md:col-span-2">
              <label className={labelCls}>Título da Negociação *</label>
              <input type="text" name="titulo" required placeholder="Ex: Proposta para Empresa XYZ..." className={inputCls} autoFocus />
            </div>

            {/* Estágio Inicial */}
            <div>
              <label className={labelCls}><span className="flex items-center gap-1"><LayoutTemplate className="w-3 h-3" />Estágio Inicial *</span></label>
              <select
                name="stage_id"
                required
                value={selectedStage}
                onChange={e => setSelectedStage(e.target.value)}
                className={selectCls}
              >
                {sortedStages.map(s => (
                  <option key={s.id} value={s.id}>{s.nome}</option>
                ))}
              </select>
            </div>

            {/* Cliente */}
            <div className="md:col-span-2">
              <label className={labelCls}><span className="flex items-center gap-1"><User className="w-3 h-3" />Nome do Cliente</span></label>
              <input type="text" name="cliente_nome" placeholder="Nome do contato ou empresa" className={inputCls} />
            </div>

            {/* Valor */}
            <div>
              <label className={labelCls}><span className="flex items-center gap-1"><DollarSign className="w-3 h-3" />Valor Estimado (R$)</span></label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 font-bold text-sm">R$</span>
                <input type="number" name="valor" step="0.01" min="0" defaultValue="0" className={`${inputCls} pl-9`} />
              </div>
            </div>

            {/* Data Prazo */}
            <div>
              <label className={labelCls}><span className="flex items-center gap-1"><CalendarDays className="w-3 h-3" />Data de Entrega Prevista</span></label>
              <input type="date" name="data_prazo" className={`${inputCls} [color-scheme:dark]`} />
            </div>

            {/* Responsável */}
            <div>
              <label className={labelCls}><span className="flex items-center gap-1"><User className="w-3 h-3" />Responsável</span></label>
              <select name="responsavel_id" defaultValue={currentUserId ?? ''} className={selectCls}>
                <option value="">— Sem responsável —</option>
                {usuarios.map(u => (
                  <option key={u.id} value={u.id}>{u.nome_completo}</option>
                ))}
              </select>
            </div>

            {/* Descrição */}
            <div className="md:col-span-2">
              <label className={labelCls}>Descrição</label>
              <textarea name="descricao" rows={3} placeholder="Detalhes sobre a oportunidade..." className={`${inputCls} resize-none`} />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-[#2BAADF] to-[#1A8FBF] hover:shadow-[0_4px_24px_rgba(43,170,223,0.35)] text-white rounded-xl text-sm font-black transition-all disabled:opacity-50"
            >
              {isPending
                ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white animate-spin rounded-full" />Criando...</>
                : <><Plus className="w-4 h-4" />Criar Card</>}
            </button>
            <button type="button" onClick={onClose} className="px-6 py-3 bg-[#ffffff08] hover:bg-[#ffffff10] border border-[#ffffff10] rounded-xl text-sm font-bold text-gray-300 transition-all">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
