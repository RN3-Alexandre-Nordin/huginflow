import { digitsOnly, splitCodigoNome } from '../parse-csv'
import type { CanonicalReqRow } from '../types'
import { ADDON_ADAPTER_ATC } from '../types'
import type { AdapterContext, PlanilhaAdapter } from './types'

function normHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, '_')
}

/** Prefere "Data da Requisição"; "Data" só entra se não houver coluna específica. */
function idxColunaDataRequisicao(header: string[]): number {
  let best = -1
  let bestScore = 0
  header.forEach((h, i) => {
    let score = 0
    if (h === 'data_da_requisicao' || h === 'data_requisicao') score = 3
    else if (h.includes('data_da_requisicao') || h.includes('data_requisicao')) score = 2
    else if (h === 'data') score = 1
    if (score > bestScore) {
      bestScore = score
      best = i
    }
  })
  return best
}

function ymdKey(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || year < 1900 || year > 2100) return null
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const dt = new Date(Date.UTC(year, month - 1, day))
  if (
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() !== month - 1 ||
    dt.getUTCDate() !== day
  ) {
    return null
  }
  return `${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`
}

/**
 * Data civil AAAAMMDD, sem hora.
 * Aceita dd/mm/aaaa (e hora), ISO, m/d/aa quando o dia > 12 (texto do Excel)
 * e serial Excel (fração = hora, ignorada).
 */
export function dataRequisicaoParaChave(raw: string): string | null {
  const s = String(raw || '').trim()
  if (!s) return null

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/)
  if (iso) return ymdKey(Number(iso[1]), Number(iso[2]), Number(iso[3]))

  const parted = s.match(
    /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2}|\d{4})(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?$/
  )
  if (parted) {
    const a = Number(parted[1])
    const b = Number(parted[2])
    let year = Number(parted[3])
    if (parted[3].length === 2) year += year <= 29 ? 2000 : 1900
    let day = a
    let month = b
    if (a > 12 && b <= 12) {
      day = a
      month = b
    } else if (b > 12 && a <= 12) {
      month = a
      day = b
    } else if (a > 12 && b > 12) {
      return null
    }
    return ymdKey(year, month, day)
  }

  if (/^\d+([.,]\d+)?$/.test(s)) {
    const serial = Math.floor(Number(s.replace(',', '.')))
    if (serial >= 20000 && serial <= 80000) {
      const dt = new Date(Date.UTC(1899, 11, 30) + serial * 86400000)
      return ymdKey(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate())
    }
  }

  return null
}

/**
 * Transforma export legado (Status, Requisitante, Material, …)
 * em linhas canônicas Hugin. Match de requisitante por matricula → codigo_externo.
 */
export const clienteAtcLegadoAdapter: PlanilhaAdapter = {
  codigo: 'cliente_atc_legado',
  label: 'Cliente ATC (legado suprimentos)',
  hint: 'Export BSC/suprimentos. De-para: matrícula → código externo da pessoa; material → código do SKU.',
  addonCodigo: ADDON_ADAPTER_ATC,

  toCanonical(matrix: string[][], ctx: AdapterContext) {
    const erros: string[] = []
    if (matrix.length < 2) {
      return { rows: [], erros: ['Planilha vazia ou sem linhas de dados.'] }
    }

    const header = matrix[0].map(normHeader)
    const idxReq = header.findIndex((h) => h === 'requisitante' || h.includes('requisitante'))
    const idxMat = header.findIndex((h) => h === 'material' || h.includes('material'))
    const idxQtd = header.findIndex((h) => h === 'quantidade' || h.startsWith('qtd'))
    const idxMotivo = header.findIndex((h) => h.includes('motivo'))
    const idxComent = header.findIndex((h) => h.includes('comentario') || h.includes('comentário'))
    const idxTipo = header.findIndex((h) => h.includes('tipo_de_requisicao') || h === 'tipo')
    const idxUrg = header.findIndex((h) => h.includes('urgencia'))
    const idxData = idxColunaDataRequisicao(header)

    if (idxReq < 0 || idxMat < 0 || idxQtd < 0) {
      return {
        rows: [],
        erros: [
          'Cabeçalho legado inválido. Esperado colunas Requisitante, Material e Quantidade.',
        ],
      }
    }

    const map = ctx.pessoasPorMatricula || new Map()
    const rows: CanonicalReqRow[] = []

    for (let i = 1; i < matrix.length; i++) {
      const cells = matrix[i]
      const reqRaw = (cells[idxReq] || '').trim()
      const matRaw = (cells[idxMat] || '').trim()
      const qtdRaw = (cells[idxQtd] || '').trim().replace(',', '.')
      if (!reqRaw && !matRaw && !qtdRaw) continue

      const { codigo: matricula, nome: nomeReq } = splitCodigoNome(reqRaw)
      const { codigo: skuCodigo } = splitCodigoNome(matRaw)
      const skuClean = skuCodigo.replace(/\s+/g, '').replace(/\(.*$/, '').trim()
      // ATC- 0570 → ATC-0570; ATC-534 → ATC-0534 (código de estoque com 4 dígitos)
      const skuNorm = skuClean
        .replace(/^(ATC)-(\d)/i, (_, p, d) => `${p.toUpperCase()}-${d}`)
        .replace(/^ATC-(\d+)$/i, (_, d) => `ATC-${d.padStart(4, '0')}`)

      const pessoa = map.get(matricula) || map.get(digitsOnly(matricula))
      const documento = pessoa?.documento ? digitsOnly(pessoa.documento) : ''

      const dataRaw = idxData >= 0 ? String(cells[idxData] || '').trim() : ''
      const dataKey = dataRequisicaoParaChave(dataRaw)
      if (!matricula) {
        erros.push(`Linha ${i + 1}: requisição bloqueada — matrícula do requisitante ausente.`)
      }
      if (!dataKey) {
        erros.push(
          `Linha ${i + 1}: requisição bloqueada — data da requisição ausente ou inválida.`
        )
      }
      if (!matricula || !dataKey) continue

      const parts: string[] = []
      if (idxTipo >= 0 && cells[idxTipo]) parts.push(`Tipo: ${cells[idxTipo]}`)
      if (idxUrg >= 0 && cells[idxUrg]) parts.push(`Urgência: ${cells[idxUrg]}`)
      if (idxMotivo >= 0 && cells[idxMotivo]) parts.push(`Motivo: ${cells[idxMotivo]}`)
      if (idxComent >= 0 && cells[idxComent]) parts.push(String(cells[idxComent]))

      const codigoOrigem = `ATC-${matricula}-${dataKey}`

      const qtd = parseFloat(qtdRaw)
      rows.push({
        linha: i + 1,
        requisitante_documento: documento,
        requisitante_codigo_externo: matricula || undefined,
        requisitante_nome: nomeReq || pessoa?.nome || undefined,
        sku_codigo: skuNorm || skuCodigo,
        quantidade: Number.isFinite(qtd) ? qtd : NaN,
        observacao: parts.length ? parts.join(' | ') : undefined,
        codigo_origem: codigoOrigem,
        sistema_origem: 'atc_suprimentos',
      })
    }

    return { rows, erros }
  },
}
