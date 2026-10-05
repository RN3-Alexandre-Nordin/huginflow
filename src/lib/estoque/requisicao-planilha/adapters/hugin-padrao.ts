import { CANONICAL_HEADERS, type CanonicalReqRow } from '../types'
import type { AdapterContext, PlanilhaAdapter } from './types'

function normHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, '_')
}

export const huginPadraoAdapter: PlanilhaAdapter = {
  codigo: 'hugin_padrao',
  label: 'Padrão Hugin Flow',
  hint: 'Colunas: codigo_origem, sistema_origem, requisitante_documento, requisitante_nome, sku_codigo, quantidade, observacao',
  addonCodigo: null,

  toCanonical(matrix: string[][], _ctx: AdapterContext) {
    const erros: string[] = []
    if (matrix.length < 2) {
      return { rows: [], erros: ['Planilha vazia ou sem linhas de dados.'] }
    }

    const header = matrix[0].map(normHeader)
    const idx = {
      doc: header.findIndex((h) =>
        ['requisitante_documento', 'documento', 'cpf', 'cnpj', 'cpf_cnpj'].includes(h)
      ),
      nome: header.findIndex((h) =>
        ['requisitante_nome', 'nome_requisitante', 'requisitante'].includes(h)
      ),
      sku: header.findIndex((h) =>
        ['sku_codigo', 'codigo_sku', 'sku', 'codigo'].includes(h)
      ),
      qtd: header.findIndex((h) =>
        ['quantidade', 'qtd', 'qty', 'quantidade_pedida'].includes(h)
      ),
      obs: header.findIndex((h) =>
        ['observacao', 'obs', 'comentario', 'motivo'].includes(h)
      ),
      codOrig: header.findIndex((h) =>
        ['codigo_origem', 'id_origem', 'numero_origem', 'req_origem', 'codigo_requisicao'].includes(
          h
        )
      ),
      sistOrig: header.findIndex((h) =>
        ['sistema_origem', 'origem_sistema', 'sistema', 'source_system'].includes(h)
      ),
    }

    if (idx.doc < 0 || idx.sku < 0 || idx.qtd < 0) {
      return {
        rows: [],
        erros: [
          `Cabeçalho inválido. Esperado: ${CANONICAL_HEADERS.join(', ')}. Encontrado: ${matrix[0].join(' | ')}`,
        ],
      }
    }

    const rows: CanonicalReqRow[] = []
    for (let i = 1; i < matrix.length; i++) {
      const cells = matrix[i]
      const doc = (cells[idx.doc] || '').trim()
      const sku = (cells[idx.sku] || '').trim()
      const qtdRaw = (cells[idx.qtd] || '').trim().replace(',', '.')
      const obs = idx.obs >= 0 ? (cells[idx.obs] || '').trim() : ''
      const nome = idx.nome >= 0 ? (cells[idx.nome] || '').trim() : ''
      const codigoOrigem = idx.codOrig >= 0 ? (cells[idx.codOrig] || '').trim() : ''
      const sistemaOrigem = idx.sistOrig >= 0 ? (cells[idx.sistOrig] || '').trim() : ''
      const qtd = parseFloat(qtdRaw)

      if (!doc && !sku && !qtdRaw && !codigoOrigem) continue

      rows.push({
        linha: i + 1,
        requisitante_documento: doc,
        requisitante_nome: nome || undefined,
        sku_codigo: sku,
        quantidade: Number.isFinite(qtd) ? qtd : NaN,
        observacao: obs || undefined,
        codigo_origem: codigoOrigem || undefined,
        sistema_origem: sistemaOrigem || (codigoOrigem ? 'planilha' : undefined),
      })
    }

    return { rows, erros }
  },
}
