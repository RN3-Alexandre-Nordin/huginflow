import * as XLSX from 'xlsx'

/** Extensões aceitas no import de requisição. */
export function isPlanilhaFileName(name: string): boolean {
  const n = name.toLowerCase()
  return n.endsWith('.csv') || n.endsWith('.txt') || n.endsWith('.xlsx') || n.endsWith('.xls')
}

/**
 * Converte ArrayBuffer de .xlsx/.xls na primeira aba → CSV (texto).
 * CSV/TXT: decodifica como UTF-8 (com BOM).
 */
export function planilhaBufferToCsv(buffer: ArrayBuffer, fileName: string): string {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.csv') || lower.endsWith('.txt')) {
    const bytes = new Uint8Array(buffer)
    // Remove BOM UTF-8
    const start = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0
    return new TextDecoder('utf-8').decode(bytes.subarray(start))
  }

  const wb = XLSX.read(buffer, { type: 'array', cellDates: true })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) throw new Error('Planilha sem abas.')
  const sheet = wb.Sheets[sheetName]
  return XLSX.utils.sheet_to_csv(sheet, { blankrows: false })
}

/** Gera .xlsx canônico (browser ou Node). */
export function buildModeloRequisicaoXlsx(): ArrayBuffer {
  const rows = [
    [
      'codigo_origem',
      'sistema_origem',
      'requisitante_documento',
      'requisitante_nome',
      'sku_codigo',
      'quantidade',
      'observacao',
    ],
    [
      'REQ-EXT-1001',
      'planilha',
      '10008710961',
      'Ricardo Mendes Oliveira',
      'AGUA-044',
      24,
      'Reposição semanal',
    ],
    [
      'REQ-EXT-1001',
      'planilha',
      '10008710961',
      'Ricardo Mendes Oliveira',
      'CERV-001',
      12,
      'Evento interno',
    ],
    [
      'REQ-EXT-1002',
      'planilha',
      '10017421845',
      'Patricia Souza Lima',
      'AGUA-045',
      36,
      'Kit recepção',
    ],
    [
      'REQ-EXT-1002',
      'planilha',
      '10017421845',
      'Patricia Souza Lima',
      'AGUA-048',
      6,
      '',
    ],
  ]
  const ws = XLSX.utils.aoa_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Requisicoes')
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}
