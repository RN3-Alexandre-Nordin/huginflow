'use client'

import { useState, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  FileCode,
  Upload,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  Building2,
  Package,
  ArrowRight,
  Sparkles,
  Layers,
  FileText,
} from 'lucide-react'
import { parseNfeXmlAction, criarEntradaNfeXmlAction } from '../actions'
import type { NfeXmlParsed } from '@/lib/estoque/parser-nfe-xml'
import SearchableSelect from '@/components/SearchableSelect'

interface Pessoa {
  id: string
  nome: string
  documento: string | null
}

interface Local {
  id: string
  codigo: string
  nome: string
  eh_principal: boolean
}

interface Props {
  fornecedores: Pessoa[]
  locais: Local[]
  defaultLocalId?: string
}

export function ImportXmlForm({ fornecedores, locais, defaultLocalId }: Props) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()

  const [xmlContent, setXmlContent] = useState<string>('')
  const [nomeArquivo, setNomeArquivo] = useState<string>('')
  const [parsedData, setParsedData] = useState<NfeXmlParsed | null>(null)
  const [nfeDuplicada, setNfeDuplicada] = useState<boolean>(false)

  const [pessoaId, setPessoaId] = useState<string>('')
  const [localId, setLocalId] = useState<string>(
    defaultLocalId || locais.find((l) => l.eh_principal)?.id || locais[0]?.id || ''
  )
  const [justificativaGeral, setJustificativaGeral] = useState<string>(
    'Importação de NF-e via XML'
  )

  const [feedback, setFeedback] = useState<{
    tipo: 'sucesso' | 'erro' | 'aviso'
    texto: string
  } | null>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setNomeArquivo(file.name)
    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      setXmlContent(text)
      processarXml(text)
    }
    reader.readAsText(file)
  }

  function processarXml(text: string) {
    if (!text.trim()) return
    setFeedback(null)
    setParsedData(null)
    setNfeDuplicada(false)

    startTransition(async () => {
      const res = await parseNfeXmlAction(text)
      if ('error' in res && res.error) {
        setFeedback({ tipo: 'erro', texto: res.error })
        return
      }

      if (res.parsed && res.parsed.sucesso) {
        setParsedData(res.parsed)
        setNfeDuplicada(res.nfeDuplicada)

        if (res.fornecedorEncontrado) {
          setPessoaId(res.fornecedorEncontrado.id)
          setFeedback({
            tipo: 'sucesso',
            texto: `Emitente identificado automaticamente: ${res.fornecedorEncontrado.nome}`,
          })
        } else {
          setFeedback({
            tipo: 'aviso',
            texto: `Emitente CNPJ ${res.parsed.fornecedorCnpj || 'não informado'} não localizado em Cadastros → Pessoas. Selecione o fornecedor correspondente abaixo.`,
          })
        }
      } else {
        setFeedback({
          tipo: 'erro',
          texto: 'Não foi possível ler os dados da NF-e a partir do XML.',
        })
      }
    })
  }

  function handleEfetivar() {
    if (!parsedData || !xmlContent) {
      setFeedback({ tipo: 'erro', texto: 'Carregue um arquivo XML válido.' })
      return
    }

    if (!pessoaId) {
      setFeedback({
        tipo: 'erro',
        texto: 'Selecione o fornecedor em Cadastros → Pessoas.',
      })
      return
    }

    if (!localId) {
      setFeedback({
        tipo: 'erro',
        texto: 'Selecione o local de estoque de destino.',
      })
      return
    }

    setFeedback(null)
    startTransition(async () => {
      const res = await criarEntradaNfeXmlAction({
        pessoa_id: pessoaId,
        local_id: localId,
        xml_content: xmlContent,
        documento: parsedData.numeroNfe ? `NF-e ${parsedData.numeroNfe}` : undefined,
        observacao: parsedData.fornecedorNome ? `Emitente: ${parsedData.fornecedorNome}` : undefined,
        justificativaGeral,
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
          texto: res.mensagem || 'Falha ao efetivar lote da NF-e.',
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
              : feedback.tipo === 'aviso'
              ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
              : 'bg-red-500/10 border-red-500/20 text-red-400'
          }`}
        >
          {feedback.tipo === 'sucesso' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
          ) : feedback.tipo === 'aviso' ? (
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          ) : (
            <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
          )}
          <span>{feedback.texto}</span>
        </div>
      )}

      {/* Alerta de Chave Duplicada */}
      {nfeDuplicada && (
        <div className="p-4 rounded-xl text-xs flex items-center gap-3 bg-amber-500/10 border border-amber-500/20 text-amber-300">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400" />
          <div>
            <strong className="block font-semibold">
              Atenção: Chave de NF-e já registrada no sistema!
            </strong>
            Já existe uma entrada anterior com a chave desta nota fiscal.
            Verifique se este lote não se trata de uma duplicidade.
          </div>
        </div>
      )}

      {/* Área de Upload / Colar XML */}
      <div className="bg-[#0b0f19] border border-[#ffffff10] rounded-2xl p-6 shadow-xl space-y-4">
        <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-2">
          <FileCode className="h-4 w-4 text-amber-400" />
          1. Arquivo XML da NF-e
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Dropzone / Upload */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-[#ffffff15] hover:border-amber-500/40 rounded-xl p-8 text-center cursor-pointer bg-[#080b11] transition-all flex flex-col items-center justify-center space-y-3"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xml"
              onChange={handleFileChange}
              className="hidden"
            />
            <div className="p-3 rounded-full bg-amber-500/10 text-amber-400">
              <Upload className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-white">
                {nomeArquivo || 'Clique para selecionar o arquivo .XML'}
              </p>
              <p className="text-[11px] text-gray-500 mt-0.5">
                Layout padrão NF-e SEFAZ (ProcNFe / infNFe)
              </p>
            </div>
          </div>

          {/* Colar XML bruto */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs text-gray-400">
                Ou cole o conteúdo XML aqui:
              </label>
              {xmlContent && (
                <button
                  type="button"
                  onClick={() => processarXml(xmlContent)}
                  disabled={isPending}
                  className="text-[11px] text-amber-400 hover:text-amber-300 font-medium flex items-center gap-1"
                >
                  <Sparkles className="h-3 w-3" />
                  Reprocessar XML
                </button>
              )}
            </div>
            <textarea
              rows={5}
              value={xmlContent}
              onChange={(e) => {
                setXmlContent(e.target.value)
              }}
              onBlur={() => processarXml(xmlContent)}
              placeholder="<nfeProc versao='4.00'>...</nfeProc>"
              className="w-full bg-[#080b11] border border-[#ffffff15] rounded-xl p-3 text-xs font-mono text-gray-300 placeholder-gray-600 focus:outline-none focus:border-amber-500/50 resize-none"
            />
          </div>
        </div>
      </div>

      {/* Dados Extraídos da NF-e */}
      {parsedData && (
        <div className="bg-[#0b0f19] border border-[#ffffff10] rounded-2xl p-6 shadow-xl space-y-6 animate-in fade-in duration-300">
          <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-2">
            <Building2 className="h-4 w-4 text-cyan-400" />
            2. Identificação da Nota e Destino
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-[#080b11] p-4 rounded-xl border border-[#ffffff08]">
            <div>
              <span className="text-[10px] text-gray-500 uppercase tracking-wider block">
                Número / Série
              </span>
              <span className="font-mono text-sm font-bold text-white">
                {parsedData.numeroNfe || '—'} {parsedData.serie ? `(Série ${parsedData.serie})` : ''}
              </span>
            </div>

            <div>
              <span className="text-[10px] text-gray-500 uppercase tracking-wider block">
                Emissão
              </span>
              <span className="font-mono text-xs text-gray-300">
                {parsedData.emissaoEm
                  ? new Date(parsedData.emissaoEm).toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : '—'}
              </span>
            </div>

            <div className="md:col-span-2">
              <span className="text-[10px] text-gray-500 uppercase tracking-wider block">
                Emitente na Nota
              </span>
              <span className="text-xs text-white font-medium block truncate">
                {parsedData.fornecedorNome || '—'}
              </span>
              <span className="text-[10px] font-mono text-gray-400">
                CNPJ: {parsedData.fornecedorCnpj || '—'}
              </span>
            </div>

            {parsedData.chaveNfe && (
              <div className="md:col-span-4 border-t border-[#ffffff08] pt-2 mt-1">
                <span className="text-[10px] text-gray-500 uppercase tracking-wider block">
                  Chave de Acesso (44 dígitos)
                </span>
                <span className="font-mono text-[11px] text-amber-300/80 break-all">
                  {parsedData.chaveNfe}
                </span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Fornecedor do Sistema */}
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-xs text-gray-300 font-medium block">
                Fornecedor no Sistema (Cadastros → Pessoas){' '}
                <span className="text-red-400">*</span>
              </label>
              <SearchableSelect
                value={pessoaId}
                onChange={setPessoaId}
                disabled={isPending}
                placeholder="Buscar fornecedor cadastrado…"
                emptyLabel="Nenhum fornecedor encontrado"
                options={fornecedores.map((f) => ({
                  value: f.id,
                  label: f.documento ? `${f.nome} (${f.documento})` : f.nome,
                  searchText: `${f.nome} ${f.documento || ''}`,
                }))}
                inputClassName="w-full bg-[#080b11] border border-[#ffffff15] rounded-xl pl-8 pr-8 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
              />
              {fornecedores.length === 0 && (
                <p className="text-[10px] text-amber-400/80 mt-1">
                  Nenhum fornecedor cadastrado. Use Cadastros → Pessoas com papel Fornecedor.
                </p>
              )}
            </div>

            {/* Local de Destino */}
            <div className="space-y-1.5">
              <label className="text-xs text-gray-300 font-medium block">
                Local de Estoque de Destino <span className="text-red-400">*</span>
              </label>
              <select
                value={localId}
                onChange={(e) => setLocalId(e.target.value)}
                disabled={isPending}
                className="w-full bg-[#080b11] border border-[#ffffff15] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
              >
                {locais.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.codigo} — {l.nome} {l.eh_principal ? '★ (Principal)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Justificativa Geral */}
            <div className="space-y-1.5 md:col-span-3">
              <label className="text-xs text-gray-300 font-medium block">
                Justificativa Operacional do Lote <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={justificativaGeral}
                onChange={(e) => setJustificativaGeral(e.target.value)}
                placeholder="Ex: Compra de suprimentos conforme NF-e 1234"
                disabled={isPending}
                className="w-full bg-[#080b11] border border-[#ffffff15] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>
        </div>
      )}

      {/* Itens Extraídos */}
      {parsedData && (
        <div className="bg-[#0b0f19] border border-[#ffffff10] rounded-2xl overflow-hidden shadow-xl space-y-4 p-6 animate-in fade-in duration-300">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-2">
              <Package className="h-4 w-4 text-cyan-400" />
              3. Itens Identificados na NF-e ({parsedData.itens.length})
            </h3>
            <span className="text-xs text-gray-400 font-mono">
              Total Itens:{' '}
              {parsedData.itens
                .reduce((acc, it) => acc + (it.valor_total || 0), 0)
                .toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </span>
          </div>

          <div className="overflow-x-auto border border-[#ffffff08] rounded-xl">
            <table className="w-full text-left text-xs text-gray-300">
              <thead className="bg-[#080c14] border-b border-[#ffffff10] text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                <tr>
                  <th className="py-2.5 px-3">Item</th>
                  <th className="py-2.5 px-3">Cód. Parceiro</th>
                  <th className="py-2.5 px-3">Descrição na NF-e</th>
                  <th className="py-2.5 px-3 text-right">Qtd Comercial</th>
                  <th className="py-2.5 px-3 text-right">Valor Unit.</th>
                  <th className="py-2.5 px-3 text-right">Valor Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ffffff05]">
                {parsedData.itens.map((it) => (
                  <tr key={it.linha} className="hover:bg-[#ffffff03]">
                    <td className="py-2.5 px-3 font-mono text-gray-500">
                      #{it.linha}
                    </td>
                    <td className="py-2.5 px-3 font-mono font-semibold text-white">
                      {it.codigo_parceiro}
                    </td>
                    <td className="py-2.5 px-3 text-gray-300 truncate max-w-xs">
                      {it.descricao_parceiro}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-cyan-400 font-bold">
                      {it.quantidade_origem}{' '}
                      <span className="text-[10px] text-gray-400 font-normal">
                        {it.unidade_origem}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-gray-300">
                      {it.valor_unitario.toLocaleString('pt-BR', {
                        style: 'currency',
                        currency: 'BRL',
                      })}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold text-emerald-400">
                      {it.valor_total.toLocaleString('pt-BR', {
                        style: 'currency',
                        currency: 'BRL',
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="p-3 rounded-xl bg-[#080b11] border border-[#ffffff08] text-[11px] text-gray-400 space-y-1">
            <p>
              • Os códigos do parceiro (<code className="text-gray-300">cProd</code>)
              serão associados aos SKUs internos via <strong>Cadastros → De-Para de SKUs</strong>.
            </p>
            <p>
              • Unidades comerciais diferentes serão convertidas automaticamente pela
              tabela de <strong>Fator de Conversão</strong>.
            </p>
          </div>
        </div>
      )}

      {/* Ações */}
      {parsedData && (
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => router.push('/cockpit/estoque/entradas')}
            disabled={isPending}
            className="px-4 py-2.5 rounded-xl text-xs font-medium text-gray-400 hover:text-white bg-[#ffffff05] hover:bg-[#ffffff10] border border-[#ffffff10] transition-colors"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleEfetivar}
            disabled={isPending || !pessoaId || !localId || parsedData.itens.length === 0}
            className="px-6 py-2.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-amber-600 to-emerald-600 hover:from-amber-500 hover:to-emerald-500 disabled:opacity-40 text-white shadow-lg shadow-amber-950/40 transition-all flex items-center gap-2"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Processando Lote da NF-e...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                Validar e Efetivar Entrada da NF-e
              </>
            )}
          </button>
        </div>
      )}
    </div>
  )
}
