'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { codigoConfirmadoPeloOperador, deveOferecerVinculo, extrairCodigosEtiqueta } from '@/lib/compras/codigo-etiqueta'
import { aprenderCodigoImportado, confirmarItemImportado, fecharRecebimentoImportado, identificarEtiquetaImportado } from '../actions'

type Item = { id: string; descricao: string; unidade: string; saldo: number; skuCodigo: string }
type Local = { id: string; codigo: string; nome: string }
type Origem = 'sku' | 'alternativo' | 'ocr' | 'manual'
type Candidato = {
  pedido_item_id?: string | null
  descricao?: string
  origem?: Origem
  codigo?: string
  codigo_lido?: string
  saldo?: number
}

const ORIGEM_LABEL: Record<Origem, string> = {
  sku: 'SKU do Hugin Flow',
  alternativo: 'Código do fornecedor',
  ocr: 'OCR com correspondência',
  manual: 'Confirmação manual',
}

export default function ConferenciaImportado({
  pedidoId,
  podeConferir,
  podeCadastrar,
  fornecedorNome,
  itens,
  locais,
  limpeza,
  impressora,
}: {
  pedidoId: string
  podeConferir: boolean
  podeCadastrar: boolean
  fornecedorNome: string
  itens: Item[]
  locais: Local[]
  limpeza: string
  impressora: string
}) {
  const router = useRouter()
  const leituraRef = useRef<HTMLInputElement>(null)
  const [codigo, setCodigo] = useState('')
  const [origem, setOrigem] = useState<Origem | null>(null)
  const [capturaFoto, setCapturaFoto] = useState(false)
  const [itemId, setItemId] = useState('')
  const [descricao, setDescricao] = useState('')
  const [candidatos, setCandidatos] = useState<Candidato[]>([])
  const [quantidade, setQuantidade] = useState('1')
  const [localId, setLocalId] = useState('')
  const [temporario, setTemporario] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [etiqueta, setEtiqueta] = useState<string | null>(null)
  const [codigoNovo, setCodigoNovo] = useState(false)
  const [codigosFoto, setCodigosFoto] = useState<string[]>([])
  const [ofertaVinculo, setOfertaVinculo] = useState(false)
  const [pending, start] = useTransition()

  function limparIdentificacao() {
    setOrigem(null)
    setItemId('')
    setDescricao('')
    setCandidatos([])
    setCodigoNovo(false)
    setOfertaVinculo(false)
  }

  function aplicarResultado(
    resultado: {
      status?: string
      pedido_item_id?: string | null
      descricao?: string
      origem?: Origem
      codigo_lido?: string
      candidatos?: Candidato[]
    },
    porFoto: boolean,
  ) {
    limparIdentificacao()
    if (resultado.status === 'inconclusivo') {
      setCandidatos(
        itens
          .filter((item) => item.saldo > 0)
          .map((item) => ({ pedido_item_id: item.id, descricao: item.descricao, saldo: item.saldo })),
      )
      setCodigoNovo(true)
      setErro('A leitura não garante um único SKU. Escolha o item do pedido.')
      return
    }
    if (resultado.status === 'unico' && resultado.pedido_item_id) {
      if (resultado.codigo_lido) setCodigo(resultado.codigo_lido)
      setItemId(resultado.pedido_item_id)
      setDescricao(resultado.descricao || '')
      setOrigem(porFoto ? 'ocr' : (resultado.origem || 'sku'))
      return
    }
    if (resultado.status === 'ambiguo') {
      setCandidatos(resultado.candidatos || [])
      setErro('Há mais de um produto possível. Escolha o item do pedido.')
      return
    }
    if (resultado.status === 'fora_do_pedido') {
      setErro('O código identifica um SKU que não está neste pedido.')
      return
    }
    setCandidatos(
      itens
        .filter((item) => item.saldo > 0)
        .map((item) => ({ pedido_item_id: item.id, descricao: item.descricao, saldo: item.saldo })),
    )
    setCodigoNovo(true)
    setErro('Nenhum SKU corresponde a este código. Escolha o item do pedido para confirmar manualmente.')
  }

  function identificar(codigos: string[], porFoto: boolean) {
    setErro(null)
    setAviso(null)
    setCapturaFoto(porFoto)
    start(async () => {
      const res = await identificarEtiquetaImportado({ pedidoId, codigos })
      if (res.error || !res.resultado) {
        limparIdentificacao()
        setErro(res.error || 'Não foi possível identificar a etiqueta.')
        return
      }
      aplicarResultado(res.resultado, porFoto)
    })
  }

  async function lerFoto(file: File) {
    setErro(null)
    limparIdentificacao()
    try {
      const { createWorker } = await import('tesseract.js')
      const worker = await createWorker('eng')
      const { data } = await worker.recognize(file)
      await worker.terminate()
      const extraidos = extrairCodigosEtiqueta(data.text || '')
      if (!extraidos.length) {
        setCandidatos(
          itens
            .filter((item) => item.saldo > 0)
            .map((item) => ({ pedido_item_id: item.id, descricao: item.descricao, saldo: item.saldo })),
        )
        setErro('A foto não mostrou um número utilizável. Escolha o item do pedido.')
        return
      }
      setCodigosFoto(extraidos)
      setCodigo(extraidos[0])
      identificar(extraidos, true)
    } catch {
      setErro('A leitura da foto falhou. Digite o código ou escolha o item do pedido.')
    }
  }

  function confirmar(salvarVinculo: boolean) {
    if (!origem || !itemId) return
    const codigoVinculo = codigoConfirmadoPeloOperador(
      codigosFoto.length ? codigosFoto : [codigo],
      codigo,
    )
    if (salvarVinculo && !codigoVinculo) {
      setErro('Escolha o código lido antes de salvar o vínculo.')
      return
    }
    if (
      !salvarVinculo &&
      ofertaVinculo === false &&
      deveOferecerVinculo(origem, !codigoNovo) &&
      podeCadastrar
    ) {
      setOfertaVinculo(true)
      setErro(null)
      return
    }
    setErro(null)
    setAviso(null)
    start(async () => {
      if (salvarVinculo) {
        const vinculo = await aprenderCodigoImportado({
          pedidoId,
          pedidoItemId: itemId,
          codigoLido: codigoVinculo,
        })
        if (vinculo.error || !vinculo.ok) {
          setOfertaVinculo(true)
          setErro(vinculo.error || 'Não foi possível salvar o vínculo.')
          return
        }
        setAviso('Vínculo salvo para os próximos recebimentos deste fornecedor.')
      } else if (codigoNovo && !podeCadastrar) {
        setAviso('O cadastro deste código exige autorização de manutenção do de-para.')
      }
      const res = await confirmarItemImportado({
        pedidoId,
        pedidoItemId: itemId,
        codigoLido: codigo,
        origem,
        quantidade: Number(String(quantidade).replace(',', '.')) || 0,
        localId: temporario.trim() ? '' : localId,
        localTemporario: temporario,
      })
      if (res.error || !res.codigo) {
        setErro(res.error || 'Não foi possível confirmar o item.')
        return
      }
      setEtiqueta(`${res.codigo} · ${res.descricao}`)
      setCodigo('')
      setCodigosFoto([])
      limparIdentificacao()
      setQuantidade('1')
      setTemporario('')
      router.refresh()
      leituraRef.current?.focus()
    })
  }

  function fechar() {
    setErro(null)
    start(async () => {
      const res = await fecharRecebimentoImportado(pedidoId)
      if (res.error) {
        setErro(res.error)
        return
      }
      const partes = [
        res.fechou ? 'Pedido recebido.' : 'Pedido com recebimento parcial.',
        res.entradas?.length ? `Entradas: ${res.entradas.join(', ')}` : '',
        ...(res.avisos || []),
      ].filter(Boolean)
      setAviso(partes.join(' '))
      router.refresh()
    })
  }

  const itemEscolhido = itens.find((item) => item.id === itemId)

  return (
    <div className="space-y-4">
      <div className="etiqueta-item hidden print:block rounded-2xl bg-white p-6 text-center text-black">
        <p className="text-xs uppercase tracking-widest">Etiqueta do item</p>
        <p className="mt-2 font-mono text-3xl font-semibold">{etiqueta}</p>
      </div>
      <div className="space-y-3 rounded-2xl border border-[#ffffff0a] p-4 print:hidden">
        <p className="text-xs text-gray-500">
          O código lido só confirma o item quando coincide com o SKU do Hugin Flow ou com um código
          de fornecedor já cadastrado para um único produto desta empresa.
        </p>
        {podeConferir ? (
          <>
            <label className="block text-sm text-gray-300">
              Leitura do scanner
              <input
                ref={leituraRef}
                autoFocus
                value={codigo}
                onChange={(e) => {
                  setCodigo(e.target.value)
                  setCodigosFoto([])
                  limparIdentificacao()
                }}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return
                  e.preventDefault()
                  if (codigo.trim()) identificar([codigo], false)
                }}
                placeholder="Aponte o leitor ou digite o código"
                className="mt-1 h-10 w-full rounded-xl border border-[#ffffff14] bg-[#0A0A0A] px-3 font-mono text-sm text-white"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={pending || !codigo.trim()}
                onClick={() => identificar([codigo], false)}
                className="rounded-xl border border-[#ffffff14] px-3 py-2 text-sm text-gray-200 disabled:opacity-40"
              >
                Identificar
              </button>
              <label className="cursor-pointer rounded-xl border border-[#ffffff14] px-3 py-2 text-sm text-gray-200">
                Foto da etiqueta
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) void lerFoto(file)
                    e.target.value = ''
                  }}
                />
              </label>
            </div>
            {codigo.trim() ? (
              <p className="font-mono text-sm text-white">Código capturado: {codigo.trim()}</p>
            ) : null}
            {origem && itemEscolhido ? (
              <div className="rounded-xl border border-[#2BAADF]/30 bg-[#2BAADF]/10 px-3 py-2 text-sm">
                <p className="text-white">{descricao || itemEscolhido.descricao}</p>
                <p className="text-xs text-[#2BAADF]">Identificação: {ORIGEM_LABEL[origem]}</p>
              </div>
            ) : null}
            {candidatos.length ? (
              <label className="block text-sm text-gray-300">
                Item do pedido
                <select
                  value={itemId}
                  onChange={(e) => {
                    const id = e.target.value
                    const escolhido = candidatos.find((item) => item.pedido_item_id === id)
                    setItemId(id)
                    setDescricao(escolhido?.descricao || '')
                    if (escolhido?.codigo_lido) setCodigo(escolhido.codigo_lido)
                    setCodigoNovo(Boolean(id) && !escolhido?.codigo_lido)
                    setOfertaVinculo(false)
                    setOrigem(id ? (capturaFoto && escolhido?.codigo_lido ? 'ocr' : 'manual') : null)
                  }}
                  className="mt-1 h-10 w-full rounded-xl border border-[#ffffff14] bg-[#0A0A0A] px-3 text-sm text-white"
                >
                  <option value="">Selecione o produto</option>
                  {candidatos.map((item) => (
                    <option key={`${item.pedido_item_id || ''}:${item.codigo || ''}`} value={item.pedido_item_id || ''}>
                      {item.descricao}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm text-gray-300">
                Quantidade
                <input
                  value={quantidade}
                  onChange={(e) => setQuantidade(e.target.value)}
                  inputMode="decimal"
                  className="mt-1 h-10 w-full rounded-xl border border-[#ffffff14] bg-[#0A0A0A] px-3 text-sm text-white"
                />
              </label>
              <label className="block text-sm text-gray-300">
                Local de estoque
                <select
                  value={localId}
                  onChange={(e) => setLocalId(e.target.value)}
                  className="mt-1 h-10 w-full rounded-xl border border-[#ffffff14] bg-[#0A0A0A] px-3 text-sm text-white"
                >
                  <option value="">Sem local de armazenamento</option>
                  {locais.map((local) => (
                    <option key={local.id} value={local.id}>
                      {local.codigo} — {local.nome}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {!localId ? (
              <label className="block text-sm text-gray-300">
                Local temporário
                <input
                  value={temporario}
                  onChange={(e) => setTemporario(e.target.value)}
                  placeholder="Para onde o item segue no cross-dock"
                  className="mt-1 h-10 w-full rounded-xl border border-[#ffffff14] bg-[#0A0A0A] px-3 text-sm text-white"
                />
              </label>
            ) : null}
            <p className="text-[11px] text-gray-500">
              Limpeza do local temporário: {limpeza}. Impressora: {impressora}.
            </p>
            {codigosFoto.length > 1 && codigoNovo ? (
              <label className="block text-sm text-gray-300">
                Código lido na foto
                <select
                  value={codigo}
                  onChange={(e) => {
                    setCodigo(e.target.value)
                    setOfertaVinculo(false)
                  }}
                  className="mt-1 h-10 w-full rounded-xl border border-[#ffffff14] bg-[#0A0A0A] px-3 font-mono text-sm text-white"
                >
                  {codigosFoto.map((lido) => (
                    <option key={lido} value={lido}>
                      {lido}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {ofertaVinculo && itemEscolhido ? (
              <div className="space-y-3 rounded-xl border border-[#2BAADF]/30 bg-[#2BAADF]/10 p-3">
                <p className="text-sm text-white">Salvar este código para os próximos recebimentos?</p>
                <dl className="space-y-1 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-gray-400">Código do importador</dt>
                    <dd className="font-mono text-white">{codigo.trim()}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-gray-400">Fornecedor</dt>
                    <dd className="text-right text-white">{fornecedorNome || 'Fornecedor do pedido'}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-gray-400">SKU interno</dt>
                    <dd className="font-mono text-white">{itemEscolhido.skuCodigo || '—'}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-gray-400">Produto</dt>
                    <dd className="text-right text-white">{descricao || itemEscolhido.descricao}</dd>
                  </div>
                </dl>
                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => confirmar(false)}
                    className="rounded-xl border border-[#ffffff14] px-3 py-2 text-sm text-gray-200 disabled:opacity-40"
                  >
                    Não salvar
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => confirmar(true)}
                    className="rounded-xl bg-gradient-to-r from-[#2BAADF] to-[#1A8FBF] px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
                  >
                    Confirmar vínculo
                  </button>
                </div>
              </div>
            ) : null}
            <button
              type="button"
              disabled={pending || !origem || !itemId || !codigo.trim() || ofertaVinculo}
              onClick={() => confirmar(false)}
              className="rounded-xl bg-gradient-to-r from-[#2BAADF] to-[#1A8FBF] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              Confirmar item
            </button>
          </>
        ) : (
          <p className="text-sm text-gray-400">Este pedido não está aberto para conferência.</p>
        )}
        {erro ? <p className="text-sm text-red-300">{erro}</p> : null}
        {aviso ? <p className="text-sm text-emerald-300">{aviso}</p> : null}
        {etiqueta ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-gray-300">Item confirmado: {etiqueta}</p>
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-xl border border-[#ffffff14] px-3 py-1.5 text-sm text-gray-200"
            >
              Imprimir etiqueta
            </button>
          </div>
        ) : null}
      </div>
      <div className="overflow-hidden rounded-2xl border border-[#ffffff08] print:hidden">
        {itens.map((item) => (
          <div key={item.id} className="flex items-center justify-between border-t border-[#ffffff08] px-3 py-2 first:border-t-0">
            <p className="truncate text-sm text-white">{item.descricao}</p>
            <p className="text-xs text-gray-500">saldo {item.saldo} {item.unidade}</p>
          </div>
        ))}
      </div>
      {podeConferir ? (
        <div className="flex justify-end print:hidden">
          <button
            type="button"
            disabled={pending}
            onClick={fechar}
            className="rounded-xl bg-emerald-600/80 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            Fechar recebimento
          </button>
        </div>
      ) : null}
    </div>
  )
}
