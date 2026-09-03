'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Play, RefreshCw, ExternalLink, Loader2, Square, X } from 'lucide-react'
import { catalogEntry, humanExpectation } from '@/lib/testes/catalog'

/** Espelha src/lib/testes/stale.ts (sem import server-side). */
const STALE_RUN_MS = 25 * 60 * 1000

function isRunStaleClient(startedAt: string | null | undefined, status: string) {
  if (!startedAt) return false
  if (status !== 'running' && status !== 'queued') return false
  return Date.now() - new Date(startedAt).getTime() > STALE_RUN_MS
}

function pickActiveRunId(runs: RunRow[]) {
  return (
    runs.find(
      (r) =>
        (r.status === 'running' || r.status === 'queued') &&
        !isRunStaleClient(r.started_at, r.status),
    )?.id ?? null
  )
}

type RunRow = {
  id: string
  started_at: string
  finished_at: string | null
  status: string
  suite: string
  headed: boolean
  base_url: string | null
  commit_sha: string | null
  passed: number
  failed: number
  skipped: number
  error_message: string | null
}

type LiveEvent = {
  ts?: string
  type: string
  id?: string
  title?: string
  area?: string
  expectation?: string
  passos?: string
  status?: string
  error?: string
  message?: string
  passed?: number
  failed?: number
  skipped?: number
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    passed: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    failed: 'bg-red-500/15 text-red-400 border-red-500/30',
    running: 'bg-[#2BAADF]/15 text-[#2BAADF] border-[#2BAADF]/30',
    queued: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    error: 'bg-red-500/15 text-red-400 border-red-500/30',
    cancelled: 'bg-gray-500/15 text-gray-400 border-gray-500/30',
  }
  return map[status] || 'bg-[#ffffff08] text-gray-400 border-[#ffffff12]'
}

function formatWhen(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR')
}

function eventHeadline(ev: LiveEvent) {
  if (ev.expectation) return ev.expectation
  if (ev.id) {
    const entry = catalogEntry(ev.id)
    if (entry) return humanExpectation(ev.id)
  }
  return ev.title || ev.message || ev.id || '…'
}

