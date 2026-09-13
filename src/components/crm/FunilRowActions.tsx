'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { PenSquare, Trash2, RotateCcw, Loader2 } from 'lucide-react'
import { deletePipelineAction, togglePipelineStatusAction } from '@/app/(app)/cockpit/crm/actions'

export type FunilRowActionsProps = {
  pipelineId: string
  pipelineNome: string
  ativo: boolean
  totalCards: number
  canEdit: boolean
  canDelete: boolean
}

export function FunilRowActions({
  pipelineId,
  pipelineNome,
  ativo,
  totalCards,
  canEdit,
  canDelete,
}: FunilRowActionsProps) {
  const router = useRouter()
  const [loadingAction, setLoadingAction] = useState<string | null>(null)

  async function handleDelete() {
    if (!canDelete) return

    let confirmMsg = ''
    if (totalCards > 0) {
      confirmMsg = `O funil "${pipelineNome}" possui ${totalCards} card(s) cadastrado(s).\n\nPara preservar o histórico de atendimentos e movimentações, o funil será INATIVADO em vez de excluído.\n\nDeseja inativar o funil agora?`
    } else {
      confirmMsg = `O funil "${pipelineNome}" não possui nenhum card cadastrado.\n\nDeseja EXCLUIR DEFINITIVAMENTE este funil e todas as suas etapas?\n\nEsta ação não poderá ser desfeita.`
    }

    if (!window.confirm(confirmMsg)) return

    setLoadingAction('delete')
    try {
      const res = await deletePipelineAction(pipelineId)
      if (res?.error) {
        alert(`Erro: ${res.error}`)
      } else if (res?.message) {
        alert(res.message)
        router.refresh()
      }
    } catch {
      alert('Erro inesperado ao excluir/inativar o funil.')
    } finally {
      setLoadingAction(null)
    }
  }

  async function handleReactivate() {
    if (!canEdit && !canDelete) return
    if (!window.confirm(`Deseja reativar o funil "${pipelineNome}"? Ele voltará a aparecer nos fluxos operacionais.`)) {
      return
    }

    setLoadingAction('reactivate')
    try {
      const res = await togglePipelineStatusAction(pipelineId, true)
      if (res?.error) {
        alert(`Erro ao reativar: ${res.error}`)
      } else {
        if (res?.message) alert(res.message)
        router.refresh()
      }
    } catch {
      alert('Erro inesperado ao reativar o funil.')
    } finally {
      setLoadingAction(null)
    }
  }

  return (
    <div className="flex items-center justify-end gap-2 shrink-0">
      {/* Botão Reativar (se inativo) */}
      {!ativo && (canEdit || canDelete) && (
        <button
          type="button"
          onClick={handleReactivate}
          disabled={loadingAction !== null}
          className="p-2.5 text-amber-400 hover:text-white hover:bg-amber-500/10 rounded-xl transition-all border border-amber-500/20 hover:border-amber-500/40"
          title="Reativar Funil"
        >
          {loadingAction === 'reactivate' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RotateCcw className="w-4 h-4" />
          )}
        </button>
      )}

      {/* Botão Editar */}
      {canEdit && (
        <Link
          href={`/cockpit/crm/funis/${pipelineId}/editar`}
          className="p-2.5 text-gray-500 hover:text-white hover:bg-[#ffffff05] rounded-xl transition-all border border-transparent hover:border-[#ffffff10]"
          title="Configurar Fluxo"
        >
          <PenSquare className="w-4.5 h-4.5" />
        </Link>
      )}

      {/* Botão Excluir */}
      {canDelete && (
        <button
          type="button"
          onClick={handleDelete}
          disabled={loadingAction !== null}
          className="p-2.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all border border-transparent hover:border-red-500/20"
          title={totalCards > 0 ? 'Inativar Funil (possui cards)' : 'Excluir Funil e Etapas'}
        >
          {loadingAction === 'delete' ? (
            <Loader2 className="w-4 h-4 animate-spin text-red-400" />
          ) : (
            <Trash2 className="w-4 h-4" />
          )}
        </button>
      )}

      {/* Botão Abrir Kanban */}
      <Link
        href={`/cockpit/crm/funis/${pipelineId}`}
        data-testid="funil-abrir-kanban"
        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-xl ${
          ativo
            ? 'bg-[#ffffff05] text-white border border-[#ffffff10] hover:bg-white hover:text-black'
            : 'bg-[#ffffff03] text-gray-400 border border-[#ffffff08] hover:bg-white/10 hover:text-white'
        }`}
      >
        Abrir Kanban
      </Link>
    </div>
  )
}

export default FunilRowActions
