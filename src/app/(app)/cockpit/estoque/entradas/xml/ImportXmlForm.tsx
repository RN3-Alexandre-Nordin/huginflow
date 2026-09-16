'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  FileCode,
  Upload,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  Building2,
  Package,
  Sparkles,
  UserPlus,
  Link2,
  Plus,
} from 'lucide-react'
import { parseNfeXmlAction, criarEntradaNfeXmlAction } from '../actions'
import {
  criarFornecedorFromNfeAction,
  complementarFornecedorFromNfeAction,
  previewNfeLinhasAction,
  vincularDeparaNfeAction,
  criarSkuFromNfeAction,
  buscarSkusEntradaAction,
} from '../nfe-assist-actions'
import type { NfeXmlParsed, NfeXmlItem } from '@/lib/estoque/parser-nfe-xml'
import type { ItemEntradaValidado } from '@/lib/estoque/tipos'
import SearchableSelect from '@/components/SearchableSelect'
import { SKU_UNIDADES } from '@/lib/skus/constants'

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

interface SkuOpt {
  id: string
  codigo: string
  nome: string
  unidade_estoque: string
}

interface Props {
  fornecedores: Pessoa[]
  locais: Local[]
  defaultLocalId?: string
  skusIniciais: SkuOpt[]
}

type LinhaStatus = ItemEntradaValidado & { xml?: NfeXmlItem }

