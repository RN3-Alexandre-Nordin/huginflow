import pdf from 'pdf-parse/lib/pdf-parse'
import {
  analyzeImageWithVision,
  generateText,
  getAiConfigErrorMessage,
  resolveEmpresaAiConfig,
  type EmpresaAiConfig,
} from '@/lib/ai/empresa-ai'
import {
  DOCUMENT_CATEGORIES,
  inferCategoryFromHints,
  type DocumentCategory,
} from '@/lib/omnichannel/document-constants'
import { parseDocumentBlock } from '@/lib/omnichannel/triage/parseDocumentTags'

export type DocumentClassification = {
  categoria: DocumentCategory
  confianca: number
  legivel: boolean
  resumo: string
  extractedText: string
}

const CLASSIFICATION_PROMPT = `Você classifica documentos recebidos via WhatsApp (PDF, comprovantes, PIX, boletos, recibos, fotos).

Categorias válidas (use exatamente um slug):
- financeiro_pagamento — PIX, comprovante de transferência/pagamento
- financeiro_boleto — boleto bancário
- financeiro_recibo — recibo genérico
- financeiro_documento — NF, cobrança, contrato financeiro, PDF financeiro
- expedicao_comprovante — comprovante de entrega, logística
- documento_nao_identificado — ilegível ou tipo incerto

Responda APENAS com o bloco:

[DOCUMENT:
tipo=slug_da_categoria
confianca=0.00
legivel=true|false
resumo=texto curto do que é o documento
]`

export class DocumentExtractionService {
  static async extractText(
    buffer: Buffer,
    mimeType: string,
    aiConfig: EmpresaAiConfig | null,
  ): Promise<{ text: string; legivel: boolean }> {
    const isPdf =
      mimeType.includes('pdf') || buffer.slice(0, 4).toString() === '%PDF'

    if (isPdf) {
      try {
        const parsed = await pdf(buffer)
        const text = (parsed.text ?? '').trim()
        if (text.length >= 20) {
          return { text: text.slice(0, 8000), legivel: true }
        }
      } catch (err) {
        console.warn('[DocumentExtraction] pdf-parse falhou, tentando visão:', err)
      }
    }

    if (!aiConfig) {
      return { text: '', legivel: false }
    }

    const isImage =
      mimeType.startsWith('image/') ||
      mimeType.includes('jpeg') ||
      mimeType.includes('png') ||
      mimeType.includes('webp')

    if (isImage || isPdf) {
      try {
        const visionMime = isImage ? mimeType : 'application/pdf'
        const prompt = `Extraia TODO o texto visível deste documento/comprovante em português.
Se não conseguir ler, responda apenas: ILEGIVEL`
        const text = await analyzeImageWithVision(prompt, buffer, visionMime, aiConfig)
        if (!text || text.toUpperCase().includes('ILEGIVEL')) {
          return { text: '', legivel: false }
        }
        return { text: text.slice(0, 8000), legivel: text.length >= 10 }
      } catch (err) {
        console.error('[DocumentExtraction] vision falhou:', err)
        return { text: '', legivel: false }
      }
    }

    return { text: '', legivel: false }
  }
}

export class DocumentClassificationService {
  static async classify(
    extractedText: string,
    fileName: string,
    caption: string | undefined,
    aiConfig: EmpresaAiConfig | null,
    legivelFromExtraction: boolean,
  ): Promise<DocumentClassification> {
    const hinted = inferCategoryFromHints(fileName, caption, extractedText)

    // Sem IA ou texto vazio: ainda encaminha por heurística (ex.: Boleto.pdf)
    if (!aiConfig) {
      return {
        categoria: hinted ?? 'documento_nao_identificado',
        confianca: hinted ? 0.55 : 0,
        legivel: false,
        resumo: hinted
          ? `Possível ${hinted} (inferido por nome/legenda). Conteúdo não lido.`
          : fileName,
        extractedText,
      }
    }

    const snippet = extractedText.slice(0, 4000)
    const prompt = `${CLASSIFICATION_PROMPT}

Nome do arquivo: ${fileName}
Legenda WhatsApp: ${caption ?? '(sem legenda)'}
Texto extraído:
${snippet || '(vazio — documento possivelmente ilegível)'}

${!legivelFromExtraction ? 'ATENÇÃO: texto extraído insuficiente. Se o nome do arquivo indicar boleto/PIX/recibo/NF, use a categoria financeira correspondente com legivel=false.' : ''}`

    try {
      const raw = await generateText(prompt, aiConfig)
      const parsed = parseDocumentBlock(raw)
      const tipo = parsed?.tipo?.trim() as DocumentCategory | undefined
      let categoria: DocumentCategory =
        tipo && (DOCUMENT_CATEGORIES as readonly string[]).includes(tipo)
          ? tipo
          : 'documento_nao_identificado'

      // Preferência heurística quando a IA não identifica ou OCR falhou
      if (categoria === 'documento_nao_identificado' && hinted) {
        categoria = hinted
      }

      const legivel =
        legivelFromExtraction &&
        parsed?.legivel !== false &&
        categoria !== 'documento_nao_identificado' &&
        Boolean(extractedText.trim())

      const resumo =
        parsed?.resumo && categoria === (tipo as DocumentCategory)
          ? parsed.resumo
          : hinted && !legivel
            ? `Possível ${categoria} (inferido por nome/legenda). Conteúdo parcial ou ilegível.`
            : (parsed?.resumo ?? fileName)

      return {
        categoria,
        confianca: parsed?.confianca ?? (legivel ? 0.7 : hinted ? 0.55 : 0.2),
        legivel,
        resumo,
        extractedText,
      }
    } catch (err) {
      console.error('[DocumentClassification] erro:', err)
      return {
        categoria: hinted ?? 'documento_nao_identificado',
        confianca: hinted ? 0.5 : 0,
        legivel: false,
        resumo: hinted
          ? `Possível ${hinted} (inferido por nome/legenda). Classificação IA falhou.`
          : fileName,
        extractedText,
      }
    }
  }

  static async resolveAiConfig(
    supabase: import('@supabase/supabase-js').SupabaseClient,
    empresaId: string,
  ) {
    const { data: empresa } = await supabase
      .from('empresas')
      .select('ai_model')
      .eq('id', empresaId)
      .single()
    if (!empresa) return null
    const config = resolveEmpresaAiConfig(empresa)
    if (!config) {
      console.warn('[DocumentClassification]', getAiConfigErrorMessage())
    }
    return config
  }
}
