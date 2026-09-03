'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { CalendarDays, Loader2, Send, User, Users } from 'lucide-react'
import {
  generateHandoverObservacao,
  getTransferablePipelines,
  transferCardPipeline,
  updateCardStage,
  updateCrmCard,
  getCardRedirectContext,
  previewCardRedirect,
} from '@/app/(app)/cockpit/crm/actions'
import type { RedirectDestination } from '@/lib/crm/cardRedirectRouting'
import CardHandoverModal from '@/components/kanban/CardHandoverModal'
import { formatHandoverObservacao, type HandoverUrgencia } from '@/lib/crm/cardHandoverSummary'

type Stage = { id: string; nome: string; ordem?: number | null }

type PipelineOption = { id: string; nome: string; stages: Stage[] }

type RedirectMode = 'departamento' | 'user'

type PreviewInput =
  | { mode: 'departamento'; departamentoId: string; leadId?: string | null }
  | { mode: 'user'; userId: string; leadId?: string | null }

type OperadorOption = {
  id: string
  nome: string
  pendentes: number
  departamento_ids: string[]
}

type Props = {
  card: {
    id: string
    titulo: string
    cliente_nome?: string | null
    valor?: number | null
    descricao?: string | null
    observacao?: string | null
    responsavel_id?: string | null
    data_prazo?: string | null
    stage_id: string
    lead_id?: string | null
  }
  currentPipelineId: string
  currentPipelineName: string
  currentStages: Stage[]
  onDone: () => void
  onCancel: () => void
}

const MIN_OBSERVACAO_LENGTH = 20

