/** Limite alinhado ao upload manual do Kanban (5 MB). */
export const DOCUMENT_MAX_BYTES = 5 * 1024 * 1024

export const DOCUMENT_PLACEHOLDER = '📎 Documento recebido — processando…'

export const DOCUMENT_PROCESS_FAILED =
  '📎 Documento recebido — não foi possível processar o arquivo.'

export const DOCUMENT_TOO_LARGE =
  '📎 Documento recebido — arquivo excede o limite de 5 MB. Envie um arquivo menor ou entre em contato com nossa equipe.'

export const ILLEGIBLE_DOCUMENT_OBSERVATION =
  'Documento recebido via WhatsApp — não foi possível ler ou identificar o conteúdo com segurança. Análise manual necessária.'

export const DOCUMENT_AUTO_REPLY_IN_HOURS =
  'Recebemos seu documento e já registramos em nosso sistema. Nossa equipe vai analisar e retorna em breve por aqui.'

export const DOCUMENT_AUTO_REPLY_OUT_HOURS =
  'Recebemos seu documento e registramos sua solicitação. Nosso atendimento humano é de segunda a sexta, das 8h às 17h (Brasília). Retornaremos nesse período.'

/** Slugs usados no match estrito card ↔ documento. */
export const DOCUMENT_CATEGORIES = [
  'financeiro_pagamento',
  'financeiro_boleto',
  'financeiro_recibo',
  'financeiro_documento',
  'expedicao_comprovante',
  'documento_nao_identificado',
] as const

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number]

/**
 * Inferência leve por nome/legenda/texto quando OCR/visão falha (ex.: Boleto.pdf).
 */
export function inferCategoryFromHints(
  fileName: string,
  caption?: string | null,
  extractedText?: string | null,
): DocumentCategory | null {
  const blob = `${fileName} ${caption ?? ''} ${extractedText ?? ''}`.toLowerCase()
  const norm = blob
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_-]+/g, ' ')

  if (/\bboleto\b|linha\s*digitavel|codigo\s*de\s*barras/.test(norm)) {
    return 'financeiro_boleto'
  }
  if (/\bpix\b|comprovante\s+de\s+pag|transferencia|\bted\b|\bdoc\b/.test(norm)) {
    return 'financeiro_pagamento'
  }
  if (/\brecibo\b/.test(norm)) return 'financeiro_recibo'
  if (/\bnf\b|nota\s*fiscal|cobranca|fatura/.test(norm)) return 'financeiro_documento'
  if (/\bentrega\b|frete\b|romaneio|comprovante\s+de\s+entrega/.test(norm)) {
    return 'expedicao_comprovante'
  }
  return null
}

export function isDocumentPipelineEnabled(): boolean {
  const v = process.env.HUGINFLOW_DOCUMENT_PIPELINE?.trim().toLowerCase()
  return v !== 'disabled' && v !== 'false' && v !== '0'
}

export function isInboundDocumentType(type: string): boolean {
  return type === 'document' || type === 'image'
}
