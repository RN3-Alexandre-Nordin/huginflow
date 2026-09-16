'use client'

import { useEffect, useId, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  CheckCircle2,
  FileText,
  MapPin,
  Plus,
  RefreshCw,
  Trash2,
  Truck,
  XCircle,
  Zap,
} from 'lucide-react'
import SearchableSelect from '@/components/SearchableSelect'
import { registrarRetornosRemessaAction } from '../../actions'
import {
  MOTIVOS_BAIXA_REMESSA,
  MOTIVOS_REMESSA,
} from '@/lib/estoque/operacoes-avancadas'

interface LocalOption {
  id: string
  codigo: string
  nome: string
  eh_principal: boolean
}

interface SkuOption {
  id: string
  codigo: string
  nome: string
  unidade_estoque: string
}

interface ItemEmPoder {
  id: string
  sku_id: string
  local_origem_id: string | null
  quantidade_enviada: number
  quantidade_retornada: number
  quantidade_baixada: number
  quantidade_em_poder: number
  cad_skus: {
    codigo: string
    nome: string
    unidade_estoque: string
  } | null
  local_origem: { id: string; codigo: string; nome: string } | null
}

interface RemessaHeader {
  id: string
  numero: string
  status: string
  motivo_codigo: string
  motivo_texto: string | null
  documento: string | null
  destinatario_nome: string
  destinatario_doc: string | null
}

interface Props {
  remessa: RemessaHeader
  itens: ItemEmPoder[]
  locais: LocalOption[]
  skus: SkuOption[]
  defaultLocalId: string
}

interface BaixaLine {
  key: string
  item_id: string
  quantidade: string
  motivo_codigo: string
  motivo_texto: string
}

interface EntradaLine {
  key: string
  item_id: string
  /** Qtd do SKU enviado que sai do poder. */
  quantidade_fecha_poder: string
  /** SKU que entra no local. */
  sku_retorno_id: string
  /** Qtd que entra no local. */
  quantidade_retorno: string
  local_destino_id: string
  /**
   * Industrialização: fecha 100% do poder do enviado (fixo)
   * e só pede SKU/qtd/local do que retorna.
   */
  industrializacao?: boolean
}

