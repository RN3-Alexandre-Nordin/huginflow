'use client'

import { useRef, useTransition } from 'react'
import { FileText, Loader2 } from 'lucide-react'

export type PedidoPdfData = {
  numero: string
  fornecedorNome: string
  tipoLabel: string
  previsao: string | null
  observacao: string | null
  valorTotal: number
  itens: Array<{
    descricao: string
    quantidade: number | string
    unidade: string
    preco_unitario: number | string
  }>
  empresaNome?: string | null
}

function money(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function PedidoPdfButton({ pedido }: { pedido: PedidoPdfData }) {
  const printRef = useRef<HTMLDivElement>(null)
  const [pending, start] = useTransition()

  function exportPdf() {
    start(async () => {
      const el = printRef.current
      if (!el) return
      const stamp = el.querySelector('[data-pdf-stamp]')
      if (stamp) {
        stamp.textContent = `Gerado em ${new Date().toLocaleString('pt-BR')} · Hugin Flow`
      }
      const html2pdf = (await import('html2pdf.js')).default
      await html2pdf()
        .set({
          margin: [12, 12, 12, 12],
          filename: `pedido-${pedido.numero}.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, backgroundColor: '#ffffff' },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        })
        .from(el)
        .save()
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={exportPdf}
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-xl border border-[#ffffff14] px-4 py-2 text-sm font-semibold text-gray-200 hover:bg-[#ffffff08] disabled:opacity-50"
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <FileText className="h-4 w-4 text-red-400" />
        )}
        PDF ao fornecedor
      </button>

      <div className="absolute -left-[9999px] top-0" aria-hidden>
        <div ref={printRef} className="bg-white p-6 text-black" style={{ width: 700 }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
            Pedido de compra {pedido.numero}
          </h1>
          {pedido.empresaNome ? (
            <p style={{ fontSize: 12, marginBottom: 4 }}>{pedido.empresaNome}</p>
          ) : null}
          <p data-pdf-stamp style={{ fontSize: 10, color: '#666', marginBottom: 16 }}>
            Hugin Flow
          </p>
          <p style={{ fontSize: 12, marginBottom: 4 }}>
            <strong>Fornecedor:</strong> {pedido.fornecedorNome}
          </p>
          <p style={{ fontSize: 12, marginBottom: 4 }}>
            <strong>Tipo:</strong> {pedido.tipoLabel}
          </p>
          <p style={{ fontSize: 12, marginBottom: 4 }}>
            <strong>Previsão:</strong> {pedido.previsao || '—'}
          </p>
          {pedido.observacao ? (
            <p style={{ fontSize: 12, marginBottom: 12 }}>
              <strong>Observação:</strong> {pedido.observacao}
            </p>
          ) : (
            <div style={{ marginBottom: 12 }} />
          )}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr>
                <th
                  style={{
                    borderBottom: '1px solid #ccc',
                    textAlign: 'left',
                    padding: '6px 4px',
                    background: '#f3f3f3',
                  }}
                >
                  Item
                </th>
                <th
                  style={{
                    borderBottom: '1px solid #ccc',
                    textAlign: 'right',
                    padding: '6px 4px',
                    background: '#f3f3f3',
                  }}
                >
                  Qtd
                </th>
                <th
                  style={{
                    borderBottom: '1px solid #ccc',
                    textAlign: 'left',
                    padding: '6px 4px',
                    background: '#f3f3f3',
                  }}
                >
                  UM
                </th>
                <th
                  style={{
                    borderBottom: '1px solid #ccc',
                    textAlign: 'right',
                    padding: '6px 4px',
                    background: '#f3f3f3',
                  }}
                >
                  Preço unit.
                </th>
                <th
                  style={{
                    borderBottom: '1px solid #ccc',
                    textAlign: 'right',
                    padding: '6px 4px',
                    background: '#f3f3f3',
                  }}
                >
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {pedido.itens.map((item, i) => {
                const qtd = Number(item.quantidade)
                const preco = Number(item.preco_unitario)
                return (
                  <tr key={i}>
                    <td style={{ borderBottom: '1px solid #eee', padding: '5px 4px' }}>
                      {item.descricao}
                    </td>
                    <td
                      style={{
                        borderBottom: '1px solid #eee',
                        padding: '5px 4px',
                        textAlign: 'right',
                      }}
                    >
                      {qtd}
                    </td>
                    <td style={{ borderBottom: '1px solid #eee', padding: '5px 4px' }}>
                      {item.unidade}
                    </td>
                    <td
                      style={{
                        borderBottom: '1px solid #eee',
                        padding: '5px 4px',
                        textAlign: 'right',
                      }}
                    >
                      {money(preco)}
                    </td>
                    <td
                      style={{
                        borderBottom: '1px solid #eee',
                        padding: '5px 4px',
                        textAlign: 'right',
                      }}
                    >
                      {money(qtd * preco)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p style={{ fontSize: 13, fontWeight: 700, marginTop: 16, textAlign: 'right' }}>
            Total: {money(Number(pedido.valorTotal))}
          </p>
        </div>
      </div>
    </>
  )
}
