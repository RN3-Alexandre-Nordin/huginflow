import { XMLParser } from 'fast-xml-parser'

export interface NfeXmlItem {
  linha: number
  codigo_parceiro: string
  descricao_parceiro: string
  unidade_origem: string
  quantidade_origem: number
  valor_unitario: number
  valor_total: number
}

export interface NfeXmlParsed {
  sucesso: boolean
  erro?: string
  chaveNfe?: string
  numeroNfe?: string
  serie?: string
  emissaoEm?: string
  fornecedorCnpj?: string
  fornecedorNome?: string
  itens: NfeXmlItem[]
}

/**
 * Faz o parsing estrito e seguro de um XML de NF-e (SEFAZ 3.10 / 4.00)
 */
export function parseNfeXml(xmlString: string): NfeXmlParsed {
  if (!xmlString || typeof xmlString !== 'string' || xmlString.trim().length === 0) {
    return {
      sucesso: false,
      erro: 'Conteúdo XML vazio ou inválido.',
      itens: [],
    }
  }

  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      trimValues: true,
      parseTagValue: false, // Mantém strings para evitar perda de zeros à esquerda em CNPJ/chaves
    })

    const parsedObj = parser.parse(xmlString)

    // Localiza nó NFe (pode estar na raiz ou dentro de nfeProc)
    const nfeProc = parsedObj.nfeProc || parsedObj['soapenv:Envelope']?.['soapenv:Body']?.nfeProc
    const nfe = nfeProc?.NFe || parsedObj.NFe || parsedObj

    const infNFe = nfe?.infNFe
    if (!infNFe) {
      return {
        sucesso: false,
        erro: 'O XML informado não possui a estrutura padrão de NF-e (nó infNFe ausente).',
        itens: [],
      }
    }

    // 1. Chave da NF-e (44 dígitos)
    let chaveNfe = ''
    if (infNFe['@_Id']) {
      chaveNfe = String(infNFe['@_Id']).replace(/^NFe/i, '').trim()
    } else if (nfeProc?.protNFe?.infProt?.chNFe) {
      chaveNfe = String(nfeProc.protNFe.infProt.chNFe).trim()
    }

    // 2. Identificação da Nota (<ide>)
    const ide = infNFe.ide || {}
    const numeroNfe = ide.nNF ? String(ide.nNF).trim() : undefined
    const serie = ide.serie ? String(ide.serie).trim() : undefined
    const emissaoEmRaw = ide.dhEmi || ide.dEmi
    let emissaoEm: string | undefined
    if (emissaoEmRaw) {
      const dataIso = new Date(emissaoEmRaw)
      if (!isNaN(dataIso.getTime())) {
        emissaoEm = dataIso.toISOString()
      }
    }

    // 3. Emitente / Fornecedor (<emit>)
    const emit = infNFe.emit || {}
    let fornecedorCnpj = ''
    if (emit.CNPJ) {
      fornecedorCnpj = String(emit.CNPJ).replace(/\D/g, '')
    } else if (emit.CPF) {
      fornecedorCnpj = String(emit.CPF).replace(/\D/g, '')
    }
    const fornecedorNome = emit.xNome ? String(emit.xNome).trim() : emit.xFant ? String(emit.xFant).trim() : undefined

    // 4. Itens da Nota (<det>)
    const rawDet = infNFe.det
    const detList: any[] = Array.isArray(rawDet) ? rawDet : rawDet ? [rawDet] : []

    if (detList.length === 0) {
      return {
        sucesso: false,
        erro: 'A NF-e informada não possui itens de produto (<det>).',
        itens: [],
      }
    }

    const itens: NfeXmlItem[] = []

    for (let index = 0; index < detList.length; index++) {
      const d = detList[index]
      const prod = d.prod || {}
      const linha = d['@_nItem'] ? Number(d['@_nItem']) : index + 1

      const codigoParceiro = prod.cProd ? String(prod.cProd).trim() : `ITEM-${linha}`
      const descricaoParceiro = prod.xProd ? String(prod.xProd).trim() : ''
      const unidadeOrigem = prod.uCom ? String(prod.uCom).trim().toUpperCase() : 'UN'
      const quantidadeOrigem = prod.qCom ? parseFloat(String(prod.qCom)) : 0
      const valorUnitario = prod.vUnCom ? parseFloat(String(prod.vUnCom)) : 0
      const valorTotal = prod.vProd ? parseFloat(String(prod.vProd)) : 0

      itens.push({
        linha,
        codigo_parceiro: codigoParceiro,
        descricao_parceiro: descricaoParceiro,
        unidade_origem: unidadeOrigem,
        quantidade_origem: isNaN(quantidadeOrigem) ? 0 : quantidadeOrigem,
        valor_unitario: isNaN(valorUnitario) ? 0 : valorUnitario,
        valor_total: isNaN(valorTotal) ? 0 : valorTotal,
      })
    }

    return {
      sucesso: true,
      chaveNfe: chaveNfe || undefined,
      numeroNfe,
      serie,
      emissaoEm,
      fornecedorCnpj: fornecedorCnpj || undefined,
      fornecedorNome,
      itens,
    }
  } catch (err: any) {
    return {
      sucesso: false,
      erro: `Erro ao interpretar XML da NF-e: ${err?.message || 'Arquivo corrompido ou formato não suportado.'}`,
      itens: [],
    }
  }
}
