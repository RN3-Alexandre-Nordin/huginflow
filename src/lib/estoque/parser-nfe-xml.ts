import { XMLParser } from 'fast-xml-parser'

export interface NfeXmlItem {
  linha: number
  codigo_parceiro: string
  descricao_parceiro: string
  unidade_origem: string
  quantidade_origem: number
  valor_unitario: number
  valor_total: number
  ncm?: string
  cest?: string
  codigo_barras?: string
  unidade_tributavel?: string
  quantidade_tributavel?: number
}

export interface NfeXmlEmitente {
  cnpj?: string
  cpf?: string
  nome?: string
  nome_fantasia?: string
  ie?: string
  im?: string
  telefone?: string
  cep?: string
  logradouro?: string
  numero?: string
  complemento?: string
  bairro?: string
  cidade?: string
  uf?: string
  pais?: string
}

export interface NfeXmlParsed {
  sucesso: boolean
  erro?: string
  chaveNfe?: string
  numeroNfe?: string
  serie?: string
  emissaoEm?: string
  /** @deprecated use emitente.cnpj || emitente.cpf */
  fornecedorCnpj?: string
  /** @deprecated use emitente.nome */
  fornecedorNome?: string
  emitente?: NfeXmlEmitente
  itens: NfeXmlItem[]
}

function str(v: unknown): string {
  if (v == null) return ''
  return String(v).trim()
}

function digits(v: unknown): string {
  return str(v).replace(/\D/g, '')
}

function num(v: unknown): number {
  const n = parseFloat(str(v).replace(',', '.'))
  return Number.isFinite(n) ? n : 0
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
      parseTagValue: false,
    })

    const parsedObj = parser.parse(xmlString)

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

    let chaveNfe = ''
    if (infNFe['@_Id']) {
      chaveNfe = String(infNFe['@_Id']).replace(/^NFe/i, '').trim()
    } else if (nfeProc?.protNFe?.infProt?.chNFe) {
      chaveNfe = String(nfeProc.protNFe.infProt.chNFe).trim()
    }

    const ide = infNFe.ide || {}
    const numeroNfe = ide.nNF ? str(ide.nNF) : undefined
    const serie = ide.serie ? str(ide.serie) : undefined
    const emissaoEmRaw = ide.dhEmi || ide.dEmi
    let emissaoEm: string | undefined
    if (emissaoEmRaw) {
      const dataIso = new Date(String(emissaoEmRaw))
      if (!isNaN(dataIso.getTime())) {
        emissaoEm = dataIso.toISOString()
      }
    }

    const emit = infNFe.emit || {}
    const ender = emit.enderEmit || {}
    const cnpj = digits(emit.CNPJ) || undefined
    const cpf = digits(emit.CPF) || undefined
    const fornecedorDocumento = cnpj || cpf

    const emitente: NfeXmlEmitente = {
      cnpj,
      cpf,
      nome: str(emit.xNome) || undefined,
      nome_fantasia: str(emit.xFant) || undefined,
      ie: str(emit.IE) || undefined,
      im: str(emit.IM) || undefined,
      telefone: digits(ender.fone) || undefined,
      cep: digits(ender.CEP) || undefined,
      logradouro: str(ender.xLgr) || undefined,
      numero: str(ender.nro) || undefined,
      complemento: str(ender.xCpl) || undefined,
      bairro: str(ender.xBairro) || undefined,
      cidade: str(ender.xMun) || undefined,
      uf: str(ender.UF) || undefined,
      pais: str(ender.xPais) || 'Brasil',
    }

    const rawDet = infNFe.det
    const detList: unknown[] = Array.isArray(rawDet) ? rawDet : rawDet ? [rawDet] : []

    if (detList.length === 0) {
      return {
        sucesso: false,
        erro: 'A NF-e informada não possui itens de produto (<det>).',
        itens: [],
      }
    }

    const itens: NfeXmlItem[] = []

    for (let index = 0; index < detList.length; index++) {
      const d = detList[index] as Record<string, unknown>
      const prod = (d.prod || {}) as Record<string, unknown>
      const linha = d['@_nItem'] ? Number(d['@_nItem']) : index + 1

      const ean = str(prod.cEAN)
      const eanTrib = str(prod.cEANTrib)
      const codigoBarras =
        ean && ean !== 'SEM GTIN' ? ean : eanTrib && eanTrib !== 'SEM GTIN' ? eanTrib : undefined

      itens.push({
        linha,
        codigo_parceiro: str(prod.cProd) || `ITEM-${linha}`,
        descricao_parceiro: str(prod.xProd),
        unidade_origem: str(prod.uCom).toUpperCase() || 'UN',
        quantidade_origem: num(prod.qCom),
        valor_unitario: num(prod.vUnCom),
        valor_total: num(prod.vProd),
        ncm: str(prod.NCM) || undefined,
        cest: str(prod.CEST) || undefined,
        codigo_barras: codigoBarras,
        unidade_tributavel: str(prod.uTrib).toUpperCase() || undefined,
        quantidade_tributavel: prod.qTrib != null ? num(prod.qTrib) : undefined,
      })
    }

    return {
      sucesso: true,
      chaveNfe: chaveNfe || undefined,
      numeroNfe,
      serie,
      emissaoEm,
      fornecedorCnpj: fornecedorDocumento || undefined,
      fornecedorNome: emitente.nome || emitente.nome_fantasia,
      emitente,
      itens,
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Arquivo corrompido ou formato não suportado.'
    return {
      sucesso: false,
      erro: `Erro ao interpretar XML da NF-e: ${message}`,
      itens: [],
    }
  }
}
