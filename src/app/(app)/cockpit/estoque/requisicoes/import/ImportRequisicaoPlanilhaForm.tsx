'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  FileSpreadsheet,
  Upload,
  Download,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Send,
  Layers,
} from 'lucide-react'
import {
  previewRequisicaoPlanilhaAction,
  efetivarRequisicaoPlanilhaAction,
} from '../import-actions'
import type { PlanilhaAdapterMeta } from '@/lib/estoque/requisicao-planilha/types'
import type { RequisicaoPlanilhaGrupoPreview } from '@/lib/estoque/requisicao-planilha/types'
import {
  buildModeloRequisicaoXlsx,
  isPlanilhaFileName,
  planilhaBufferToCsv,
} from '@/lib/estoque/requisicao-planilha/xlsx-io'

interface Props {
  adapters: PlanilhaAdapterMeta[]
  /** est_config.req_planilha_auto_atender — recebe + baixa na efetivação */
  planilhaAutoAtender?: boolean
}

export default function ImportRequisicaoPlanilhaForm({
  adapters,
  planilhaAutoAtender = false,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const defaultAdapter = adapters[0]?.codigo || 'hugin_padrao'
  const [adapter, setAdapter] = useState(defaultAdapter)
  const [csvRaw, setCsvRaw] = useState('')
  const [fileName, setFileName] = useState('')
  const [grupos, setGrupos] = useState<RequisicaoPlanilhaGrupoPreview[]>([])
  const [avisos, setAvisos] = useState<string[]>([])
  const [resumo, setResumo] = useState<{
    totalLinhas: number
    gruposOk: number
    linhasComErro: number
  } | null>(null)
  const [enviarImediatamente, setEnviarImediatamente] = useState(true)
  const [feedback, setFeedback] = useState<{
    tipo: 'sucesso' | 'erro' | 'alerta'
    texto: string
  } | null>(null)

  const adapterMeta = useMemo(
    () => adapters.find((a) => a.codigo === adapter),
    [adapters, adapter]
  )

  function downloadTemplate() {
    const buf = buildModeloRequisicaoXlsx()
    const blob = new Blob([buf], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'modelo_requisicao_huginflow.xlsx'
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!isPlanilhaFileName(file.name)) {
      setFeedback({
        tipo: 'erro',
        texto: 'Formato inválido. Use .xlsx, .xls ou .csv.',
      })
      return
    }
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const buffer = reader.result as ArrayBuffer
        const text = planilhaBufferToCsv(buffer, file.name)
        setCsvRaw(text)
        setGrupos([])
        setResumo(null)
        setFeedback(null)
      } catch (err) {
        setFeedback({
          tipo: 'erro',
          texto:
            err instanceof Error
              ? `Falha ao ler planilha: ${err.message}`
              : 'Falha ao ler planilha.',
        })
        setCsvRaw('')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  function handleValidar() {
    if (!csvRaw.trim()) {
      setFeedback({ tipo: 'erro', texto: 'Selecione um arquivo CSV/planilha.' })
      return
    }
    startTransition(async () => {
      const res = await previewRequisicaoPlanilhaAction({
        csv_content: csvRaw,
        adapter,
      })
      if ('error' in res && res.error) {
        setFeedback({ tipo: 'erro', texto: res.error })
        setGrupos([])
        setResumo(null)
        return
      }
      setGrupos(res.grupos || [])
      setAvisos(res.avisos || [])
      setResumo(res.resumo || null)
      setFeedback({
        tipo: (res.resumo?.linhasComErro || 0) > 0 ? 'alerta' : 'sucesso',
        texto: `Pré-visualização: ${res.resumo?.totalLinhas || 0} linha(s), ${res.resumo?.gruposOk || 0} requisição(ões) prontas${
          res.resumo?.linhasComErro
            ? `, ${res.resumo.linhasComErro} com erro`
            : ''
        }.`,
      })
    })
  }

  function handleEfetivar() {
    if (!csvRaw.trim() || !grupos.length) {
      setFeedback({ tipo: 'erro', texto: 'Valide a planilha antes de efetivar.' })
      return
    }
    startTransition(async () => {
      const res = await efetivarRequisicaoPlanilhaAction({
        csv_content: csvRaw,
        adapter,
        enviar_imediatamente: enviarImediatamente,
      })
      if ('error' in res && res.error) {
        setFeedback({ tipo: 'erro', texto: res.error })
        return
      }
      const extras =
        Array.isArray(res.avisosAtendimento) && res.avisosAtendimento.length
          ? ` ${res.avisosAtendimento.slice(0, 3).join(' ')}`
          : ''
      setFeedback({
        tipo: res.avisosAtendimento?.length ? 'alerta' : 'sucesso',
        texto: `${res.mensagem || 'Requisições criadas.'}${extras}`,
      })
      setTimeout(() => router.push('/cockpit/estoque/requisicoes'), 1400)
    })
  }

  const podeEfetivar =
    Boolean(resumo && resumo.gruposOk > 0) &&
    grupos.some((g) => !g.erro_cabecalho && g.itens.some((i) => !i.erro))

  return (
    <div className="space-y-6">
      {feedback && (
        <div
          className={`rounded-xl border px-4 py-3 text-xs flex items-start gap-2 ${
            feedback.tipo === 'sucesso'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
              : feedback.tipo === 'alerta'
                ? 'border-amber-500/30 bg-amber-500/10 text-amber-100'
                : 'border-red-500/30 bg-red-500/10 text-red-200'
          }`}
        >
          {feedback.tipo === 'sucesso' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
          ) : feedback.tipo === 'alerta' ? (
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          ) : (
            <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
          )}
          <span>{feedback.texto}</span>
        </div>
      )}

      <div className="bg-[#111111] border border-[#ffffff0a] rounded-2xl p-6 space-y-4">
        <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4 text-purple-400" />
          1. Formato e arquivo
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
          <div>
            <label className="text-xs text-gray-300 font-medium block mb-1.5">
              Formato da planilha
            </label>
            <select
              value={adapter}
              onChange={(e) => {
                setAdapter(e.target.value as typeof adapter)
                setGrupos([])
                setResumo(null)
              }}
              className="w-full bg-[#0A0A0A] border border-[#ffffff15] rounded-xl px-3 py-2 text-xs text-white h-9"
            >
              {adapters.map((a) => (
                <option key={a.codigo} value={a.codigo}>
                  {a.label}
                </option>
              ))}
            </select>
            {adapterMeta && (
              <p className="text-[10px] text-gray-500 mt-1">{adapterMeta.hint}</p>
            )}
          </div>

          <div>
            <label className="text-xs text-gray-300 font-medium block mb-1.5">
              Modelo
            </label>
            <button
              type="button"
              onClick={downloadTemplate}
              className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-[#ffffff15] px-4 text-xs text-gray-300 hover:bg-[#ffffff08]"
            >
              <Download className="h-3.5 w-3.5" />
              Baixar modelo padrão Hugin (.xlsx)
            </button>
          </div>
        </div>

        <label className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[#ffffff20] bg-[#0A0A0A] px-4 py-8 cursor-pointer hover:border-purple-500/40 transition">
          <Upload className="h-6 w-6 text-purple-400" />
          <span className="text-xs text-gray-300">
            {fileName || 'Selecionar .xlsx, .xls ou .csv (modelo padrão Hugin)'}
          </span>
          <input
            type="file"
            accept=".xlsx,.xls,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
            className="hidden"
            onChange={handleFile}
          />
        </label>

        {csvRaw && (
          <textarea
            readOnly
            value={csvRaw.slice(0, 4000)}
            className="w-full h-28 bg-[#0A0A0A] border border-[#ffffff10] rounded-xl p-3 text-[10px] font-mono text-gray-400"
          />
        )}

        <div
          className={`rounded-xl border px-3 py-2.5 text-[11px] leading-relaxed ${
            planilhaAutoAtender
              ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-100'
              : 'border-[#ffffff10] bg-[#0A0A0A] text-gray-400'
          }`}
        >
          {planilhaAutoAtender ? (
            <>
              <span className="font-semibold text-emerald-200">
                Modo ativo: receber e baixar na hora.
              </span>{' '}
              Ao efetivar, a requisição é liberada e o estoque é baixado no local padrão.
              Sem saldo suficiente, baixa o disponível e fica{' '}
              <span className="text-white">parcialmente atendida</span> (pendência em aberto).
              Alterar em Estoque → Configuração.
            </>
          ) : (
            <>
              <span className="font-semibold text-gray-300">
                Modo ativo: apenas receber.
              </span>{' '}
              A importação cria a requisição e aguarda aprovação/baixa manual. Para baixar na
              hora, ative em Estoque → Configuração → Importação por planilha.
            </>
          )}
        </div>

        {!planilhaAutoAtender && (
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-xs text-gray-400">
              <input
                type="checkbox"
                checked={enviarImediatamente}
                onChange={(e) => setEnviarImediatamente(e.target.checked)}
                className="rounded border-gray-600"
              />
              Enviar imediatamente (aprovação / auto-aprovação conforme config)
            </label>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleValidar}
            disabled={isPending || !csvRaw}
            className="inline-flex items-center gap-2 rounded-xl bg-[#ffffff10] px-4 py-2 text-xs font-semibold text-white disabled:opacity-40"
          >
            {isPending ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Layers className="h-3.5 w-3.5" />}
            Validar planilha
          </button>
          <button
            type="button"
            onClick={handleEfetivar}
            disabled={isPending || !podeEfetivar}
            className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40"
          >
            {isPending ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Efetivar importação
          </button>
          <Link
            href="/cockpit/estoque/requisicoes"
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs text-gray-400 hover:text-white"
          >
            Cancelar
          </Link>
        </div>
      </div>

      {avisos.length > 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-[11px] text-amber-100 space-y-1">
          {avisos.map((a, i) => (
            <p key={i}>• {a}</p>
          ))}
        </div>
      )}

      {grupos.length > 0 && (
        <div className="bg-[#111111] border border-[#ffffff0a] rounded-2xl p-6 space-y-4">
          <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
            2. Pré-visualização ({grupos.length} grupo(s) / requisitante)
          </h3>
          <div className="space-y-4">
            {grupos.map((g) => (
              <div
                key={g.requisitante_documento + (g.requisitante_pessoa_id || '')}
                className={`rounded-xl border p-4 ${
                  g.erro_cabecalho
                    ? 'border-red-500/25 bg-red-500/5'
                    : 'border-[#ffffff10] bg-[#0A0A0A]'
                }`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                  <div>
                    <p className="text-sm text-white font-medium">
                      {g.requisitante_nome ||
                        g.requisitante_nome_origem ||
                        'Requisitante não encontrado'}
                    </p>
                    <p className="text-[10px] font-mono text-gray-500">
                      Doc: {g.requisitante_documento}
                      {g.requisitante_nome_origem
                        ? ` · Origem: ${g.requisitante_nome_origem}`
                        : ''}
                    </p>
                    {(g.codigo_origem || g.sistema_origem) && (
                      <p className="text-[10px] font-mono text-purple-300/90 mt-0.5">
                        {g.sistema_origem || '—'}/{g.codigo_origem || '—'}
                        {g.ja_existe ? ` · já existe (${g.numero_existente})` : ''}
                      </p>
                    )}
                  </div>
                  {g.erro_cabecalho && (
                    <p className="text-[11px] text-red-300">{g.erro_cabecalho}</p>
                  )}
                </div>
                {g.observacao && (
                  <p className="text-[10px] text-gray-500 mb-2">Obs: {g.observacao}</p>
                )}
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-gray-500 text-left border-b border-[#ffffff08]">
                      <th className="py-1 pr-2">Linha</th>
                      <th className="py-1 pr-2">SKU</th>
                      <th className="py-1 pr-2">Qtd</th>
                      <th className="py-1">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.itens.map((it) => (
                      <tr key={it.linha} className="border-b border-[#ffffff05]">
                        <td className="py-1.5 pr-2 text-gray-400">{it.linha}</td>
                        <td className="py-1.5 pr-2 text-white">
                          <span className="font-mono">{it.sku_codigo}</span>
                          {it.sku_nome ? (
                            <span className="text-gray-500"> — {it.sku_nome}</span>
                          ) : null}
                        </td>
                        <td className="py-1.5 pr-2 text-white">{it.quantidade}</td>
                        <td className="py-1.5">
                          {it.erro ? (
                            <span className="text-red-300">{it.erro}</span>
                          ) : (
                            <span className="text-emerald-400">OK</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