export default function CardRedirectPanel({
  card,
  currentPipelineId,
  currentPipelineName,
  currentStages,
  onDone,
  onCancel,
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [loadingRoute, setLoadingRoute] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [handoverModalOpen, setHandoverModalOpen] = useState(false)
  const [handoverModalError, setHandoverModalError] = useState<string | null>(null)
  const [handoverNotice, setHandoverNotice] = useState<string | null>(null)
  const [handoverObservacao, setHandoverObservacao] = useState('')
  const [handoverUrgencia, setHandoverUrgencia] = useState<HandoverUrgencia>('normal')
  const [generatingSummary, setGeneratingSummary] = useState(false)

  const [mode, setMode] = useState<RedirectMode>('departamento')
  const [departamentos, setDepartamentos] = useState<{ id: string; nome: string }[]>([])
  const [operadores, setOperadores] = useState<OperadorOption[]>([])
  const previewSeq = useRef(0)
  const departamentoIdRef = useRef('')
  const operadorIdRef = useRef('')
  const userPickedDeptRef = useRef(false)
  const [otherPipelines, setOtherPipelines] = useState<PipelineOption[]>([])
  const [routedPipelines, setRoutedPipelines] = useState<Map<string, PipelineOption>>(new Map())

  const [departamentoId, setDepartamentoId] = useState('')
  const [operadorId, setOperadorId] = useState('')
  const [responsavelId, setResponsavelId] = useState(card.responsavel_id || '')
  const [previewDest, setPreviewDest] = useState<RedirectDestination | null>(null)
  const [dataPrazo, setDataPrazo] = useState(card.data_prazo || '')
  const [targetPipelineId, setTargetPipelineId] = useState(currentPipelineId)
  const [targetStageId, setTargetStageId] = useState(card.stage_id)
  const [routeError, setRouteError] = useState<string | null>(null)

  useEffect(() => {
    departamentoIdRef.current = departamentoId
  }, [departamentoId])

  useEffect(() => {
    operadorIdRef.current = operadorId
  }, [operadorId])

  const pipelineOptions = useMemo(() => {
    const options: PipelineOption[] = [
      { id: currentPipelineId, nome: `${currentPipelineName} (atual)`, stages: currentStages },
      ...otherPipelines.map((p) => ({
        id: p.id,
        nome: p.nome,
        stages: p.stages || [],
      })),
    ]
    for (const pipe of routedPipelines.values()) {
      if (!options.some((p) => p.id === pipe.id)) {
        options.push(pipe)
      }
    }
    return options
  }, [currentPipelineId, currentPipelineName, currentStages, otherPipelines, routedPipelines])

  const isCrossPipeline = targetPipelineId !== currentPipelineId

  const dePipelineNome =
    pipelineOptions.find((p) => p.id === currentPipelineId)?.nome.replace(' (atual)', '') ||
    currentPipelineName
  const paraPipelineNome =
    pipelineOptions.find((p) => p.id === targetPipelineId)?.nome.replace(' (atual)', '') || '—'

  const selectedPipeline = pipelineOptions.find((p) => p.id === targetPipelineId)
  const stageOptions = selectedPipeline?.stages ?? []

  const mergeRoutedPipeline = useCallback((dest: RedirectDestination) => {
    if (!dest.pipeline_id || !dest.pipeline_stages?.length) return
    setRoutedPipelines((prev) => {
      const next = new Map(prev)
      next.set(dest.pipeline_id!, {
        id: dest.pipeline_id!,
        nome: dest.pipeline_nome || 'Funil',
        stages: dest.pipeline_stages!,
      })
      return next
    })
  }, [])

  const applyPreview = useCallback(
    (dest: RedirectDestination) => {
      setPreviewDest(dest)
      setResponsavelId(dest.responsavel_id || '')
      if (dest.departamento_id) {
        departamentoIdRef.current = dest.departamento_id
        setDepartamentoId(dest.departamento_id)
      }
      if (dest.responsavel_id) {
        operadorIdRef.current = dest.responsavel_id
        setOperadorId(dest.responsavel_id)
      }
      setRouteError(dest.pipeline_id ? null : dest.auto_reason)
      if (dest.pipeline_id) {
        setTargetPipelineId(dest.pipeline_id)
        if (dest.stage_id) setTargetStageId(dest.stage_id)
      } else {
        setTargetPipelineId(currentPipelineId)
        setTargetStageId(card.stage_id)
      }
      mergeRoutedPipeline(dest)
    },
    [mergeRoutedPipeline, currentPipelineId, card.stage_id],
  )

  const runPreview = useCallback(
    async (input: PreviewInput) => {
      const seq = ++previewSeq.current
      setLoadingRoute(true)
      setRouteError(null)

      const res = await previewCardRedirect(input)

      if (seq !== previewSeq.current) return

      setLoadingRoute(false)

      if (res.error) {
        const stillCurrent =
          input.mode === 'departamento'
            ? departamentoIdRef.current === input.departamentoId
            : operadorIdRef.current === input.userId
        if (stillCurrent) {
          setRouteError(res.error)
          setPreviewDest(null)
        }
        return
      }

      if (!res.data) return

      const stillCurrent =
        input.mode === 'departamento'
          ? res.data.departamento_id === input.departamentoId &&
            departamentoIdRef.current === input.departamentoId
          : res.data.responsavel_id === input.userId &&
            operadorIdRef.current === input.userId

      if (stillCurrent) {
        applyPreview(res.data)
      }
    },
    [applyPreview],
  )

  const runPreviewRef = useRef(runPreview)
  runPreviewRef.current = runPreview

  useEffect(() => {
    let cancelled = false
    previewSeq.current += 1
    userPickedDeptRef.current = false
    setMode('departamento')

    async function init() {
      setLoadingRoute(true)
      setError(null)
      setRouteError(null)
      setHandoverModalOpen(false)
      setHandoverObservacao('')
      setHandoverUrgencia('normal')
      setHandoverModalError(null)
      setPreviewDest(null)
      setOperadorId('')
      setResponsavelId(card.responsavel_id || '')
      setTargetPipelineId(currentPipelineId)
      setTargetStageId(card.stage_id)
      setRoutedPipelines(new Map())

      const [ctxRes, pipesRes] = await Promise.all([
        getCardRedirectContext({
          id: card.id,
          titulo: card.titulo,
          descricao: card.descricao,
          observacao: card.observacao,
          lead_id: card.lead_id,
        }),
        getTransferablePipelines(),
      ])

      if (cancelled) return

      if (pipesRes.data) {
        setOtherPipelines(
          pipesRes.data
            .filter((p) => p.id !== currentPipelineId)
            .map((p) => ({
              id: p.id,
              nome: p.nome,
              stages: (p.pipeline_stages || []) as Stage[],
            })),
        )
      }

      if (!ctxRes.data) {
        setLoadingRoute(false)
        return
      }

      setDepartamentos(ctxRes.data.departamentos)
      setOperadores(ctxRes.data.operadores)

      const inferred = ctxRes.data.inferred_departamento_id
      const initialDept = inferred || ctxRes.data.departamentos[0]?.id || ''

      if (!userPickedDeptRef.current) {
        departamentoIdRef.current = initialDept
        setDepartamentoId(initialDept)
      }

      const deptToPreview = userPickedDeptRef.current
        ? departamentoIdRef.current
        : initialDept

      if (deptToPreview) {
        await runPreviewRef.current({
          mode: 'departamento',
          departamentoId: deptToPreview,
          leadId: card.lead_id,
        })
      } else {
        setLoadingRoute(false)
      }
    }

    void init()
    return () => {
      cancelled = true
      previewSeq.current += 1
    }
  }, [card.id, card.lead_id, currentPipelineId])

  const handleModeChange = (next: RedirectMode) => {
    if (next === mode) return
    setMode(next)
    setError(null)
    setRouteError(null)
    setPreviewDest(null)
    previewSeq.current += 1

    if (next === 'departamento') {
      if (departamentoId) {
        void runPreview({
          mode: 'departamento',
          departamentoId,
          leadId: card.lead_id,
        })
      } else {
        setLoadingRoute(false)
        setResponsavelId('')
      }
      return
    }

    if (operadorId) {
      void runPreview({ mode: 'user', userId: operadorId, leadId: card.lead_id })
    } else {
      setLoadingRoute(false)
      setResponsavelId('')
    }
  }

  const handleDepartamentoChange = (deptId: string) => {
    userPickedDeptRef.current = true
    previewSeq.current += 1
    departamentoIdRef.current = deptId
    setDepartamentoId(deptId)
    setError(null)
    if (!deptId) {
      setResponsavelId('')
      setOperadorId('')
      setPreviewDest(null)
      setRouteError(null)
      setLoadingRoute(false)
      return
    }
    void runPreview({ mode: 'departamento', departamentoId: deptId, leadId: card.lead_id })
  }

  const handleOperadorChange = (userId: string) => {
    previewSeq.current += 1
    operadorIdRef.current = userId
    setOperadorId(userId)
    setError(null)
    if (!userId) {
      setResponsavelId('')
      setPreviewDest(null)
      setRouteError(null)
      setLoadingRoute(false)
      return
    }
    void runPreview({ mode: 'user', userId, leadId: card.lead_id })
  }

  useEffect(() => {
    if (!targetPipelineId || stageOptions.length === 0) return
    if (!stageOptions.some((s) => s.id === targetStageId)) {
      setTargetStageId(stageOptions[0]?.id ?? '')
    }
  }, [targetPipelineId, stageOptions, targetStageId])

  const loadHandoverSummary = useCallback(
    async (isAutoRetry = false) => {
      setGeneratingSummary(true)
      if (!isAutoRetry) {
        setHandoverModalError(null)
        setHandoverNotice(null)
      }

      const res = await generateHandoverObservacao({
        cardId: card.id,
        leadId: card.lead_id,
        dePipelineNome,
        paraPipelineNome,
      })

      const observacaoText = res.data?.observacao?.trim() ?? ''

      if (observacaoText) {
        setHandoverObservacao(formatHandoverObservacao(observacaoText))
        if (res.data?.urgencia) setHandoverUrgencia(res.data.urgencia)
        setHandoverModalError(null)
        if (isAutoRetry) {
          setHandoverNotice('Resumo gerado automaticamente na segunda tentativa.')
        }
        setGeneratingSummary(false)
        return
      }

      if (!isAutoRetry) {
        setHandoverNotice('O resumo veio vazio. Gerando novamente automaticamente…')
        await loadHandoverSummary(true)
        return
      }

      setGeneratingSummary(false)
      setHandoverNotice(null)
      setHandoverModalError(
        res.error || 'Não foi possível gerar o resumo. Escreva manualmente no campo abaixo.',
      )
      if (card.observacao?.trim()) {
        setHandoverObservacao(formatHandoverObservacao(card.observacao.trim()))
      }
    },
    [card.id, card.lead_id, card.observacao, dePipelineNome, paraPipelineNome],
  )

  const openHandoverModal = useCallback(() => {
    setHandoverModalOpen(true)
    setHandoverModalError(null)
    setHandoverNotice(null)
    void loadHandoverSummary(false)
  }, [loadHandoverSummary])

  const executeTransfer = (observacaoOverride?: string) => {
    const observacaoFinal = (observacaoOverride ?? handoverObservacao).trim()
    const cross = targetPipelineId !== currentPipelineId

    if (cross) {
      if (observacaoFinal.length < MIN_OBSERVACAO_LENGTH) {
        setHandoverModalError(`O resumo deve ter pelo menos ${MIN_OBSERVACAO_LENGTH} caracteres.`)
        return false
      }
    }

    setHandoverModalError(null)
    setError(null)

    startTransition(async () => {
      const observacaoCard = cross ? observacaoFinal : card.observacao || ''

      const fd = new FormData()
      fd.append('titulo', card.titulo || '')
      fd.append('cliente_nome', card.cliente_nome || '')
      fd.append('valor', String(card.valor ?? 0))
      fd.append('descricao', card.descricao || '')
      fd.append('observacao', observacaoCard)
      fd.append('responsavel_id', responsavelId)
      fd.append('data_prazo', dataPrazo)

      const saveRes = await updateCrmCard(card.id, currentPipelineId, fd)
      if (saveRes?.error) {
        if (cross && handoverModalOpen) setHandoverModalError(saveRes.error)
        else setError(saveRes.error)
        return
      }

      const movingPipeline = targetPipelineId !== currentPipelineId
      const movingStage = targetStageId !== card.stage_id

      if (movingPipeline) {
        const transferRes = await transferCardPipeline(
          card.id,
          currentPipelineId,
          targetPipelineId,
          targetStageId,
          cross ? observacaoFinal : undefined,
          cross ? handoverUrgencia : undefined,
        )
        if (transferRes?.error) {
          if (cross && handoverModalOpen) setHandoverModalError(transferRes.error)
          else setError(transferRes.error)
          return
        }
      } else if (movingStage) {
        const stageRes = await updateCardStage(card.id, currentPipelineId, targetStageId)
        if (stageRes?.error) {
          setError(stageRes.error)
          return
        }
      }

      setHandoverModalOpen(false)
      onDone()
    })

    return true
  }

  const handlePrimaryAction = () => {
    if (mode === 'departamento' && !departamentoId) {
      setError('Selecione o departamento de destino.')
      return
    }
    if (mode === 'user' && !operadorId) {
      setError('Selecione o operador de destino.')
      return
    }
    if (!responsavelId) {
      setError(
        mode === 'user'
          ? 'Não foi possível definir o operador responsável.'
          : 'Nenhum operador disponível neste departamento.',
      )
      return
    }
    if (!dataPrazo) {
      setError('Informe a data de término da tarefa.')
      return
    }
    if (!targetPipelineId || !targetStageId) {
      setError('Selecione funil e estágio de destino.')
      return
    }
    if (routeError && !(targetPipelineId && targetStageId)) {
      setError(routeError)
      return
    }

    setError(null)

    if (isCrossPipeline) {
      openHandoverModal()
      return
    }

    executeTransfer()
  }

  const selectionOk = mode === 'departamento' ? Boolean(departamentoId) : Boolean(operadorId)
  // Rota automática pode falhar no funil; se o usuário já escolheu funil+estágio manualmente, libera.
  const routeBlocks =
    Boolean(routeError) && !(targetPipelineId && targetStageId && responsavelId)
  const canProceed =
    selectionOk &&
    responsavelId &&
    dataPrazo &&
    targetStageId &&
    targetPipelineId &&
    !routeBlocks &&
    !loadingRoute

  const operadoresSorted = useMemo(
    () =>
      [...operadores].sort((a, b) => {
        if (a.pendentes !== b.pendentes) return a.pendentes - b.pendentes
        return a.nome.localeCompare(b.nome, 'pt-BR')
      }),
    [operadores],
  )

  return (
    <>
      <div className="space-y-4 animate-in fade-in duration-200">
        <p className="text-[11px] text-gray-500 leading-relaxed">
          Encaminhe por <strong className="text-gray-400">departamento</strong> (sistema escolhe o
          operador com menor carga) ou por <strong className="text-gray-400">operador</strong>{' '}
          específico. Funil e estágio são pré-selecionados e podem ser ajustados.
        </p>

        <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[#050505] border border-[#ffffff10]">
          <button
            type="button"
            onClick={() => handleModeChange('departamento')}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-black uppercase tracking-wide transition-colors ${
              mode === 'departamento'
                ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            Departamento
          </button>
          <button
            type="button"
            onClick={() => handleModeChange('user')}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-black uppercase tracking-wide transition-colors ${
              mode === 'user'
                ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            Operador
          </button>
        </div>

        {mode === 'departamento' ? (
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
              Departamento destino *
            </label>
            <select
              value={departamentoId}
              onChange={(e) => handleDepartamentoChange(e.target.value)}
              className="w-full bg-[#050505] border border-[#ffffff10] focus:border-orange-500/50 rounded-xl p-3 text-sm text-white outline-none"
            >
              <option value="">— Selecione —</option>
              {departamentos.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nome}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
              Operador destino *
            </label>
            <select
              value={operadorId}
              onChange={(e) => handleOperadorChange(e.target.value)}
              className="w-full bg-[#050505] border border-[#ffffff10] focus:border-orange-500/50 rounded-xl p-3 text-sm text-white outline-none"
            >
              <option value="">— Selecione —</option>
              {operadoresSorted.map((op) => (
                <option key={op.id} value={op.id}>
                  {op.nome} ({op.pendentes} abertos)
                </option>
              ))}
            </select>
          </div>
        )}

        {previewDest && (
          <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 px-3 py-2.5 text-[11px] text-sky-100/90 leading-relaxed">
            <span className="font-bold text-sky-300">Sugestão: </span>
            {previewDest.responsavel_nome || '—'}
            {previewDest.pendentes != null ? ` (${previewDest.pendentes} abertos)` : ''}
            {' → '}
            {previewDest.pipeline_nome || 'escolha o funil abaixo'}
            {previewDest.stage_nome ? ` / ${previewDest.stage_nome}` : ''}
            {previewDest.departamento_nome ? ` · ${previewDest.departamento_nome}` : ''}
            {previewDest.auto_reason ? (
              <span className="block mt-1 text-sky-200/60">{previewDest.auto_reason}</span>
            ) : null}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
              Funil destino *
            </label>
            <select
              value={targetPipelineId}
              onChange={(e) => {
                const nextPipe = e.target.value
                setTargetPipelineId(nextPipe)
                setRouteError(null)
                const stages =
                  pipelineOptions.find((p) => p.id === nextPipe)?.stages ?? []
                setTargetStageId(stages[0]?.id ?? '')
              }}
              disabled={loadingRoute}
              className="w-full bg-[#050505] border border-[#ffffff10] focus:border-orange-500/50 rounded-xl p-3 text-sm text-white outline-none disabled:opacity-60"
            >
              {pipelineOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
              Estágio destino *
            </label>
            <select
              value={targetStageId}
              onChange={(e) => {
                setTargetStageId(e.target.value)
                setRouteError(null)
              }}
              disabled={loadingRoute || stageOptions.length === 0}
              className="w-full bg-[#050505] border border-[#ffffff10] focus:border-orange-500/50 rounded-xl p-3 text-sm text-white outline-none disabled:opacity-60"
            >
              {stageOptions.length === 0 ? (
                <option value="">— Sem estágios —</option>
              ) : (
                stageOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))
              )}
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-1">
            <CalendarDays className="w-3 h-3" /> Data de término *
          </label>
          <input
            type="date"
            value={dataPrazo}
            onChange={(e) => setDataPrazo(e.target.value)}
            className="w-full bg-[#050505] border border-[#ffffff10] focus:border-orange-500/50 rounded-xl p-3 text-sm text-white outline-none [color-scheme:dark]"
          />
        </div>

        {(routeError || error) && (
          <p className="text-[11px] text-red-400 font-medium">{routeError || error}</p>
        )}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={handlePrimaryAction}
            disabled={isPending || loadingRoute || !canProceed}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-black bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-50"
          >
            {isPending || loadingRoute ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            {loadingRoute
              ? 'Calculando…'
              : isCrossPipeline
                ? 'Continuar'
                : 'Encaminhar card'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="px-5 py-3 rounded-xl text-sm font-bold bg-[#ffffff08] text-gray-400 hover:text-white"
          >
            Voltar
          </button>
        </div>
      </div>

      <CardHandoverModal
        open={handoverModalOpen}
        onClose={() => {
          if (!isPending) {
            setHandoverModalOpen(false)
            setHandoverModalError(null)
            setHandoverNotice(null)
          }
        }}
        onConfirm={() => executeTransfer(handoverObservacao)}
        isPending={isPending}
        isGenerating={generatingSummary}
        error={handoverModalError}
        notice={handoverNotice}
        observacao={handoverObservacao}
        onObservacaoChange={setHandoverObservacao}
        urgencia={handoverUrgencia}
        onUrgenciaChange={setHandoverUrgencia}
        dePipelineNome={dePipelineNome}
        paraPipelineNome={paraPipelineNome}
        dataPrazo={dataPrazo}
      />
    </>
  )
}
