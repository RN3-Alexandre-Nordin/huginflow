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

/**
 * Transforma export legado (Status, Requisitante, Material, …)
 * em linhas canônicas Hugin. Match de requisitante por matricula → codigo_externo.
 */
export const clienteAtcLegadoAdapter: PlanilhaAdapter = {
  codigo: 'cliente_atc_legado',
  label: 'Cliente ATC (legado suprimentos)',
  hint: 'Export BSC/suprimentos — transformado para o padrão Hugin',
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
    const idxData = header.findIndex(
      (h) => h.includes('data_da_requisicao') || h === 'data' || h.includes('data_requisicao')
    )

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
      // ATC- 0570 → ATC-0570
      const skuNorm = skuClean.replace(/^(ATC)-(\d)/i, (_, p, d) => `${p.toUpperCase()}-${d}`)

      const pessoa = map.get(matricula) || map.get(digitsOnly(matricula))
      const documento = pessoa?.documento ? digitsOnly(pessoa.documento) : ''

      if (!documento) {
        erros.push(
          `Linha ${i + 1}: matrícula "${matricula}" sem pessoa/documento em Cadastros (codigo_externo).`
        )
      }

      const parts: string[] = []
      if (idxTipo >= 0 && cells[idxTipo]) parts.push(`Tipo: ${cells[idxTipo]}`)
      if (idxUrg >= 0 && cells[idxUrg]) parts.push(`Urgência: ${cells[idxUrg]}`)
      if (idxMotivo >= 0 && cells[idxMotivo]) parts.push(`Motivo: ${cells[idxMotivo]}`)
      if (idxComent >= 0 && cells[idxComent]) parts.push(String(cells[idxComent]))

      // Sem ID explícito no export: chave estável matrícula + data da requisição
      const dataRaw = idxData >= 0 ? String(cells[idxData] || '').trim() : ''
      const dataKey = dataRaw.replace(/\D/g, '').slice(0, 12) || 'semdata'
      const codigoOrigem = `ATC-${matricula || 'X'}-${dataKey}`

      const qtd = parseFloat(qtdRaw)
      rows.push({
        linha: i + 1,
        requisitante_documento: documento || matricula,
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
