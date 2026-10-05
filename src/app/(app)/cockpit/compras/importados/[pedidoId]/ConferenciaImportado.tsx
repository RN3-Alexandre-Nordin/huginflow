'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { extrairCodigoEtiqueta } from '@/lib/compras/codigo-etiqueta'
import { confirmarItemImportado, fecharRecebimentoImportado } from '../actions'

type Item = { id: string; descricao: string; unidade: string; saldo: number }
type Local = { id: string; codigo: string; nome: string }

export default function ConferenciaImportado({
  pedidoId,
  podeConferir,
  itens,
  locais,
  limpeza,
  impressora,
}: {
  pedidoId: string
  podeConferir: boolean
  itens: Item[]
  locais: Local[]
  limpeza: string
  impressora: string
}) {
  const router = useRouter()
  const [codigo, setCodigo] = useState('')
  const [quantidade, setQuantidade] = useState('1')
  const [localId, setLocalId] = useState('')
  const [temporario, setTemporario] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [etiqueta, setEtiqueta] = useState<string | null>(null)
  const [pending, start] = useTransition()

  async function lerFoto(file: File) {
    setErro(null)
    try {
      const { createWorker } = await import('tesseract.js')
      const worker = await createWorker('eng')
      const { data } = await worker.recognize(file)
      await worker.terminate()
      const extraido = extrairCodigoEtiqueta(data.text || '')
      if (!extraido) {
        setErro('A foto não mostrou o número acima do código de barras. Digite o número.')
        return
      }
      setCodigo(extraido)
    } catch {
      setErro('A leitura da foto falhou. Digite o número impresso acima do código de barras.')
    }
  }

  function confirmar() {
    setErro(null)
    setAviso(null)
    start(async () => {
      const res = await confirmarItemImportado({
        pedidoId,
        codigoLido: codigo,
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
      setQuantidade('1')
      setTemporario('')
      router.refresh()
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

  return (
    <div className="space-y-4">
      <div className="etiqueta-item hidden print:block rounded-2xl bg-white p-6 text-center text-black">
        <p className="text-xs uppercase tracking-widest">Etiqueta do item</p>
        <p className="mt-2 font-mono text-3xl font-semibold">{etiqueta}</p>
      </div>
      <div className="space-y-3 rounded-2xl border border-[#ffffff0a] p-4 print:hidden">
        <p className="text-xs text-gray-500">
          O código de barras da etiqueta não é o SKU. A foto lê o número impresso acima das barras e
          tira a máscara. Exemplo: 1625 - 0055 - 40 vira 1625005540.
        </p>
        {podeConferir ? (
          <>
            <label className="block text-sm text-gray-300">
              Foto da etiqueta
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="mt-1 block w-full text-xs text-gray-400"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void lerFoto(file)
                }}
              />
            </label>
            <label className="block text-sm text-gray-300">
              Número lido
              <input
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                placeholder="1625 - 0055 - 40"
                className="mt-1 h-10 w-full rounded-xl border border-[#ffffff14] bg-[#0A0A0A] px-3 font-mono text-sm text-white"
              />
            </label>
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
            <button
              type="button"
              disabled={pending || !codigo.trim()}
              onClick={confirmar}
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
