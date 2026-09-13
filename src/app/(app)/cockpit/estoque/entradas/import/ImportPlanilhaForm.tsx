'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  FileSpreadsheet,
  Building2,
  Calendar,
  CheckCircle2,
  Download,
  FileText,
  MapPin,
  RefreshCw,
  Upload,
  AlertTriangle,
  XCircle,
} from 'lucide-react'
import SearchableSelect from '@/components/SearchableSelect'
import {
  criarEntradaPlanilhaAction,
  validarEntradaPreviewAction,
} from '../actions'
import type { ItemEntradaInput, ItemEntradaValidado } from '@/lib/estoque/tipos'

interface SkuOption {
  id: string
  codigo: string
  nome: string
  unidade_estoque: string
}

interface FornecedorOption {
  id: string
  nome: string
  documento?: string | null
}

interface LocalOption {
  id: string
  codigo: string
  nome: string
  eh_principal: boolean
}

interface Props {
  fornecedores: FornecedorOption[]
  locais: LocalOption[]
  skus: SkuOption[]
  defaultLocalId?: string
}

export default function ImportPlanilhaForm({
  fornecedores,
  locais,
  skus,
  defaultLocalId,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Cabeçalho
  const [pessoaId, setPessoaId] = useState('')
  const [localId, setLocalId] = useState(defaultLocalId || (locais[0]?.id ?? ''))
  const [documento, setDocumento] = useState('')
  const [movimentoEm, setMovimentoEm] = useState(
    new Date().toISOString().split('T')[0]
  )
  const [observacao, setObservacao] = useState('')

  // CSV
  const [csvRaw, setCsvRaw] = useState('')
  const [fileName, setFileName] = useState('')

  // Itens parseados e validados
  const [parsedItens, setParsedItens] = useState<ItemEntradaInput[]>([])
  const [validacaoItens, setValidacaoItens] = useState<ItemEntradaValidado[]>([])

  // Feedback
  const [feedback, setFeedback] = useState<{
    tipo: 'sucesso' | 'erro' | 'alerta'
    texto: string
  } | null>(null)

  function downloadCsvTemplate() {
    const csvContent =
      'codigo_item,unidade_origem,quantidade,justificativa\n' +
      'COD-FORNECEDOR-01,CX,10,Recebimento da ordem de compra\n' +
      'LUVA-M,UN,50,Reposição de estoque\n'

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', 'modelo_entrada_estoque.csv')
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      setCsvRaw(text)
      parseCsvText(text)
    }
    reader.readAsText(file)
  }

  function parseCsvText(raw: string) {
    if (!raw.trim()) {
      setParsedItens([])
      setValidacaoItens([])
      return
    }

    const lines = raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0)

    if (lines.length === 0) return

    // Detecta separador (, ou ;)
    const firstLine = lines[0]
    const separator = firstLine.includes(';') ? ';' : ','

    // Checa se primeira linha é cabeçalho
    const hasHeader =
      firstLine.toLowerCase().includes('codigo') ||
      firstLine.toLowerCase().includes('item') ||
      firstLine.toLowerCase().includes('quantidade')

    const dataLines = hasHeader ? lines.slice(1) : lines

    const skuMapByCode: Record<string, string> = {}
    skus.forEach((s) => {
      skuMapByCode[s.codigo.toUpperCase()] = s.id
    })

    const items: ItemEntradaInput[] = []

    dataLines.forEach((line, index) => {
      const cols = line.split(separator).map((c) => c.replace(/^["']|["']$/g, '').trim())
      if (cols.length < 2) return

      const codigoRaw = cols[0] || ''
      const unidadeOrigem = cols[1]?.toUpperCase() || 'UN'
      const qtdRaw = cols[2] ? cols[2].replace(',', '.') : '0'
      const justificativa = cols[3] || 'Importação via planilha'

      // Se o código bater diretamente com um SKU cadastrado, usa o sku_id, senão trata como codigo_parceiro
      const matchedSkuId = skuMapByCode[codigoRaw.toUpperCase()]

      items.push({
        linha: index + 1,
        sku_id: matchedSkuId || null,
        codigo_parceiro: matchedSkuId ? null : codigoRaw,
        unidade_origem: unidadeOrigem,
        quantidade_origem: parseFloat(qtdRaw) || 0,
        justificativa,
      })
    })

    setParsedItens(items)
    setValidacaoItens([])
    setFeedback({
      tipo: 'alerta',
      texto: `${items.length} linha(s) lida(s) da planilha. Clique em "Validar Planilha" para verificar antes de efetivar.`,
    })
  }

  async function handleValidar() {
    if (!pessoaId) {
      setFeedback({ tipo: 'erro', texto: 'Selecione o Fornecedor no cabeçalho.' })
      return
    }
    if (!localId) {
      setFeedback({ tipo: 'erro', texto: 'Selecione o Local de destino no cabeçalho.' })
      return
    }
    if (parsedItens.length === 0) {
      setFeedback({ tipo: 'erro', texto: 'Nenhum item encontrado na planilha.' })
      return
    }

    setFeedback(null)

    const res = await validarEntradaPreviewAction({
      pessoa_id: pessoaId,
      local_id: localId,
      origem: 'planilha',
      documento,
      observacao,
      itens: parsedItens,
    })

    if ('error' in res && res.error) {
      setFeedback({ tipo: 'erro', texto: res.error })
      return
    }

    if (res.validacao) {
      setValidacaoItens(res.validacao.itens)
      const { statusSugerido, totalItens, itensValidos, itensComErro, erroResumo } =
        res.validacao

      if (statusSugerido === 'concluido') {
        setFeedback({
          tipo: 'sucesso',
          texto: `Excelente! Todos os ${totalItens} itens da planilha estão válidos e prontos para entrada.`,
        })
      } else if (statusSugerido === 'parcial') {
        setFeedback({
          tipo: 'alerta',
          texto: `${itensValidos} de ${totalItens} itens válidos. Os ${itensComErro} itens com erro não serão estocados.`,
        })
      } else {
        setFeedback({
          tipo: 'erro',
          texto: erroResumo || 'Todos os itens da planilha apresentaram erros de validação.',
        })
      }
    }
  }

  function handleEfetivar() {
    if (!pessoaId) {
      setFeedback({ tipo: 'erro', texto: 'Selecione o Fornecedor no cabeçalho.' })
      return
    }
    if (!localId) {
      setFeedback({ tipo: 'erro', texto: 'Selecione o Local de destino no cabeçalho.' })
      return
    }
    if (parsedItens.length === 0) {
      setFeedback({ tipo: 'erro', texto: 'Nenhum item na planilha para efetivar.' })
      return
    }

    setFeedback(null)
    startTransition(async () => {
      const res = await criarEntradaPlanilhaAction({
        pessoa_id: pessoaId,
        local_id: localId,
        documento,
        observacao,
        movimento_em: movimentoEm ? new Date(movimentoEm).toISOString() : undefined,
        itens: parsedItens,
      })

      if ('error' in res) {
        setFeedback({ tipo: 'erro', texto: res.error || 'Erro desconhecido.' })
        return
      }

      if (res.sucesso && res.loteId) {
        router.push(`/cockpit/estoque/entradas/${res.loteId}`)
      } else {
        setFeedback({
          tipo: 'erro',
          texto: res.mensagem || 'Falha ao efetivar lote da planilha.',
        })
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Feedback banner */}
      {feedback && (
        <div
          className={`p-4 rounded-xl text-xs flex items-start gap-3 border animate-in fade-in duration-300 ${
            feedback.tipo === 'sucesso'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              : feedback.tipo === 'alerta'
              ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
              : 'bg-red-500/10 border-red-500/20 text-red-400'
          }`}
        >
          {feedback.tipo === 'sucesso' && <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />}
          {feedback.tipo === 'alerta' && <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />}
          {feedback.tipo === 'erro' && <XCircle className="h-4 w-4 shrink-0 mt-0.5" />}
          <div>{feedback.texto}</div>
        </div>
      )}

      {/* Bloco 1: Cabeçalho */}
      <div className="bg-[#121820] border border-[#ffffff0a] rounded-2xl p-5 space-y-4 shadow-xl">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2 border-b border-[#ffffff08] pb-3">
          <FileText className="h-4 w-4 text-blue-400" />
          Cabeçalho da Importação
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1 flex items-center gap-1">
              <Building2 className="h-3 w-3 text-gray-400" />
              Fornecedor <span className="text-red-400">*</span>
            </label>
            <SearchableSelect
              value={pessoaId}
              onChange={setPessoaId}
              placeholder="Buscar fornecedor…"
              emptyLabel="Nenhum fornecedor encontrado"
              options={fornecedores.map((f) => ({
                value: f.id,
                label: f.documento ? `${f.nome} (${f.documento})` : f.nome,
                searchText: `${f.nome} ${f.documento || ''}`,
              }))}
              inputClassName="w-full bg-[#0d1218] border border-[#ffffff10] rounded-xl pl-8 pr-8 py-2 text-xs text-white focus:outline-none focus:border-blue-500/50"
            />
            <p className="text-[10px] text-gray-500 mt-1">
              {fornecedores.length === 0
                ? 'Nenhum fornecedor encontrado. Cadastre em Cadastros → Pessoas com o papel Fornecedor.'
                : 'Somente pessoas com papel Fornecedor.'}
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1 flex items-center gap-1">
              <MapPin className="h-3 w-3 text-gray-400" />
              Local de Estoque <span className="text-red-400">*</span>
            </label>
            <select
              value={localId}
              onChange={(e) => setLocalId(e.target.value)}
              className="w-full bg-[#0d1218] border border-[#ffffff10] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500/50"
            >
              {locais.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.codigo} - {l.nome} {l.eh_principal ? '★ (Principal)' : ''}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-gray-500 mt-1">
              Local onde a mercadoria será estocada.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">
                Nº Documento / NF
              </label>
              <input
                type="text"
                value={documento}
                onChange={(e) => setDocumento(e.target.value)}
                placeholder="Ex: NF 9081"
                className="w-full bg-[#0d1218] border border-[#ffffff10] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500/50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1 flex items-center gap-1">
                <Calendar className="h-3 w-3 text-gray-400" />
                Data
              </label>
              <input
                type="date"
                value={movimentoEm}
                onChange={(e) => setMovimentoEm(e.target.value)}
                className="w-full bg-[#0d1218] border border-[#ffffff10] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500/50"
              />
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-300 mb-1">
            Observação Geral do Lote
          </label>
          <input
            type="text"
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="Ex: Importação semanal de reposição via planilha"
            className="w-full bg-[#0d1218] border border-[#ffffff10] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500/50"
          />
        </div>
      </div>

      {/* Bloco 2: Upload ou Colar Planilha */}
      <div className="bg-[#121820] border border-[#ffffff0a] rounded-2xl p-5 space-y-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-[#ffffff08] pb-3">
          <div>
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-blue-400" />
              Arquivo CSV ou Dados da Planilha
            </h2>
            <p className="text-[11px] text-gray-400 mt-0.5">
              Colunas esperadas: <code>codigo_item</code>, <code>unidade_origem</code>, <code>quantidade</code>, <code>justificativa</code>.
            </p>
          </div>

          <button
            type="button"
            onClick={downloadCsvTemplate}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 rounded-xl transition-all"
          >
            <Download className="h-3.5 w-3.5" />
            Baixar Modelo CSV
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Upload de Arquivo */}
          <div className="border-2 border-dashed border-[#ffffff15] hover:border-blue-500/40 rounded-xl p-6 text-center flex flex-col items-center justify-center transition-colors">
            <Upload className="h-8 w-8 text-blue-400 mb-2 opacity-80" />
            <label className="cursor-pointer">
              <span className="text-xs font-semibold text-white hover:text-blue-400 underline">
                Clique para selecionar o arquivo CSV
              </span>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
            <span className="text-[10px] text-gray-500 mt-1 block">
              {fileName || 'Arquivos .CSV separados por vírgula ou ponto-e-vírgula'}
            </span>
          </div>

          {/* Colar dados CSV */}
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">
              Ou cole o conteúdo CSV abaixo:
            </label>
            <textarea
              rows={4}
              value={csvRaw}
              onChange={(e) => {
                setCsvRaw(e.target.value)
                parseCsvText(e.target.value)
              }}
              placeholder="codigo_item,unidade_origem,quantidade,justificativa&#10;COD-01,CX,10,Reposicao&#10;LUVA-M,UN,50,Reposicao"
              className="w-full bg-[#0d1218] border border-[#ffffff10] rounded-xl p-2.5 text-xs text-white font-mono focus:outline-none focus:border-blue-500/50"
            />
          </div>
        </div>
      </div>

      {/* Bloco 3: Preview dos Itens */}
      {parsedItens.length > 0 && (
        <div className="bg-[#121820] border border-[#ffffff0a] rounded-2xl overflow-hidden shadow-xl">
          <div className="p-4 border-b border-[#ffffff08] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-white">Prévia dos Itens</h2>
              <span className="text-xs text-gray-400 font-normal">
                ({parsedItens.length} linhas lidas)
              </span>
            </div>

            <button
              type="button"
              onClick={handleValidar}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 rounded-xl transition-all"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Validar Planilha
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-gray-300">
              <thead className="bg-[#0e1319] text-gray-400 uppercase tracking-wider text-[10px] border-b border-[#ffffff08]">
                <tr>
                  <th className="py-2.5 px-4 w-12">#</th>
                  <th className="py-2.5 px-4">Código / SKU Informado</th>
                  <th className="py-2.5 px-4">Qtd Origem</th>
                  <th className="py-2.5 px-4">Justificativa</th>
                  <th className="py-2.5 px-4 text-center">Status / Qtd Estoque</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ffffff05]">
                {parsedItens.map((item, idx) => {
                  const val = validacaoItens[idx]
                  const isOk = val?.status === 'ok'
                  const hasError = val?.status === 'erro'

                  return (
                    <tr
                      key={idx}
                      className={`transition-colors ${
                        hasError ? 'bg-red-500/5' : isOk ? 'bg-emerald-500/5' : ''
                      }`}
                    >
                      <td className="py-3 px-4 font-mono text-gray-500">{item.linha}</td>
                      <td className="py-3 px-4 font-mono font-bold text-white">
                        {item.codigo_parceiro || (val?.sku_codigo ?? '—')}
                        {val?.sku_nome && (
                          <span className="text-[10px] text-gray-400 block font-normal font-sans">
                            {val.sku_nome}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-gray-300">
                        {item.quantidade_origem} {item.unidade_origem}
                      </td>
                      <td className="py-3 px-4 text-gray-300">
                        <div>{item.justificativa || '—'}</div>
                        {hasError && val?.erro_mensagem && (
                          <div className="text-[10px] text-red-400 mt-1 flex items-start gap-1">
                            <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                            <span>{val.erro_mensagem}</span>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {isOk && val?.quantidade_estoque != null ? (
                          <span className="inline-flex items-center gap-1 font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 text-[11px]">
                            <CheckCircle2 className="h-3 w-3" />
                            +{val.quantidade_estoque} {val.unidade_estoque}
                          </span>
                        ) : hasError ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-red-400 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20 text-[10px]">
                            <XCircle className="h-3 w-3" />
                            Erro
                          </span>
                        ) : (
                          <span className="text-[10px] text-gray-500">Pendente de validação</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Ações Inferiores */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
        <Link
          href="/cockpit/estoque/entradas"
          className="text-xs text-gray-400 hover:text-white transition-colors"
        >
          ← Cancelar e Voltar para Lista
        </Link>

        {parsedItens.length > 0 && (
          <button
            type="button"
            onClick={handleEfetivar}
            disabled={isPending}
            className="inline-flex items-center gap-2 px-6 py-2.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-xl shadow-lg shadow-blue-500/20 disabled:opacity-50 transition-all"
          >
            {isPending ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Efetivando Planilha...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                Confirmar e Efetivar Lote de Planilha
              </>
            )}
          </button>
        )}
      </div>
    </div>
  )
}
