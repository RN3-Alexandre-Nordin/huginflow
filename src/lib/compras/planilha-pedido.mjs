export function parsePedidoCsv(csv) {
  const TIPOS = ['produtivo', 'consumo', 'servico']
  const rows = String(csv || '')
    .split(/\r?\n/)
    .map((r) => r.split(',').map((c) => c.trim().replace(/^"|"$/g, '')))
    .filter((r) => r.some((c) => c.length > 0))

  if (rows.length < 2) return { linhas: [], erros: ['Planilha sem linhas de pedido.'] }

  const header = rows[0].map((h) => h.toLowerCase())
  const idx = (name) => header.indexOf(name)
  const iNumero = idx('numero')
  const iFornecedor = idx('fornecedor')
  const iPrev = idx('previsao')
  const iTipo = idx('tipo')
  const iItem = idx('item')
  const iQtd = idx('quantidade')
  const iUn = idx('unidade')
  const iPreco = idx('preco')

  if ([iNumero, iFornecedor, iItem, iQtd].some((i) => i < 0)) {
    return {
      linhas: [],
      erros: [
        'Cabeçalho obrigatório: numero, fornecedor, item, quantidade. Opcionais: previsao, tipo, unidade, preco.',
      ],
    }
  }

  const num = (raw) => {
    const t = String(raw || '').trim()
    const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t)
    return Number.isFinite(n) ? n : 0
  }

  const linhas = []
  const erros = []
  rows.slice(1).forEach((cells, i) => {
    const linha = i + 2
    const numero = cells[iNumero] || ''
    const fornecedor = cells[iFornecedor] || ''
    const item = cells[iItem] || ''
    const quantidade = num(cells[iQtd])
    if (!numero || !fornecedor || !item || !(quantidade > 0)) {
      erros.push(`Linha ${linha}: numero, fornecedor, item e quantidade são obrigatórios.`)
      return
    }
    const tipoRaw = (iTipo >= 0 ? cells[iTipo] : '') || 'produtivo'
    if (!TIPOS.includes(tipoRaw)) {
      erros.push(`Linha ${linha}: tipo deve ser produtivo, consumo ou servico.`)
      return
    }
    linhas.push({
      linha,
      numero,
      fornecedor,
      previsao: iPrev >= 0 && cells[iPrev] ? String(cells[iPrev]).slice(0, 10) : null,
      tipo: tipoRaw,
      item,
      quantidade,
      unidade: (iUn >= 0 && cells[iUn]) || 'UN',
      preco: iPreco >= 0 ? num(cells[iPreco]) : 0,
    })
  })
  return { linhas, erros }
}
