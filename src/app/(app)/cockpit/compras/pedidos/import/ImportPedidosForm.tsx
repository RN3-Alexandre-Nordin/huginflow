'use client'

import { useRef, useState } from 'react'
import { Download, FolderSearch, Loader2 } from 'lucide-react'
import { importarPedidosPlanilha } from '@/app/(app)/cockpit/compras/actions'
import { buildModeloPedidoXlsx } from '@/lib/compras/planilha-pedido-modelo'

export default function ImportPedidosForm() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [arquivo, setArquivo] = useState<string>('')
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function baixarModelo() {
    const buf = buildModeloPedidoXlsx()
    const blob = new Blob([buf], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'modelo_pedido_huginflow.xlsx'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErro(null)
    setOk(null)
    const file = fileRef.current?.files?.[0]
    if (!file) {
      setErro('Escolha a planilha de pedidos.')
      return
    }
    setLoading(true)
    const fd = new FormData()
    fd.set('arquivo', file)
    const res = await importarPedidosPlanilha(fd)
    setLoading(false)
    if ('error' in res && res.error) {
      setErro(res.error)
      return
    }
    const avisos = res.avisos?.length ? ` ${res.avisos.slice(0, 3).join(' ')}` : ''
    setOk(`${res.criados} pedido(s) importado(s).${avisos}`)
  }

  return (
    <form
      onSubmit={onSubmit}
      className="overflow-hidden rounded-2xl border border-[#ffffff0a] bg-[#111111] shadow-2xl"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#ffffff08] px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-white">Planilha</h2>
          <p className="text-xs text-gray-500">Arquivo .xlsx, .xls ou .csv</p>
        </div>
        <button
          type="button"
          onClick={baixarModelo}
          className="inline-flex items-center gap-2 rounded-xl border border-[#2BAADF]/30 bg-[#2BAADF]/10 px-3 py-2 text-xs font-semibold text-[#2BAADF] hover:bg-[#2BAADF]/20"
        >
          <Download className="h-3.5 w-3.5" />
          Baixar planilha padrão
        </button>
      </div>

      <div className="p-5">
        <div className="flex items-center gap-2 rounded-xl border border-[#ffffff15] bg-[#0A0A0A] px-3 py-2">
          <span className="min-w-0 flex-1 truncate text-sm text-gray-300">
            {arquivo || 'Nenhum arquivo escolhido'}
          </span>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            title="Escolher arquivo"
            aria-label="Escolher arquivo de pedidos"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#2BAADF] hover:bg-[#2BAADF]/10"
          >
            <FolderSearch className="h-5 w-5" />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
            className="hidden"
            onChange={(e) => {
              setArquivo(e.target.files?.[0]?.name || '')
              setErro(null)
              setOk(null)
            }}
          />
        </div>

        {erro && <p className="mt-3 text-sm text-red-300">{erro}</p>}
        {ok && <p className="mt-3 text-sm text-emerald-300">{ok}</p>}
      </div>

      <div className="flex justify-end border-t border-[#ffffff08] bg-[#0A0A0A]/90 px-5 py-4">
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#2BAADF] to-[#1A8FBF] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Importar pedidos
        </button>
      </div>
    </form>
  )
}
