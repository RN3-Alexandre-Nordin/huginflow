'use client'

import { useRef, useTransition } from 'react'
import { Download, FileSpreadsheet, FileText, Loader2 } from 'lucide-react'
import * as XLSX from 'xlsx'

type Props = {
  title: string
  columns: Array<{ key: string; label: string }>
  rows: Record<string, unknown>[]
  fileBase: string
}

export default function ReportExportBar({ title, columns, rows, fileBase }: Props) {
  const printRef = useRef<HTMLDivElement>(null)
  const [pending, start] = useTransition()

  function exportXlsx() {
    const aoa = [
      columns.map((c) => c.label),
      ...rows.map((r) => columns.map((c) => r[c.key] ?? '')),
    ]
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Relatorio')
    XLSX.writeFile(wb, `${fileBase}.xlsx`)
  }

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
          margin: [10, 8, 10, 8],
          filename: `${fileBase}.pdf`,
          image: { type: 'jpeg', quality: 0.95 },
          html2canvas: { scale: 2, backgroundColor: '#ffffff' },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
        })
        .from(el)
        .save()
    })
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={exportXlsx}
          disabled={!rows.length}
          className="inline-flex items-center gap-2 rounded-xl border border-[#ffffff15] px-3 py-2 text-xs font-semibold text-gray-200 hover:bg-[#ffffff08] disabled:opacity-40"
        >
          <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-400" />
          Excel
        </button>
        <button
          type="button"
          onClick={exportPdf}
          disabled={!rows.length || pending}
          className="inline-flex items-center gap-2 rounded-xl border border-[#ffffff15] px-3 py-2 text-xs font-semibold text-gray-200 hover:bg-[#ffffff08] disabled:opacity-40"
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <FileText className="h-3.5 w-3.5 text-red-400" />
          )}
          PDF
        </button>
        <span className="self-center text-[10px] text-gray-500 inline-flex items-center gap-1">
          <Download className="h-3 w-3" />
          {rows.length} linha(s)
        </span>
      </div>

      {/* Layout claro só para PDF */}
      <div className="absolute -left-[9999px] top-0" aria-hidden>
        <div ref={printRef} className="bg-white p-4 text-black" style={{ width: 1100 }}>
          <h1 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{title}</h1>
          <p data-pdf-stamp style={{ fontSize: 10, color: '#666', marginBottom: 12 }}>
            Hugin Flow
          </p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th
                    key={c.key}
                    style={{
                      borderBottom: '1px solid #ccc',
                      textAlign: 'left',
                      padding: '4px 6px',
                      background: '#f3f3f3',
                    }}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      style={{ borderBottom: '1px solid #eee', padding: '3px 6px' }}
                    >
                      {String(r[c.key] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