export default function TestesClient({
  initialRuns,
  runnerEnabled,
}: {
  initialRuns: RunRow[]
  runnerEnabled: boolean
}) {
  const [runs, setRuns] = useState<RunRow[]>(initialRuns)
  const [enabled, setEnabled] = useState(runnerEnabled)
  const [headed, setHeaded] = useState(false)
  const [suite, setSuite] = useState<'agent-dev' | 'e2e-core'>('agent-dev')
  const [busy, setBusy] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(pickActiveRunId(initialRuns))
  const [events, setEvents] = useState<LiveEvent[]>([])
  const [eventsAfter, setEventsAfter] = useState(0)
  const [liveCounters, setLiveCounters] = useState({ passed: 0, failed: 0, skipped: 0 })
  const [currentCase, setCurrentCase] = useState<string>('')
  const [currentPassos, setCurrentPassos] = useState<string>('')
  const [detailOpen, setDetailOpen] = useState(true)

  const refreshList = useCallback(async () => {
    const res = await fetch('/api/testes/runs', { cache: 'no-store' })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Falha ao listar')
    const list = (data.runs || []) as RunRow[]
    setRuns(list)
    setEnabled(Boolean(data.runnerEnabled))
    setActiveId((prev) => {
      if (prev && list.some((r) => r.id === prev && (r.status === 'running' || r.status === 'queued'))) {
        return prev
      }
      return pickActiveRunId(list)
    })
    return data as { runs: RunRow[]; active: boolean; runnerEnabled: boolean }
  }, [])

  const pollActive = useCallback(async (id: string, after: number) => {
    const res = await fetch(`/api/testes/runs/${id}?after=${after}`, { cache: 'no-store' })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Falha ao obter run')

    if (data.events?.length) {
      setEvents((prev) => [...prev, ...data.events])
      for (const ev of data.events as LiveEvent[]) {
        if (ev.type === 'test_start') {
          setCurrentCase(eventHeadline(ev))
          setCurrentPassos(ev.passos || '')
        }
        if (ev.type === 'test_end') {
          setLiveCounters({
            passed: ev.passed ?? 0,
            failed: ev.failed ?? 0,
            skipped: ev.skipped ?? 0,
          })
        }
      }
    }
    setEventsAfter(data.eventsTotal ?? after)

    if (data.run) {
      setRuns((prev) => {
        const others = prev.filter((r) => r.id !== data.run.id)
        return [data.run, ...others]
      })
    }

    const done =
      ['passed', 'failed', 'error', 'cancelled'].includes(data.run?.status) ||
      Boolean(data.stale) ||
      (data.run?.status === 'running' &&
        !data.live &&
        isRunStaleClient(data.run.started_at, data.run.status))
    return { done, eventsTotal: data.eventsTotal as number }
  }, [])

  useEffect(() => {
    refreshList().catch(() => {})
  }, [refreshList])

  useEffect(() => {
    if (!activeId) return
    let cancelled = false
    let after = eventsAfter

    const tick = async () => {
      try {
        const { done, eventsTotal } = await pollActive(activeId, after)
        after = eventsTotal
        if (cancelled) return
        if (done) {
          setActiveId(null)
          setBusy(false)
          setCancelling(false)
          await refreshList()
          return
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Erro no polling')
      }
      if (!cancelled) timer = setTimeout(tick, 1000)
    }

    let timer = setTimeout(tick, 400)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restart only when activeId changes
  }, [activeId, pollActive, refreshList])

  async function startRun() {
    setError(null)
    setBusy(true)
    setDetailOpen(true)
    setEvents([])
    setEventsAfter(0)
    setLiveCounters({ passed: 0, failed: 0, skipped: 0 })
    setCurrentCase('Iniciando suíte…')
    setCurrentPassos('')
    try {
      const res = await fetch('/api/testes/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headed, suite }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Falha ao iniciar')
      setActiveId(data.id)
      await refreshList()
    } catch (e) {
      setBusy(false)
      setError(e instanceof Error ? e.message : 'Falha ao iniciar')
    }
  }

  async function cancelRun() {
    if (!activeId) return
    setCancelling(true)
    setError(null)
    try {
      const res = await fetch(`/api/testes/runs/${activeId}/cancel`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Falha ao cancelar')
      setCurrentCase('Cancelado pelo usuário')
      setCurrentPassos('')
      await refreshList()
      setActiveId(null)
      setBusy(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao cancelar')
    } finally {
      setCancelling(false)
    }
  }

  const activeRun = useMemo(
    () => runs.find((r) => r.id === activeId) || null,
    [runs, activeId],
  )
  const isLive =
    Boolean(activeId) &&
    (busy || activeRun?.status === 'running' || activeRun?.status === 'queued')

  return (
    <div className="space-y-8 pb-24 font-sans">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <p className="text-sm text-gray-500 max-w-2xl">
          Dispare a suíte do operador (Playwright), acompanhe o andamento e consulte relatórios HTML.
          Disponível apenas para superadmin RN3 em ambiente local/self-hosted.
        </p>
        <button
          type="button"
          onClick={() => refreshList().catch((e) => setError(e.message))}
          className="flex items-center gap-2 px-3 py-2 rounded-xl border border-[#ffffff12] text-gray-400 hover:text-white text-xs font-bold uppercase tracking-widest"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Atualizar
        </button>
      </div>

      {!enabled && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Runner desabilitado. Defina <code className="text-amber-100">TEST_RUNNER_ENABLED=true</code> no
          ambiente do servidor (DEV local). O histórico abaixo continua consultável.
        </div>
      )}

      <div className="rounded-2xl border border-[#ffffff0a] bg-[#111111] p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-4 justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Suite</p>
            <select
              value={suite}
              onChange={(e) => setSuite(e.target.value as 'agent-dev' | 'e2e-core')}
              disabled={isLive}
              className="mt-1 bg-[#0A0A0A] border border-[#ffffff14] text-white text-sm font-bold rounded-lg px-3 py-2 outline-none focus:border-[#2BAADF]/50 disabled:opacity-50"
            >
              <option value="agent-dev">Fase 1 — Agente (scripts + UI)</option>
              <option value="e2e-core">Só UI (e2e-core)</option>
            </select>
            <p className="text-xs text-gray-500 mt-1 max-w-sm">
              {suite === 'agent-dev'
                ? 'SCR-INFRA/AUTH + login, menu, Omni, Funil, hub do card e chat.'
                : 'Apenas Playwright: login, menu, Omni, Funil, hub e chat.'}
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={headed}
              onChange={(e) => setHeaded(e.target.checked)}
              className="rounded border-gray-600"
              disabled={isLive}
            />
            Mostrar browser (mesma máquina do servidor)
          </label>
          <div className="flex items-center gap-2">
            {isLive && (
              <button
                type="button"
                onClick={cancelRun}
                disabled={cancelling}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 text-xs font-black uppercase tracking-widest hover:bg-red-500/25 disabled:opacity-40"
              >
                {cancelling ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Square className="w-3.5 h-3.5 fill-current" />
                )}
                Cancelar
              </button>
            )}
            <button
              type="button"
              onClick={startRun}
              disabled={!enabled || isLive}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#2BAADF] text-white text-xs font-black uppercase tracking-widest disabled:opacity-40 hover:bg-[#1A8FBF] transition-colors"
            >
              {isLive ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              Rodar {suite === 'agent-dev' ? 'Fase 1' : 'núcleo'}
            </button>
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-400 border border-red-500/20 rounded-lg px-3 py-2 bg-red-500/5">
            {error}
          </p>
        )}

        {(activeId || events.length > 0) && detailOpen && (
          <div className="rounded-xl border border-[#2BAADF]/20 bg-[#0A0A0A] p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-wrap gap-3 text-xs font-bold uppercase tracking-widest min-w-0">
                <span className="text-[#2BAADF]">{isLive ? 'Em andamento' : 'Última execução'}</span>
                <span className="text-emerald-400">Passou {liveCounters.passed}</span>
                <span className="text-red-400">Falhou {liveCounters.failed}</span>
                <span className="text-gray-500">Pulou {liveCounters.skipped}</span>
              </div>
              <button
                type="button"
                onClick={() => setDetailOpen(false)}
                title="Fechar detalhe"
                aria-label="Fechar detalhe da execução"
                className="shrink-0 p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-[#ffffff10] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {currentCase && (
              <div>
                <p className="text-sm text-white font-medium">{currentCase}</p>
                {currentPassos ? (
                  <p className="text-xs text-gray-500 mt-1 leading-relaxed">{currentPassos}</p>
                ) : null}
              </div>
            )}
            <div className="max-h-64 overflow-y-auto custom-scrollbar space-y-2 text-[12px]">
              {events.map((ev, i) => {
                if (ev.type === 'test_start') {
                  return (
                    <div key={`${ev.ts}-${i}`} className="border-l-2 border-[#ffffff12] pl-3 py-1">
                      <p className="text-gray-300 font-medium">{eventHeadline(ev)}</p>
                      {ev.passos ? (
                        <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">{ev.passos}</p>
                      ) : null}
                    </div>
                  )
                }
                if (ev.type === 'test_end') {
                  const ok = ev.status === 'passed'
                  const skip = ev.status === 'skipped'
                  return (
                    <div
                      key={`${ev.ts}-${i}`}
                      className={`pl-3 py-0.5 text-[11px] font-bold ${
                        ok ? 'text-emerald-400' : skip ? 'text-gray-500' : 'text-red-400'
                      }`}
                    >
                      {ok ? '✓ passou' : skip ? '⊘ pulou' : '✗ falhou'} · {ev.id}
                      {ev.error ? ` — ${ev.error}` : ''}
                    </div>
                  )
                }
                if (ev.type === 'run_start' || ev.type === 'run_end' || ev.type === 'log') {
                  return (
                    <p key={`${ev.ts}-${i}`} className="text-[#2BAADF] text-[11px] font-medium">
                      {ev.message}
                    </p>
                  )
                }
                return null
              })}
              {!events.length && <span className="text-gray-600 text-xs">Aguardando eventos…</span>}
            </div>
          </div>
        )}
      </div>

      <div>
        <h2 className="text-sm font-black uppercase tracking-widest text-gray-500 mb-3">Histórico</h2>
        <div className="rounded-2xl border border-[#ffffff0a] overflow-hidden bg-[#111111]">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-widest text-gray-500 border-b border-[#ffffff08]">
                <th className="text-left px-4 py-3 font-bold">Quando</th>
                <th className="text-left px-4 py-3 font-bold">Status</th>
                <th className="text-left px-4 py-3 font-bold">Resultado</th>
                <th className="text-left px-4 py-3 font-bold">Commit</th>
                <th className="text-right px-4 py-3 font-bold">Relatório</th>
              </tr>
            </thead>
            <tbody>
              {runs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-600 italic">
                    Nenhuma execução ainda.
                  </td>
                </tr>
              )}
              {runs.map((run) => (
                <tr key={run.id} className="border-b border-[#ffffff05] hover:bg-[#ffffff03]">
                  <td className="px-4 py-3 text-gray-300 whitespace-nowrap">
                    <Link href={`/cockpit/testes/${run.id}`} className="hover:text-[#2BAADF]">
                      {formatWhen(run.started_at)}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-md border text-[10px] font-black uppercase tracking-wider ${statusBadge(run.status)}`}
                    >
                      {run.status}
                    </span>
                    {run.headed && (
                      <span className="ml-2 text-[9px] text-gray-500 uppercase font-bold">headed</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-400">
                    <span className="text-emerald-400">{run.passed}</span>
                    {' / '}
                    <span className="text-red-400">{run.failed}</span>
                    {' / '}
                    <span>{run.skipped}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                    {run.commit_sha || '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {['passed', 'failed'].includes(run.status) ? (
                      <a
                        href={`/api/testes/runs/${run.id}/report`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[#2BAADF] hover:underline text-xs font-bold"
                      >
                        HTML <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      <span className="text-gray-600 text-xs">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
