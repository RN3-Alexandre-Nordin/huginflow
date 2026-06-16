'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Download, Loader2, AlertTriangle } from 'lucide-react'

interface ContractViewerProps {
  empresaId: string
  empresaNome: string
  missingFields: string[]
  html: string
}

export default function ContractViewer({
  empresaId,
  empresaNome,
  missingFields,
  html,
}: ContractViewerProps) {
  const [isGenerating, setIsGenerating] = useState(false)
  const documentRef = useRef<HTMLDivElement>(null)

  const safeFileName = empresaNome
    .replace(/[^\w\s-áàâãéêíóôõúüçÁÀÂÃÉÊÍÓÔÕÚÜÇ]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80) || 'cliente'

  async function handleExportPdf() {
    const element = documentRef.current?.querySelector('.document') as HTMLElement | null
    if (!element) return

    setIsGenerating(true)
    try {
      // Rasterizado via html2canvas — evolução futura: PDF server-side para assinatura Gov.br
      const html2pdf = (await import('html2pdf.js')).default
      await html2pdf()
        .set({
          margin: [15, 12, 15, 12],
          filename: `MSA-Ragnar-${safeFileName}.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff',
            letterRendering: false,
          },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          pagebreak: { mode: ['css', 'legacy'] },
        })
        .from(element)
        .save()
    } catch (err) {
      console.error('[Contrato] Falha ao gerar PDF:', err)
      alert('Não foi possível gerar o PDF. Tente novamente em instantes.')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      <div className="sticky top-0 z-50 bg-[#0F0F0F]/95 backdrop-blur border-b border-[#ffffff0a]">
        <div className="max-w-5xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href={`/cockpit/empresas/${empresaId}/editar`}
              className="p-2 rounded-lg bg-[#ffffff05] hover:bg-[#ffffff0a] text-gray-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <p className="text-sm font-bold text-white">Contrato MSA — {empresaNome}</p>
              <p className="text-xs text-gray-500">Template preenchido com dados do cadastro</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleExportPdf}
            disabled={isGenerating}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold bg-gradient-to-r from-[#2BAADF] to-[#1A8FBF] hover:from-[#3BB8E8] hover:to-[#2BAADF] text-white shadow-lg shadow-[#2BAADF]/20 disabled:opacity-50 transition-all"
          >
            {isGenerating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            Exportar PDF
          </button>
        </div>

        {missingFields.length > 0 && (
          <div className="max-w-5xl mx-auto px-4 pb-3">
            <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Cadastro incompleto para contrato</p>
                <p className="mt-1 text-amber-200/80">
                  Campos ausentes: {missingFields.join(', ')}. Complete em{' '}
                  <Link href={`/cockpit/empresas/${empresaId}/editar`} className="underline font-medium">
                    Editar empresa
                  </Link>
                  .
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div
        ref={documentRef}
        suppressHydrationWarning
        className="max-w-5xl mx-auto py-8 px-4 text-[#1a1a1a] [&_.document]:text-[#1a1a1a] [&_p]:text-[#1a1a1a] [&_h2]:text-[#1a1a1a] [&_h3]:text-[#1a1a1a] [&_td]:text-[#1a1a1a] [&_li]:text-[#1a1a1a]"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}