export function ImportXmlForm({
  fornecedores: fornecedoresIniciais,
  locais,
  defaultLocalId,
  skusIniciais,
}: Props) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()

  const [xmlContent, setXmlContent] = useState('')
  const [nomeArquivo, setNomeArquivo] = useState('')
  const [parsedData, setParsedData] = useState<NfeXmlParsed | null>(null)
  const [nfeDuplicada, setNfeDuplicada] = useState(false)
  const [loteDuplicadoId, setLoteDuplicadoId] = useState<string | null>(null)

  const [fornecedores, setFornecedores] = useState(fornecedoresIniciais)
  const [pessoaId, setPessoaId] = useState('')
  const [fornecedorPendente, setFornecedorPendente] = useState(false)
  const [nomeFornecedorEdit, setNomeFornecedorEdit] = useState('')
  const [pessoaComplementarId, setPessoaComplementarId] = useState('')

  const [localId, setLocalId] = useState(
    defaultLocalId || locais.find((l) => l.eh_principal)?.id || locais[0]?.id || '',
  )
  const [justificativaGeral, setJustificativaGeral] = useState('Importação de NF-e via XML')

  const [skuOverrides, setSkuOverrides] = useState<Record<number, string>>({})
  const [linhas, setLinhas] = useState<LinhaStatus[]>([])
  const [resolvendoLinha, setResolvendoLinha] = useState<number | null>(null)
  const [modoNovoSku, setModoNovoSku] = useState(false)
  const [skuPick, setSkuPick] = useState('')
  const [skuOptions, setSkuOptions] = useState(skusIniciais)

  // Novo SKU form
  const [novoCodigo, setNovoCodigo] = useState('')
  const [novoNome, setNovoNome] = useState('')
  const [novoUmEstoque, setNovoUmEstoque] = useState('UN')
  const [novoFator, setNovoFator] = useState('1')

  const [feedback, setFeedback] = useState<{
    tipo: 'sucesso' | 'erro' | 'aviso'
    texto: string
  } | null>(null)

  const refreshPreview = useCallback(
    (pid: string, overrides: Record<number, string>, xml: string, local: string) => {
      if (!pid || !xml || !local) return
      startTransition(async () => {
        const res = await previewNfeLinhasAction({
          pessoa_id: pid,
          local_id: local,
          xml_content: xml,
          skuOverrides: overrides,
        })
        if ('error' in res && res.error) {
          setFeedback({ tipo: 'erro', texto: res.error })
          return
        }
        const parsed = res.parsed!
        const itensXml = parsed.itens
        const val = res.validacao!
        setLinhas(
          val.itens.map((it) => ({
            ...it,
            xml: itensXml.find((x) => x.linha === it.linha),
          })),
        )
      })
    },
    [],
  )

  function processarXml(text: string) {
    if (!text.trim()) return
    setFeedback(null)
    setParsedData(null)
    setNfeDuplicada(false)
    setLoteDuplicadoId(null)
    setPessoaId('')
    setFornecedorPendente(false)
    setPessoaComplementarId('')
    setSkuOverrides({})
    setLinhas([])
    setResolvendoLinha(null)

    startTransition(async () => {
      const res = await parseNfeXmlAction(text)
      if ('error' in res && res.error) {
        setFeedback({ tipo: 'erro', texto: res.error })
        return
      }

      if (res.parsed?.sucesso) {
        setParsedData(res.parsed)
        setNfeDuplicada(Boolean(res.nfeDuplicada))
        setLoteDuplicadoId(res.loteDuplicado?.id ?? null)

        const emitNome =
          res.parsed.emitente?.nome ||
          res.parsed.emitente?.nome_fantasia ||
          res.parsed.fornecedorNome ||
          ''
        setNomeFornecedorEdit(emitNome)

        if (res.fornecedorEncontrado) {
          setPessoaId(res.fornecedorEncontrado.id)
          setFornecedorPendente(false)
          setFeedback({
            tipo: 'sucesso',
            texto: `Emitente identificado: ${res.fornecedorEncontrado.nome}`,
          })
          refreshPreview(
            res.fornecedorEncontrado.id,
            {},
            text,
            localId,
          )
        } else {
          setFornecedorPendente(true)
          setFeedback({
            tipo: 'aviso',
            texto:
              'Emitente não encontrado pelo CNPJ. Crie o fornecedor ou complemente um cadastro existente sem documento.',
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

  function handleConfirmarFornecedor() {
    if (!parsedData?.emitente) return
    startTransition(async () => {
      const res = await criarFornecedorFromNfeAction({
        emitente: parsedData.emitente!,
        nomeOverride: nomeFornecedorEdit,
      })
      if ('error' in res && res.error) {
        setFeedback({ tipo: 'erro', texto: res.error })
        return
      }
      const pessoa = res.pessoa!
      setFornecedores((prev) =>
        prev.some((p) => p.id === pessoa.id)
          ? prev
          : [{ id: pessoa.id, nome: pessoa.nome, documento: pessoa.documento }, ...prev],
      )
      setPessoaId(pessoa.id)
      setFornecedorPendente(false)
      setPessoaComplementarId('')
      setFeedback({
        tipo: 'sucesso',
        texto: res.criado
          ? `Fornecedor criado: ${pessoa.nome}`
          : `Fornecedor já existia: ${pessoa.nome}`,
      })
      refreshPreview(pessoa.id, skuOverrides, xmlContent, localId)
    })
  }

  function handleComplementarFornecedor() {
    if (!parsedData?.emitente || !pessoaComplementarId) return
    startTransition(async () => {
      const res = await complementarFornecedorFromNfeAction({
        pessoa_id: pessoaComplementarId,
        emitente: parsedData.emitente!,
      })
      if ('error' in res && res.error) {
        setFeedback({ tipo: 'erro', texto: res.error })
        return
      }
      const pessoa = res.pessoa!
      setFornecedores((prev) =>
        prev.map((p) =>
          p.id === pessoa.id
            ? { id: pessoa.id, nome: pessoa.nome, documento: pessoa.documento }
            : p,
        ),
      )
      setPessoaId(pessoa.id)
      setFornecedorPendente(false)
      setPessoaComplementarId('')
      setFeedback({
        tipo: 'sucesso',
        texto: `Cadastro complementado com CNPJ/dados da NF-e: ${pessoa.nome}`,
      })
      refreshPreview(pessoa.id, skuOverrides, xmlContent, localId)
    })
  }

  useEffect(() => {
    if (pessoaId && xmlContent && localId && !fornecedorPendente) {
      refreshPreview(pessoaId, skuOverrides, xmlContent, localId)
    }
  }, [localId]) // eslint-disable-line react-hooks/exhaustive-deps

  function abrirResolver(linha: number, xmlItem?: NfeXmlItem) {
    setResolvendoLinha(linha)
    setModoNovoSku(false)
    setSkuPick(skuOverrides[linha] || '')
    setNovoCodigo(xmlItem?.codigo_parceiro || '')
    setNovoNome(xmlItem?.descricao_parceiro || '')
    setNovoUmEstoque(xmlItem?.unidade_origem || 'UN')
    setNovoFator('1')
  }

  async function onBuscarSku(term: string) {
    const res = await buscarSkusEntradaAction(term)
    if (res.skus) {
      setSkuOptions(
        res.skus.map((s) => ({
          id: s.id,
          codigo: s.codigo,
          nome: s.nome,
          unidade_estoque: s.unidade_estoque,
        })),
      )
    }
  }

  function handleVincularSku() {
    if (resolvendoLinha == null || !skuPick || !pessoaId || !parsedData) return
    const xmlItem = parsedData.itens.find((i) => i.linha === resolvendoLinha)
    startTransition(async () => {
      const res = await vincularDeparaNfeAction({
        pessoa_id: pessoaId,
        codigo_parceiro: xmlItem?.codigo_parceiro || '',
        sku_id: skuPick,
        descricao_parceiro: xmlItem?.descricao_parceiro,
      })
      if ('error' in res && res.error) {
        setFeedback({ tipo: 'erro', texto: res.error })
        return
      }
      const next = { ...skuOverrides, [resolvendoLinha]: skuPick }
      setSkuOverrides(next)
      setResolvendoLinha(null)
      setFeedback({ tipo: 'sucesso', texto: 'De-para gravado. Linha resolvida.' })
      refreshPreview(pessoaId, next, xmlContent, localId)
    })
  }

  function handleCriarSku() {
    if (resolvendoLinha == null || !pessoaId || !parsedData) return
    const xmlItem = parsedData.itens.find((i) => i.linha === resolvendoLinha)
    if (!xmlItem) return

    const uOrigem = xmlItem.unidade_origem
    const uEstoque = novoUmEstoque.trim().toUpperCase()
    startTransition(async () => {
      const res = await criarSkuFromNfeAction({
        pessoa_id: pessoaId,
        codigo_parceiro: xmlItem.codigo_parceiro,
        descricao_parceiro: novoNome || xmlItem.descricao_parceiro,
        unidade_origem: uOrigem,
        unidade_estoque: uEstoque,
        fator_conversao: uOrigem !== uEstoque ? Number(novoFator) : 1,
        ncm: xmlItem.ncm,
        cest: xmlItem.cest,
        codigo_barras: xmlItem.codigo_barras,
        valor_unitario: xmlItem.valor_unitario,
        codigo_sku: novoCodigo,
      })
      if ('error' in res && res.error) {
        setFeedback({ tipo: 'erro', texto: res.error })
        return
      }
      const skuId = res.sku!.id as string
      const next = { ...skuOverrides, [resolvendoLinha]: skuId }
      setSkuOverrides(next)
      setSkuOptions((prev) => [
        {
          id: skuId,
          codigo: String(res.sku!.codigo),
          nome: String(res.sku!.nome),
          unidade_estoque: String(res.sku!.unidade_estoque),
        },
        ...prev,
      ])
      setResolvendoLinha(null)
      setModoNovoSku(false)
      setFeedback({ tipo: 'sucesso', texto: `SKU ${res.sku!.codigo} criado e vinculado.` })
      refreshPreview(pessoaId, next, xmlContent, localId)
    })
  }

  function handleEfetivar() {
    if (!parsedData || !xmlContent || !pessoaId || !localId) return
    const pendentes = linhas.filter((l) => l.status === 'erro')
    if (pendentes.length > 0) {
      setFeedback({
        tipo: 'erro',
        texto: `Ainda há ${pendentes.length} linha(s) sem resolução. Vincule ou cadastre o SKU.`,
      })
      return
    }
    if (nfeDuplicada) {
      setFeedback({
        tipo: 'erro',
        texto: 'Chave de NF-e já utilizada em outro lote. Não é possível efetivar duplicata.',
      })
      return
    }

    startTransition(async () => {
      const res = await criarEntradaNfeXmlAction({
        pessoa_id: pessoaId,
        local_id: localId,
        xml_content: xmlContent,
        documento: parsedData.numeroNfe ? `NF-e ${parsedData.numeroNfe}` : undefined,
        observacao: parsedData.fornecedorNome
          ? `Emitente: ${parsedData.fornecedorNome}`
          : undefined,
        justificativaGeral,
        nfe_xml_nome: nomeArquivo || undefined,
        skuOverrides,
      })
      if ('error' in res) {
        setFeedback({ tipo: 'erro', texto: res.error || 'Erro desconhecido.' })
        return
      }
      if (res.sucesso && res.loteId) {
        router.push(`/cockpit/estoque/entradas/${res.loteId}`)
      } else {
        setFeedback({ tipo: 'erro', texto: res.mensagem || 'Falha ao efetivar.' })
      }
    })
  }

  const podeEfetivar =
    Boolean(pessoaId && localId && parsedData && !fornecedorPendente && !nfeDuplicada) &&
    linhas.length > 0 &&
    linhas.every((l) => l.status === 'ok')

  const linhaAtiva = resolvendoLinha != null ? parsedData?.itens.find((i) => i.linha === resolvendoLinha) : null

  return (
    <div className="space-y-6">
      {feedback && (
        <div
          className={`p-4 rounded-xl text-xs flex items-start gap-3 border ${
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

      {nfeDuplicada && (
        <div className="p-4 rounded-xl text-xs flex items-center gap-3 bg-red-500/10 border border-red-500/20 text-red-300">
          <AlertTriangle className="h-5 w-5 shrink-0 text-red-400" />
          <div>
            <strong className="block font-semibold">Chave de NF-e já registrada</strong>
            Esta nota já gerou entrada no estoque.
            {loteDuplicadoId && (
              <Link
                href={`/cockpit/estoque/entradas/${loteDuplicadoId}`}
                className="text-[#2BAADF] hover:underline ml-1"
              >
                Ver lote existente
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Upload */}
      <div className="bg-[#111111] border border-[#ffffff0a] rounded-2xl p-6 space-y-4">
        <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-2">
          <FileCode className="h-4 w-4 text-[#2BAADF]" />
          1. Arquivo XML da NF-e
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-[#ffffff15] hover:border-[#2BAADF]/40 rounded-xl p-8 text-center cursor-pointer bg-[#0A0A0A] transition-all flex flex-col items-center justify-center space-y-3"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xml"
              onChange={handleFileChange}
              className="hidden"
            />
            <div className="p-3 rounded-full bg-[#2BAADF]/10 text-[#2BAADF]">
              <Upload className="h-6 w-6" />
            </div>
            <p className="text-xs font-semibold text-white">
              {nomeArquivo || 'Clique para selecionar o arquivo .XML'}
            </p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs text-gray-400">Ou cole o XML:</label>
              {xmlContent && (
                <button
                  type="button"
                  onClick={() => processarXml(xmlContent)}
                  disabled={isPending}
                  className="text-[11px] text-[#2BAADF] hover:text-[#5bc0eb] font-medium flex items-center gap-1"
                >
                  <Sparkles className="h-3 w-3" />
                  Reprocessar
                </button>
              )}
            </div>
            <textarea
              rows={5}
              value={xmlContent}
              onChange={(e) => setXmlContent(e.target.value)}
              onBlur={() => processarXml(xmlContent)}
              placeholder="<nfeProc>...</nfeProc>"
              className="w-full bg-[#0A0A0A] border border-[#ffffff15] rounded-xl p-3 text-xs font-mono text-gray-300 focus:outline-none focus:border-[#2BAADF]/50 resize-none"
            />
          </div>
        </div>
      </div>

      {/* Fornecedor */}
      {parsedData && (
        <div className="bg-[#111111] border border-[#ffffff0a] rounded-2xl p-6 space-y-4">
          <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-2">
            <Building2 className="h-4 w-4 text-[#2BAADF]" />
            2. Fornecedor e destino
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-[#0A0A0A] p-4 rounded-xl border border-[#ffffff08] text-xs">
            <div>
              <span className="text-[10px] text-gray-500 uppercase block">NF-e</span>
              <span className="font-mono text-white font-bold">
                {parsedData.numeroNfe || '—'}
                {parsedData.serie ? ` / S${parsedData.serie}` : ''}
              </span>
            </div>
            <div className="md:col-span-2">
              <span className="text-[10px] text-gray-500 uppercase block">Emitente no XML</span>
              <span className="text-white font-medium">
                {parsedData.emitente?.nome || parsedData.fornecedorNome || '—'}
              </span>
              <span className="block font-mono text-[10px] text-gray-400">
                {parsedData.fornecedorCnpj || '—'}
                {parsedData.emitente?.cidade
                  ? ` · ${parsedData.emitente.cidade}/${parsedData.emitente.uf || ''}`
                  : ''}
              </span>
            </div>
          </div>

          {fornecedorPendente ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 space-y-3">
                <p className="text-xs text-amber-200 font-medium flex items-center gap-2">
                  <UserPlus className="h-4 w-4" />
                  Confirmar cadastro do fornecedor com dados da NF-e
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-gray-400 uppercase">Nome</label>
                    <input
                      value={nomeFornecedorEdit}
                      onChange={(e) => setNomeFornecedorEdit(e.target.value)}
                      className="w-full mt-1 bg-[#0A0A0A] border border-[#ffffff15] rounded-xl px-3 py-2 text-xs text-white"
                    />
                  </div>
                  <div className="text-[11px] text-gray-400 space-y-0.5 pt-5">
                    <p>Documento: {parsedData.fornecedorCnpj}</p>
                    {parsedData.emitente?.ie && <p>IE: {parsedData.emitente.ie}</p>}
                    {parsedData.emitente?.logradouro && (
                      <p>
                        {[
                          parsedData.emitente.logradouro,
                          parsedData.emitente.numero,
                          parsedData.emitente.bairro,
                          parsedData.emitente.cidade,
                          parsedData.emitente.uf,
                          parsedData.emitente.cep,
                        ]
                          .filter(Boolean)
                          .join(', ')}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleConfirmarFornecedor}
                  disabled={isPending || !nomeFornecedorEdit.trim()}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#2BAADF] px-4 py-2 text-xs font-semibold text-white disabled:opacity-40"
                >
                  {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
                  Confirmar e criar fornecedor
                </button>
              </div>

              <div className="rounded-xl border border-[#ffffff12] bg-[#0A0A0A] p-4 space-y-3">
                <p className="text-xs text-gray-300 font-medium flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-[#2BAADF]" />
                  Já existe sem CNPJ? Complementar cadastro
                </p>
                <p className="text-[11px] text-gray-500">
                  Selecione o fornecedor já cadastrado. O sistema preenche o documento e os campos
                  vazios com os dados do emitente da NF-e (não sobrescreve documento diferente).
                </p>
                <SearchableSelect
                  value={pessoaComplementarId}
                  onChange={setPessoaComplementarId}
                  disabled={isPending}
                  placeholder="Buscar fornecedor existente…"
                  options={fornecedores.map((f) => ({
                    value: f.id,
                    label: f.documento
                      ? `${f.nome} (${f.documento})`
                      : `${f.nome} — sem documento`,
                    searchText: `${f.nome} ${f.documento || ''}`,
                  }))}
                />
                <button
                  type="button"
                  onClick={handleComplementarFornecedor}
                  disabled={isPending || !pessoaComplementarId}
                  className="inline-flex items-center gap-2 rounded-xl border border-[#2BAADF]/40 bg-[#2BAADF]/10 px-4 py-2 text-xs font-semibold text-[#2BAADF] disabled:opacity-40 hover:bg-[#2BAADF]/15 transition"
                >
                  {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                  Complementar e vincular
                </button>
              </div>

              <div>
                <label className="text-xs text-gray-300 font-medium block mb-1.5">
                  Local destino <span className="text-red-400">*</span>
                </label>
                <select
                  value={localId}
                  onChange={(e) => setLocalId(e.target.value)}
                  className="w-full bg-[#0A0A0A] border border-[#ffffff15] rounded-xl px-3 py-2 text-xs text-white max-w-md"
                >
                  {locais.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.codigo} — {l.nome}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="text-xs text-gray-300 font-medium block mb-1.5">
                  Fornecedor <span className="text-red-400">*</span>
                </label>
                <SearchableSelect
                  value={pessoaId}
                  onChange={(id) => {
                    setPessoaId(id)
                    refreshPreview(id, skuOverrides, xmlContent, localId)
                  }}
                  disabled={isPending}
                  placeholder="Fornecedor…"
                  options={fornecedores.map((f) => ({
                    value: f.id,
                    label: f.documento ? `${f.nome} (${f.documento})` : f.nome,
                    searchText: `${f.nome} ${f.documento || ''}`,
                  }))}
                />
              </div>
              <div>
                <label className="text-xs text-gray-300 font-medium block mb-1.5">
                  Local destino <span className="text-red-400">*</span>
                </label>
                <select
                  value={localId}
                  onChange={(e) => setLocalId(e.target.value)}
                  className="w-full bg-[#0A0A0A] border border-[#ffffff15] rounded-xl px-3 py-2 text-xs text-white"
                >
                  {locais.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.codigo} — {l.nome}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Linhas */}
      {parsedData && pessoaId && !fornecedorPendente && (
        <div className="bg-[#111111] border border-[#ffffff0a] rounded-2xl p-6 space-y-4">
          <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-2">
            <Package className="h-4 w-4 text-[#2BAADF]" />
            3. Itens — resolver pendências
          </h3>

          <div className="overflow-x-auto border border-[#ffffff08] rounded-xl">
            <table className="w-full text-left text-xs text-gray-300">
              <thead className="bg-[#0A0A0A] border-b border-[#ffffff10] text-[10px] uppercase text-gray-500">
                <tr>
                  <th className="py-2 px-3">#</th>
                  <th className="py-2 px-3">Parceiro</th>
                  <th className="py-2 px-3">Descrição / NCM</th>
                  <th className="py-2 px-3 text-right">Qtd</th>
                  <th className="py-2 px-3">Status</th>
                  <th className="py-2 px-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ffffff05]">
                {(linhas.length ? linhas : parsedData.itens.map((it) => ({
                  linha: it.linha,
                  codigo_parceiro: it.codigo_parceiro,
                  sku_id: null,
                  unidade_origem: it.unidade_origem,
                  quantidade_origem: it.quantidade_origem,
                  unidade_estoque: null,
                  quantidade_estoque: null,
                  fator_conversao: null,
                  justificativa: null,
                  status: 'erro' as const,
                  erro_codigo: 'DEPARA_NAO_ENCONTRADO' as const,
                  erro_mensagem: 'Aguardando validação…',
                  xml: it,
                }))).map((row) => (
                  <tr key={row.linha} className="hover:bg-[#ffffff03]">
                    <td className="py-2.5 px-3 font-mono text-gray-500">{row.linha}</td>
                    <td className="py-2.5 px-3 font-mono text-white">{row.codigo_parceiro}</td>
                    <td className="py-2.5 px-3">
                      <span className="block truncate max-w-xs">
                        {row.xml?.descricao_parceiro || row.sku_nome || '—'}
                      </span>
                      {row.xml?.ncm && (
                        <span className="text-[10px] text-gray-500">NCM {row.xml.ncm}</span>
                      )}
                      {row.sku_codigo && (
                        <span className="text-[10px] text-emerald-400/80 block">
                          → {row.sku_codigo} {row.sku_nome}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono">
                      {row.quantidade_origem} {row.unidade_origem}
                    </td>
                    <td className="py-2.5 px-3">
                      {row.status === 'ok' ? (
                        <span className="text-emerald-400 text-[10px] font-bold uppercase">OK</span>
                      ) : (
                        <span className="text-amber-400 text-[10px] font-medium" title={row.erro_mensagem || ''}>
                          {row.erro_codigo || 'PENDENTE'}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {row.status !== 'ok' && (
                        <button
                          type="button"
                          onClick={() => abrirResolver(row.linha, row.xml)}
                          className="text-[11px] text-[#2BAADF] hover:underline font-medium"
                        >
                          Resolver
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Painel resolver */}
          {resolvendoLinha != null && linhaAtiva && (
            <div className="rounded-xl border border-[#2BAADF]/25 bg-[#2BAADF]/5 p-4 space-y-4">
              <p className="text-xs font-semibold text-white">
                Resolver item #{resolvendoLinha} — {linhaAtiva.codigo_parceiro}
              </p>
              <p className="text-[11px] text-gray-400">{linhaAtiva.descricao_parceiro}</p>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setModoNovoSku(false)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-medium border ${
                    !modoNovoSku
                      ? 'border-[#2BAADF]/40 bg-[#2BAADF]/15 text-[#2BAADF]'
                      : 'border-[#ffffff12] text-gray-400'
                  }`}
                >
                  <Link2 className="inline h-3 w-3 mr-1" />
                  Apontar SKU existente
                </button>
                <button
                  type="button"
                  onClick={() => setModoNovoSku(true)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-medium border ${
                    modoNovoSku
                      ? 'border-[#2BAADF]/40 bg-[#2BAADF]/15 text-[#2BAADF]'
                      : 'border-[#ffffff12] text-gray-400'
                  }`}
                >
                  <Plus className="inline h-3 w-3 mr-1" />
                  Cadastrar SKU novo
                </button>
              </div>

              {!modoNovoSku ? (
                <div className="space-y-3">
                  <SearchableSelect
                    value={skuPick}
                    onChange={setSkuPick}
                    placeholder="Buscar SKU interno…"
                    options={skuOptions.map((s) => ({
                      value: s.id,
                      label: `${s.codigo} — ${s.nome}`,
                      searchText: `${s.codigo} ${s.nome}`,
                    }))}
                  />
                  <input
                    type="search"
                    placeholder="Filtrar SKUs (digite e Enter)…"
                    className="w-full bg-[#0A0A0A] border border-[#ffffff15] rounded-xl px-3 py-2 text-xs text-white"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        void onBuscarSku((e.target as HTMLInputElement).value)
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleVincularSku}
                    disabled={!skuPick || isPending}
                    className="rounded-xl bg-[#2BAADF] px-4 py-2 text-xs font-semibold text-white disabled:opacity-40"
                  >
                    Gravar de-para e resolver
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-gray-500 uppercase">Código SKU</label>
                    <input
                      value={novoCodigo}
                      onChange={(e) => setNovoCodigo(e.target.value)}
                      className="w-full mt-1 bg-[#0A0A0A] border border-[#ffffff15] rounded-xl px-3 py-2 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 uppercase">Nome</label>
                    <input
                      value={novoNome}
                      onChange={(e) => setNovoNome(e.target.value)}
                      className="w-full mt-1 bg-[#0A0A0A] border border-[#ffffff15] rounded-xl px-3 py-2 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 uppercase">
                      UM na NF-e (origem)
                    </label>
                    <input
                      value={linhaAtiva.unidade_origem}
                      disabled
                      className="w-full mt-1 bg-[#0A0A0A] border border-[#ffffff10] rounded-xl px-3 py-2 text-xs text-gray-400"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 uppercase">
                      UM estoque (confirmar) *
                    </label>
                    <select
                      value={novoUmEstoque}
                      onChange={(e) => setNovoUmEstoque(e.target.value)}
                      className="w-full mt-1 bg-[#0A0A0A] border border-[#ffffff15] rounded-xl px-3 py-2 text-xs text-white"
                    >
                      {[linhaAtiva.unidade_origem, ...SKU_UNIDADES]
                        .filter((v, i, a) => a.indexOf(v) === i)
                        .map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                    </select>
                  </div>
                  {novoUmEstoque.toUpperCase() !== linhaAtiva.unidade_origem.toUpperCase() && (
                    <div className="md:col-span-2">
                      <label className="text-[10px] text-gray-500 uppercase">
                        Fator: 1 {linhaAtiva.unidade_origem} = ? {novoUmEstoque}
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={novoFator}
                        onChange={(e) => setNovoFator(e.target.value)}
                        className="w-full mt-1 bg-[#0A0A0A] border border-[#ffffff15] rounded-xl px-3 py-2 text-xs text-white"
                      />
                    </div>
                  )}
                  <div className="md:col-span-2 text-[10px] text-gray-500">
                    Do XML: NCM {linhaAtiva.ncm || '—'}
                    {linhaAtiva.codigo_barras ? ` · EAN ${linhaAtiva.codigo_barras}` : ''}
                    {linhaAtiva.cest ? ` · CEST ${linhaAtiva.cest}` : ''}
                    {linhaAtiva.valor_unitario
                      ? ` · Custo sugerido ${linhaAtiva.valor_unitario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`
                      : ''}
                  </div>
                  <button
                    type="button"
                    onClick={handleCriarSku}
                    disabled={isPending || !novoNome.trim()}
                    className="md:col-span-2 rounded-xl bg-[#2BAADF] px-4 py-2 text-xs font-semibold text-white disabled:opacity-40"
                  >
                    Criar SKU + de-para e resolver
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={() => setResolvendoLinha(null)}
                className="text-[11px] text-gray-500 hover:text-white"
              >
                Fechar
              </button>
            </div>
          )}

          <div>
            <label className="text-xs text-gray-400">Justificativa do lote</label>
            <input
              value={justificativaGeral}
              onChange={(e) => setJustificativaGeral(e.target.value)}
              className="w-full mt-1 bg-[#0A0A0A] border border-[#ffffff15] rounded-xl px-3 py-2 text-xs text-white"
            />
          </div>
        </div>
      )}

      {parsedData && (
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => router.push('/cockpit/estoque/entradas')}
            className="px-4 py-2.5 rounded-xl text-xs text-gray-400 hover:text-white border border-[#ffffff10]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleEfetivar}
            disabled={isPending || !podeEfetivar}
            className="px-6 py-2.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-[#2BAADF] to-[#1A8FBF] text-white disabled:opacity-40 flex items-center gap-2"
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Efetivar entrada
          </button>
        </div>
      )}
    </div>
  )
}