function parseQtd(raw: string): number {
  const n = parseFloat(String(raw).replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

function newKey(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

type SectionId = 'em_poder' | 'baixas' | 'entradas'

const LIQUIDACAO_SECTIONS: Array<{ id: SectionId; label: string; hint: string }> = [
  {
    id: 'em_poder',
    label: 'Em poder',
    hint: 'Saldos no terceiro e atalhos de liquidação',
  },
  {
    id: 'baixas',
    label: 'Baixas',
    hint: 'Fecha poder sem entrar no estoque',
  },
  {
    id: 'entradas',
    label: 'Entradas',
    hint: 'Retorno físico — SKU pode ser outro',
  },
]

export default function RetornoForm({
  remessa,
  itens,
  locais,
  skus,
  defaultLocalId,
}: Props) {
  const router = useRouter()
  const formId = useId()
  const [isPending, startTransition] = useTransition()
  const [currentSection, setCurrentSection] = useState<SectionId>('em_poder')
  const [observacao, setObservacao] = useState('')
  const [baixas, setBaixas] = useState<BaixaLine[]>([])
  const [entradas, setEntradas] = useState<EntradaLine[]>([])
  const [feedback, setFeedback] = useState<{
    tipo: 'erro' | 'sucesso'
    texto: string
  } | null>(null)

  const activeMeta =
    LIQUIDACAO_SECTIONS.find((s) => s.id === currentSection) || LIQUIDACAO_SECTIONS[0]

  const itemById = useMemo(() => new Map(itens.map((i) => [i.id, i])), [itens])

  const motivoInfo = MOTIVOS_REMESSA.find((m) => m.codigo === remessa.motivo_codigo)
  const motivoLabel =
    remessa.motivo_codigo === 'outro'
      ? `Outro: ${remessa.motivo_texto || ''}`
      : motivoInfo?.label || remessa.motivo_codigo

  const defaultLocalFor = (item: ItemEmPoder) =>
    item.local_origem_id || defaultLocalId || locais[0]?.id || ''

  /** Soma do que as linhas atuais pretendem fechar no poder, por item. */
  const alocadoPorItem = useMemo(() => {
    const map = new Map<string, number>()
    for (const b of baixas) {
      map.set(b.item_id, (map.get(b.item_id) || 0) + parseQtd(b.quantidade))
    }
    for (const e of entradas) {
      const item = itemById.get(e.item_id)
      if (!item) continue
      let fecha = parseQtd(e.quantidade_fecha_poder)
      if (!e.industrializacao) {
        const mesmoSku = e.sku_retorno_id === item.sku_id
        if (mesmoSku) fecha = parseQtd(e.quantidade_retorno)
      }
      map.set(e.item_id, (map.get(e.item_id) || 0) + fecha)
    }
    return map
  }, [baixas, entradas, itemById])

  function restanteItem(itemId: string) {
    const item = itemById.get(itemId)
    if (!item) return 0
    return Math.max(0, item.quantidade_em_poder - (alocadoPorItem.get(itemId) || 0))
  }

  function addBaixa(itemId?: string) {
    const item = itemId ? itemById.get(itemId) : itens[0]
    if (!item) return
    const restante = restanteItem(item.id)
    setBaixas((prev) => [
      ...prev,
      {
        key: newKey('b'),
        item_id: item.id,
        quantidade: restante > 0 ? String(restante) : '',
        motivo_codigo: 'vendido_consignacao',
        motivo_texto: '',
      },
    ])
  }

  function addEntrada(itemId?: string) {
    const item = itemId ? itemById.get(itemId) : itens[0]
    if (!item) return
    const restante = restanteItem(item.id)
    setEntradas((prev) => [
      ...prev,
      {
        key: newKey('e'),
        item_id: item.id,
        quantidade_fecha_poder: restante > 0 ? String(restante) : '',
        sku_retorno_id: item.sku_id,
        quantidade_retorno: restante > 0 ? String(restante) : '',
        local_destino_id: defaultLocalFor(item),
      },
    ])
  }

  function fechaPoderEntrada(e: EntradaLine): number {
    const item = itemById.get(e.item_id)
    if (!item) return 0
    if (e.industrializacao) return parseQtd(e.quantidade_fecha_poder)
    if (e.sku_retorno_id === item.sku_id) return parseQtd(e.quantidade_retorno)
    return parseQtd(e.quantidade_fecha_poder)
  }

  function buildBaixasSugeridas(opts?: { respeitarEntradas?: boolean }): BaixaLine[] {
    const alocadoEnt = new Map<string, number>()
    if (opts?.respeitarEntradas) {
      for (const e of entradas) {
        alocadoEnt.set(e.item_id, (alocadoEnt.get(e.item_id) || 0) + fechaPoderEntrada(e))
      }
    }

    return itens.flatMap((it) => {
      const qtd = Math.max(
        0,
        it.quantidade_em_poder - (alocadoEnt.get(it.id) || 0)
      )
      if (qtd <= 1e-9) return []
      return [
        {
          key: newKey('b'),
          item_id: it.id,
          quantidade: String(qtd),
          motivo_codigo: 'vendido_consignacao',
          motivo_texto: '',
        },
      ]
    })
  }

  /** Ao abrir a aba Baixas vazia, sugere 1 linha por SKU com qtd ainda disponível. */
  useEffect(() => {
    if (currentSection !== 'baixas') return
    setBaixas((prev) =>
      prev.length > 0 ? prev : buildBaixasSugeridas({ respeitarEntradas: true })
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só reage à troca de aba / itens
  }, [currentSection, itens])

  function atalhoRetornarTudo() {
    setBaixas([])
    setEntradas(
      itens.map((it) => ({
        key: newKey('e'),
        item_id: it.id,
        quantidade_fecha_poder: String(it.quantidade_em_poder),
        sku_retorno_id: it.sku_id,
        quantidade_retorno: String(it.quantidade_em_poder),
        local_destino_id: defaultLocalFor(it),
      }))
    )
    setFeedback(null)
    setCurrentSection('entradas')
  }

  function atalhoBaixarTudo() {
    setEntradas([])
    setBaixas(buildBaixasSugeridas())
    setFeedback(null)
    setCurrentSection('baixas')
  }

  function atalhoPrepararIndustrializacao() {
    setBaixas([])
    setEntradas(
      itens.map((it) => ({
        key: newKey('e'),
        item_id: it.id,
        quantidade_fecha_poder: String(it.quantidade_em_poder),
        sku_retorno_id: '',
        quantidade_retorno: '',
        local_destino_id: defaultLocalFor(it),
        industrializacao: true,
      }))
    )
    setFeedback({
      tipo: 'sucesso',
      texto:
        'Industrialização: o poder do enviado será fechado integralmente. Informe só o SKU e a quantidade que retornam ao estoque.',
    })
    setCurrentSection('entradas')
  }

  function updateBaixa(key: string, patch: Partial<BaixaLine>) {
    setBaixas((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  function updateEntrada(key: string, patch: Partial<EntradaLine>) {
    setEntradas((prev) =>
      prev.map((r) => {
        if (r.key !== key) return r
        const next = { ...r, ...patch }
        const item = itemById.get(next.item_id)
        if (!item) return next

        // Industrialização: poder permanece 100% travado no enviado
        if (next.industrializacao) {
          next.quantidade_fecha_poder = String(item.quantidade_em_poder)
          next.item_id = r.item_id
          return next
        }

        // Mesmo SKU: fecha poder acompanha qtd que entra
        if (
          ('quantidade_retorno' in patch || 'sku_retorno_id' in patch) &&
          next.sku_retorno_id === item.sku_id
        ) {
          next.quantidade_fecha_poder = next.quantidade_retorno
        }
        // Troca de item-fonte: reseta SKU/local default
        if ('item_id' in patch && patch.item_id) {
          const novo = itemById.get(patch.item_id)
          if (novo) {
            next.sku_retorno_id = novo.sku_id
            next.local_destino_id = defaultLocalFor(novo)
            const rest = Math.max(
              0,
              novo.quantidade_em_poder - (alocadoPorItem.get(novo.id) || 0)
            )
            next.quantidade_retorno = rest > 0 ? String(rest) : next.quantidade_retorno
            next.quantidade_fecha_poder = next.quantidade_retorno
          }
        }
        return next
      })
    )
  }

  function handleSubmit() {
    // Validação agregada por item
    for (const it of itens) {
      const alocado = alocadoPorItem.get(it.id) || 0
      if (alocado > it.quantidade_em_poder + 1e-9) {
        setFeedback({
          tipo: 'erro',
          texto: `${it.cad_skus?.codigo}: fechamento (${alocado}) > em poder (${it.quantidade_em_poder}).`,
        })
        return
      }
    }

    const payload: Array<{
      item_id: string
      quantidade_retorno: number
      sku_retorno_id?: string
      local_destino_id?: string
      quantidade_fecha_poder?: number
      quantidade_baixa: number
      motivo_baixa_codigo?: string
      motivo_baixa_texto?: string
    }> = []

    for (const b of baixas) {
      const item = itemById.get(b.item_id)
      if (!item) continue
      const qtd = parseQtd(b.quantidade)
      if (qtd <= 0) continue
      if (b.motivo_codigo === 'outro' && b.motivo_texto.trim().length < 3) {
        setFeedback({
          tipo: 'erro',
          texto: `Descreva o motivo da baixa para ${item.cad_skus?.codigo}.`,
        })
        return
      }
      payload.push({
        item_id: b.item_id,
        quantidade_retorno: 0,
        quantidade_baixa: qtd,
        motivo_baixa_codigo: b.motivo_codigo,
        motivo_baixa_texto:
          b.motivo_codigo === 'outro' ? b.motivo_texto.trim() : undefined,
      })
    }

    for (const e of entradas) {
      const item = itemById.get(e.item_id)
      if (!item) continue
      const qtdRet = parseQtd(e.quantidade_retorno)
      const mesmoSku = e.sku_retorno_id === item.sku_id
      const fecha = e.industrializacao
        ? parseQtd(e.quantidade_fecha_poder) || item.quantidade_em_poder
        : mesmoSku
          ? qtdRet
          : parseQtd(e.quantidade_fecha_poder)

      if (qtdRet <= 0 && fecha <= 0) continue

      if (!e.sku_retorno_id) {
        setFeedback({
          tipo: 'erro',
          texto: e.industrializacao
            ? `Industrialização: selecione o SKU que retorna (${item.cad_skus?.codigo}).`
            : `Selecione o SKU que entra (${item.cad_skus?.codigo}).`,
        })
        return
      }
      if (qtdRet <= 0) {
        setFeedback({
          tipo: 'erro',
          texto: e.industrializacao
            ? `Industrialização: informe a quantidade que retorna (${item.cad_skus?.codigo}).`
            : `Informe a quantidade que entra no estoque (${item.cad_skus?.codigo}).`,
        })
        return
      }
      if (fecha <= 0) {
        setFeedback({
          tipo: 'erro',
          texto: `Informe quanto do SKU enviado sai do poder (${item.cad_skus?.codigo}).`,
        })
        return
      }
      if (!e.local_destino_id) {
        setFeedback({
          tipo: 'erro',
          texto: `Selecione o local de destino para ${item.cad_skus?.codigo}.`,
        })
        return
      }

      payload.push({
        item_id: e.item_id,
        quantidade_retorno: qtdRet,
        sku_retorno_id: e.sku_retorno_id,
        local_destino_id: e.local_destino_id,
        quantidade_fecha_poder: fecha,
        quantidade_baixa: 0,
      })
    }

    if (payload.length === 0) {
      setFeedback({
        tipo: 'erro',
        texto: 'Adicione ao menos uma linha de baixa ou de entrada.',
      })
      return
    }

    setFeedback(null)
    startTransition(async () => {
      const res = await registrarRetornosRemessaAction({
        remessa_id: remessa.id,
        observacao: observacao.trim() || undefined,
        itens: payload,
      })

      if ('error' in res && res.error) {
        setFeedback({ tipo: 'erro', texto: res.error })
        return
      }

      if (!res.sucesso) {
        setFeedback({
          tipo: 'erro',
          texto: res.mensagem || 'Falha ao registrar liquidação.',
        })
        return
      }

      setFeedback({ tipo: 'sucesso', texto: res.mensagem })
      setTimeout(() => {
        router.push(`/cockpit/estoque/remessas/${remessa.id}`)
        router.refresh()
      }, res.parcial ? 1400 : 700)
    })
  }

  if (itens.length === 0) {
    return (
      <div className="bg-[#121820] border border-[#ffffff0a] rounded-2xl p-10 text-center space-y-3">
        <CheckCircle2 className="h-8 w-8 text-emerald-400 mx-auto" />
        <h2 className="text-sm font-semibold text-white">Nada em poder do terceiro</h2>
        <p className="text-xs text-gray-400 max-w-md mx-auto">
          Todos os itens desta remessa já foram liquidados (retornados e/ou baixados).
        </p>
        <Link
          href={`/cockpit/estoque/remessas/${remessa.id}`}
          className="inline-flex text-xs text-purple-300 hover:text-white transition-colors"
        >
          ← Voltar ao detalhe
        </Link>
      </div>
    )
  }

  const itemOptions = itens.map((it) => ({
    value: it.id,
    label: `${it.cad_skus?.codigo || 'SKU'} · em poder ${it.quantidade_em_poder} ${it.cad_skus?.unidade_estoque || 'UN'}`,
    searchText: `${it.cad_skus?.codigo || ''} ${it.cad_skus?.nome || ''}`,
  }))

  const sectionsWithCount = LIQUIDACAO_SECTIONS.map((s) => {
    if (s.id === 'baixas' && baixas.length > 0) {
      return { ...s, label: `Baixas (${baixas.length})` }
    }
    if (s.id === 'entradas' && entradas.length > 0) {
      return { ...s, label: `Entradas (${entradas.length})` }
    }
    if (s.id === 'em_poder') {
      return { ...s, label: `Em poder (${itens.length})` }
    }
    return s
  })

  return (
    <div className="space-y-3">
      {feedback && (
        <div
          className={`p-3 rounded-xl text-xs flex items-start gap-2.5 border animate-in fade-in duration-300 ${
            feedback.tipo === 'sucesso'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              : 'bg-red-500/10 border-red-500/20 text-red-400'
          }`}
        >
          {feedback.tipo === 'sucesso' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
          ) : (
            <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
          )}
          <div>{feedback.texto}</div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400 px-0.5">
        <span className="font-mono font-bold text-purple-300 inline-flex items-center gap-1.5">
          <Truck className="h-3.5 w-3.5" />
          {remessa.numero}
        </span>
        <span className="text-gray-600">·</span>
        <span className="text-white truncate max-w-[14rem]" title={remessa.destinatario_nome}>
          {remessa.destinatario_nome}
        </span>
        <span className="text-gray-600 hidden sm:inline">·</span>
        <span className="truncate max-w-[12rem] hidden sm:inline">{motivoLabel}</span>
        <span className="ml-auto capitalize text-purple-300/90">{remessa.status}</span>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#ffffff0a] bg-[#111111] shadow-2xl">
        <div className="border-b border-[#ffffff0a] bg-[#0A0A0A]/80 px-3 pt-3 pb-2 sm:px-4">
          <p className="mb-2 px-1 text-[10px] font-black uppercase tracking-widest text-gray-600">
            Seções
          </p>
          <nav className="grid grid-cols-1 gap-1.5 sm:grid-cols-3" role="tablist">
            {sectionsWithCount.map((item) => {
              const active = item.id === currentSection
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setCurrentSection(item.id)}
                  className={`rounded-xl px-2.5 py-2.5 text-left transition-all ${
                    active
                      ? 'bg-gradient-to-r from-[#2BAADF]/20 to-[#2BAADF]/5 text-[#2BAADF] border border-[#2BAADF]/25'
                      : 'text-gray-400 hover:bg-[#ffffff08] hover:text-white border border-transparent'
                  }`}
                >
                  <span className="block text-sm font-semibold tracking-tight leading-tight">
                    {item.label}
                  </span>
                  <span className="mt-0.5 block text-[10px] leading-snug text-gray-500 line-clamp-2">
                    {item.hint}
                  </span>
                </button>
              )
            })}
          </nav>
        </div>

        <div className="border-b border-[#ffffff08] px-5 py-3 sm:px-6 flex items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-white">{activeMeta.label}</h3>
            <p className="text-xs text-gray-500">{activeMeta.hint}</p>
          </div>
          {currentSection === 'baixas' && (
            <button
              type="button"
              onClick={() => addBaixa()}
              className="inline-flex items-center gap-1 rounded-xl bg-amber-500/15 border border-amber-500/25 px-3 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              Baixa
            </button>
          )}
          {currentSection === 'entradas' && (
            <button
              type="button"
              onClick={() => addEntrada()}
              className="inline-flex items-center gap-1 rounded-xl bg-emerald-500/15 border border-emerald-500/25 px-3 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              Entrada
            </button>
          )}
        </div>

        <div className="min-h-[20rem] p-4 sm:p-5">
          {/* Aba Em poder */}
          <div
            className={currentSection === 'em_poder' ? 'space-y-4' : 'hidden'}
            role="tabpanel"
          >
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={atalhoRetornarTudo}
                className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-500/15"
              >
                <Zap className="h-3 w-3" />
                Retornar tudo
              </button>
              <button
                type="button"
                onClick={atalhoBaixarTudo}
                className="inline-flex items-center gap-1 rounded-lg border border-amber-500/25 bg-amber-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-amber-300 hover:bg-amber-500/15"
              >
                <Zap className="h-3 w-3" />
                Baixar tudo
              </button>
              <button
                type="button"
                onClick={atalhoPrepararIndustrializacao}
                className="inline-flex items-center gap-1 rounded-lg border border-[#2BAADF]/25 bg-[#2BAADF]/10 px-2.5 py-1.5 text-[11px] font-semibold text-[#2BAADF] hover:bg-[#2BAADF]/15"
              >
                <Zap className="h-3 w-3" />
                Preparar industrialização
              </button>
            </div>

            <div className="overflow-x-auto rounded-xl border border-[#ffffff08]">
              <table className="w-full text-left text-xs text-gray-300">
                <thead className="bg-[#0A0A0A] text-gray-500 uppercase tracking-wider text-[10px] border-b border-[#ffffff08]">
                  <tr>
                    <th className="py-2.5 px-3">SKU enviado</th>
                    <th className="py-2.5 px-3 text-right">Enviado</th>
                    <th className="py-2.5 px-3 text-right">Retornada</th>
                    <th className="py-2.5 px-3 text-right">Baixada</th>
                    <th className="py-2.5 px-3 text-right">Em poder</th>
                    <th className="py-2.5 px-3 text-right">Nesta tela</th>
                    <th className="py-2.5 px-3 text-right">Restante</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#ffffff05]">
                  {itens.map((it) => {
                    const alocado = alocadoPorItem.get(it.id) || 0
                    const rest = Math.max(0, it.quantidade_em_poder - alocado)
                    const um = it.cad_skus?.unidade_estoque || 'UN'
                    const overflow = alocado > it.quantidade_em_poder + 1e-9
                    return (
                      <tr key={it.id}>
                        <td className="py-2.5 px-3">
                          <span className="font-mono font-bold text-white">
                            {it.cad_skus?.codigo || '—'}
                          </span>
                          <span className="text-[11px] text-gray-500 block truncate max-w-[16rem]">
                            {it.cad_skus?.nome}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-gray-400">
                          {it.quantidade_enviada} {um}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-emerald-400/80">
                          {it.quantidade_retornada || '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-amber-300/90">
                          {it.quantidade_baixada || '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-purple-300">
                          {it.quantidade_em_poder} {um}
                        </td>
                        <td
                          className={`py-2.5 px-3 text-right font-mono ${
                            overflow ? 'text-red-400' : 'text-amber-300/90'
                          }`}
                        >
                          {alocado || '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-emerald-400/90">
                          {rest} {um}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Aba Baixas */}
          <div
            className={currentSection === 'baixas' ? 'space-y-3' : 'hidden'}
            role="tabpanel"
          >
            {baixas.length === 0 ? (
              <p className="py-10 text-center text-xs text-gray-500">
                Nenhuma baixa sugerida. Use “+ Baixa” para incluir linhas.
              </p>
            ) : (
              <>
                <p className="text-[11px] text-amber-300/80 px-0.5">
                  Sugestão: SKUs em poder com a quantidade ainda aberta. Ajuste, exclua ou
                  altere o motivo antes de confirmar.
                </p>
                <div className="overflow-x-auto rounded-xl border border-[#ffffff08]">
                  <table className="w-full text-left text-xs text-gray-300">
                    <thead className="bg-[#0A0A0A] text-gray-500 uppercase tracking-wider text-[10px] border-b border-[#ffffff08]">
                      <tr>
                        <th className="py-2.5 px-3 min-w-[12rem]">Item / SKU enviado</th>
                        <th className="py-2.5 px-3 w-28">Qtd</th>
                        <th className="py-2.5 px-3 min-w-[11rem]">Motivo</th>
                        <th className="py-2.5 px-3 w-10" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#ffffff05]">
                      {baixas.map((b) => {
                        const item = itemById.get(b.item_id)
                        const um = item?.cad_skus?.unidade_estoque || 'UN'
                        return (
                      <tr key={b.key} className="align-top">
                        <td className="py-2.5 px-3">
                          <select
                            value={b.item_id}
                            onChange={(e) =>
                              updateBaixa(b.key, { item_id: e.target.value })
                            }
                            className="w-full bg-[#0d1218] border border-[#ffffff10] rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500/50"
                          >
                            {itemOptions.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                          {item && (
                            <span className="mt-1 block text-[10px] text-gray-500">
                              Em poder: {item.quantidade_em_poder} {um}
                              {item.quantidade_enviada !== item.quantidade_em_poder
                                ? ` · enviado ${item.quantidade_enviada}`
                                : ''}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          <input
                            type="text"
                            value={b.quantidade}
                            onChange={(e) =>
                              updateBaixa(b.key, { quantidade: e.target.value })
                            }
                            className="w-full bg-[#0d1218] border border-[#ffffff10] rounded-lg px-2 py-1.5 text-xs text-white font-mono text-right focus:outline-none focus:border-amber-500/50"
                          />
                        </td>
                        <td className="py-2.5 px-3 space-y-1">
                          <select
                            value={b.motivo_codigo}
                            onChange={(e) =>
                              updateBaixa(b.key, { motivo_codigo: e.target.value })
                            }
                            className="w-full bg-[#0d1218] border border-[#ffffff10] rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500/50"
                          >
                            {MOTIVOS_BAIXA_REMESSA.map((m) => (
                              <option key={m.codigo} value={m.codigo}>
                                {m.label}
                              </option>
                            ))}
                          </select>
                          {b.motivo_codigo === 'outro' && (
                            <input
                              type="text"
                              value={b.motivo_texto}
                              onChange={(e) =>
                                updateBaixa(b.key, { motivo_texto: e.target.value })
                              }
                              placeholder="Descreva…"
                              className="w-full bg-[#0d1218] border border-[#ffffff10] rounded-lg px-2 py-1 text-[11px] text-white focus:outline-none focus:border-amber-500/50"
                            />
                          )}
                        </td>
                        <td className="py-2.5 px-2">
                          <button
                            type="button"
                            onClick={() =>
                              setBaixas((prev) => prev.filter((x) => x.key !== b.key))
                            }
                            className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10"
                            aria-label="Remover baixa"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          {/* Aba Entradas */}
          <div
            className={currentSection === 'entradas' ? 'space-y-3' : 'hidden'}
            role="tabpanel"
          >
            {entradas.length === 0 ? (
              <p className="py-10 text-center text-xs text-gray-500">
                Nenhuma entrada. Use “+ Entrada” ou o atalho “Retornar tudo” na aba Em poder.
              </p>
            ) : (
              <>
                {entradas.some((e) => e.industrializacao) && (
                  <p className="text-[11px] text-[#2BAADF]/90 px-0.5">
                    Industrialização: o poder do SKU enviado fecha 100% automaticamente — informe
                    apenas o SKU e a quantidade que retornam.
                  </p>
                )}
                <div className="overflow-x-auto rounded-xl border border-[#ffffff08]">
                  <table className="w-full text-left text-xs text-gray-300">
                    <thead className="bg-[#0A0A0A] text-gray-500 uppercase tracking-wider text-[10px] border-b border-[#ffffff08]">
                      <tr>
                        <th className="py-2.5 px-3 min-w-[11rem]">SKU enviado</th>
                        <th className="py-2.5 px-3 w-28">Fecha poder</th>
                        <th className="py-2.5 px-3 min-w-[12rem]">SKU que retorna</th>
                        <th className="py-2.5 px-3 w-28">Qtd retorna</th>
                        <th className="py-2.5 px-3 min-w-[9rem]">Local</th>
                        <th className="py-2.5 px-3 w-10" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#ffffff05]">
                      {entradas.map((e) => {
                        const item = itemById.get(e.item_id)
                        const mesmoSku = item
                          ? Boolean(e.sku_retorno_id) && e.sku_retorno_id === item.sku_id
                          : false
                        const um = item?.cad_skus?.unidade_estoque || 'UN'
                        const ind = Boolean(e.industrializacao)

                        return (
                          <tr key={e.key} className="align-top">
                            <td className="py-2.5 px-3">
                              {ind ? (
                                <div>
                                  <span className="font-mono font-bold text-white">
                                    {item?.cad_skus?.codigo || '—'}
                                  </span>
                                  <span className="mt-0.5 block text-[10px] text-[#2BAADF]/80">
                                    Industrialização · poder integral
                                  </span>
                                </div>
                              ) : (
                                <select
                                  value={e.item_id}
                                  onChange={(ev) =>
                                    updateEntrada(e.key, { item_id: ev.target.value })
                                  }
                                  className="w-full bg-[#0d1218] border border-[#ffffff10] rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500/50"
                                >
                                  {itemOptions.map((o) => (
                                    <option key={o.value} value={o.value}>
                                      {o.label}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </td>
                            <td className="py-2.5 px-3">
                              {ind ? (
                                <span className="inline-flex font-mono text-amber-300/90">
                                  {e.quantidade_fecha_poder} {um}
                                </span>
                              ) : (
                                <input
                                  type="text"
                                  value={e.quantidade_fecha_poder}
                                  disabled={mesmoSku}
                                  onChange={(ev) =>
                                    updateEntrada(e.key, {
                                      quantidade_fecha_poder: ev.target.value,
                                    })
                                  }
                                  title={
                                    mesmoSku
                                      ? 'Mesmo SKU: fecha poder = qtd que entra'
                                      : 'Qtd do enviado que sai do poder'
                                  }
                                  className="w-full bg-[#0d1218] border border-[#ffffff10] rounded-lg px-2 py-1.5 text-xs text-white font-mono text-right focus:outline-none focus:border-emerald-500/50 disabled:opacity-50"
                                />
                              )}
                            </td>
                            <td className="py-2.5 px-3">
                              <SearchableSelect
                                value={e.sku_retorno_id}
                                onChange={(sku_retorno_id) =>
                                  updateEntrada(e.key, { sku_retorno_id })
                                }
                                placeholder="SKU que retorna…"
                                emptyLabel="Nenhum SKU"
                                options={skus.map((s) => ({
                                  value: s.id,
                                  label: `${s.codigo} — ${s.nome}`,
                                  searchText: `${s.codigo} ${s.nome}`,
                                }))}
                                inputClassName="w-full bg-[#0d1218] border border-[#ffffff10] rounded-lg pl-8 pr-8 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500/50"
                              />
                            </td>
                            <td className="py-2.5 px-3">
                              <input
                                type="text"
                                value={e.quantidade_retorno}
                                onChange={(ev) =>
                                  updateEntrada(e.key, {
                                    quantidade_retorno: ev.target.value,
                                  })
                                }
                                placeholder={ind ? 'Qtd…' : undefined}
                                className="w-full bg-[#0d1218] border border-[#ffffff10] rounded-lg px-2 py-1.5 text-xs text-white font-mono text-right focus:outline-none focus:border-emerald-500/50"
                              />
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="flex items-center gap-1">
                                <MapPin className="h-3 w-3 text-gray-500 shrink-0" />
                                <select
                                  value={e.local_destino_id}
                                  onChange={(ev) =>
                                    updateEntrada(e.key, {
                                      local_destino_id: ev.target.value,
                                    })
                                  }
                                  className="w-full bg-[#0d1218] border border-[#ffffff10] rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500/50"
                                >
                                  {locais.map((l) => (
                                    <option key={l.id} value={l.id}>
                                      {l.codigo}
                                      {l.eh_principal ? ' ★' : ''}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </td>
                            <td className="py-2.5 px-2">
                              <button
                                type="button"
                                onClick={() =>
                                  setEntradas((prev) =>
                                    prev.filter((x) => x.key !== e.key)
                                  )
                                }
                                className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10"
                                aria-label="Remover entrada"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="border-t border-[#ffffff08] bg-[#0A0A0A]/90 px-4 py-4 sm:px-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex-1 min-w-0 w-full sm:max-w-md">
            <label
              htmlFor={`${formId}-obs`}
              className="mb-1 flex items-center gap-1 text-[10px] font-medium text-gray-400"
            >
              <FileText className="h-3 w-3" />
              Observação (opcional)
            </label>
            <input
              id={`${formId}-obs`}
              type="text"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Ex: parcial + consignação / industrialização"
              className="w-full rounded-xl border border-[#ffffff10] bg-[#0d1218] px-3 py-2 text-xs text-white focus:outline-none focus:border-[#2BAADF]/50"
            />
          </div>
          <div className="flex items-center justify-end gap-3 shrink-0">
            <Link
              href={`/cockpit/estoque/remessas/${remessa.id}`}
              className="text-xs text-gray-400 hover:text-white transition-colors"
            >
              Cancelar
            </Link>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isPending}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/20 hover:opacity-95 disabled:opacity-50 transition"
            >
              {isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Processando…
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Confirmar liquidação
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
