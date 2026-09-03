import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { isRn3SuperAdmin } from '@/utils/permissions'
import { createClient } from '@/utils/supabase/server'
import { catalogEntry, humanExpectation, humanPassos } from '@/lib/testes/catalog'

export const dynamic = 'force-dynamic'

export default async function TesteRunPage(props: { params: Promise<{ runId: string }> }) {
  const me = await getMyProfile()
  if (!isRn3SuperAdmin(me)) redirect('/cockpit/acesso-negado')

  const { runId } = await props.params
  const supabase = await createClient()
  const { data: run } = await supabase.from('test_runs').select('*').eq('id', runId).maybeSingle()
  if (!run) notFound()

  const cases = (run.summary_json as any)?.cases as
    | Array<{
        id: string
        title: string
        status: string
        error?: string
        durationMs?: number
        area?: string
        expectation?: string
        passos?: string
      }>
    | undefined

  return (
    <div className="space-y-6 pb-20 font-sans max-w-4xl">
      <Link
        href="/cockpit/testes"
        className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-500 hover:text-[#2BAADF]"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Voltar
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-white">Execução {run.id.slice(0, 8)}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {new Date(run.started_at).toLocaleString('pt-BR')} · {run.suite}
            {run.headed ? ' · headed' : ''}
          </p>
        </div>
        {['passed', 'failed'].includes(run.status) && (
          <a
            href={`/api/testes/runs/${run.id}/report`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#2BAADF]/15 border border-[#2BAADF]/30 text-[#2BAADF] text-xs font-black uppercase tracking-widest"
          >
            Abrir HTML <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-[#ffffff0a] bg-[#111] p-3">
          <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">Status</p>
          <p className="text-white font-bold mt-1">{run.status}</p>
        </div>
        <div className="rounded-xl border border-[#ffffff0a] bg-[#111] p-3">
          <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">Passou</p>
          <p className="text-emerald-400 font-bold mt-1">{run.passed}</p>
        </div>
        <div className="rounded-xl border border-[#ffffff0a] bg-[#111] p-3">
          <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">Falhou</p>
          <p className="text-red-400 font-bold mt-1">{run.failed}</p>
        </div>
        <div className="rounded-xl border border-[#ffffff0a] bg-[#111] p-3">
          <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">Commit</p>
          <p className="text-gray-300 font-mono text-sm mt-1">{run.commit_sha || '—'}</p>
        </div>
      </div>

      {run.error_message && (
        <p className="text-sm text-red-400 border border-red-500/20 rounded-lg px-3 py-2 bg-red-500/5">
          {run.error_message}
        </p>
      )}

      {cases?.length ? (
        <div className="rounded-2xl border border-[#ffffff0a] overflow-hidden divide-y divide-[#ffffff08]">
          {cases.map((c) => {
            const entry = catalogEntry(c.id) || catalogEntry(c.title)
            const expectation = c.expectation || (entry ? humanExpectation(c.id) : c.title)
            const passos = c.passos || (entry ? humanPassos(c.id) : '')
            const area = c.area || entry?.area
            return (
              <div key={c.id + c.title} className="px-4 py-3">
                <div className="flex flex-wrap items-baseline gap-2 justify-between">
                  <p className="text-sm font-semibold text-white">{expectation}</p>
                  <span className="text-[10px] font-black uppercase tracking-wider text-gray-500">
                    {c.status}
                    {typeof c.durationMs === 'number' ? ` · ${(c.durationMs / 1000).toFixed(1)}s` : ''}
                  </span>
                </div>
                <p className="text-[10px] font-mono text-[#2BAADF] mt-1">
                  {c.id}
                  {area ? ` · ${area}` : ''}
                </p>
                {passos ? <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{passos}</p> : null}
                {c.error ? <p className="text-xs text-red-400 mt-1">{c.error}</p> : null}
              </div>
            )
          })}
        </div>
      ) : (
        <p className="text-sm text-gray-600 italic">Resumo detalhado indisponível para esta execução.</p>
      )}
    </div>
  )
}
