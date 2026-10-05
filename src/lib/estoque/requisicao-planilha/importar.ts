import { digitsOnly, parseCsvToMatrix } from './parse-csv'
import { getAdapter } from './adapters/registry'
import type { AdapterContext } from './adapters/types'
import type {
  CanonicalReqRow,
  PlanilhaAdapterCodigo,
  RequisicaoPlanilhaGrupoPreview,
} from './types'
import type { ItemRequisicaoInput } from '@/lib/estoque/processar-requisicao'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = { from: (table: string) => any }

export async function planilhaToCanonical(
  rawCsv: string,
  adapterCodigo: PlanilhaAdapterCodigo,
  ctx: AdapterContext
) {
  const matrix = parseCsvToMatrix(rawCsv)
  const adapter = getAdapter(adapterCodigo)
  return adapter.toCanonical(matrix, ctx)
}

/**
 * Carrega mapa matricula → pessoa para o adapter ATC.
 */
export async function loadPessoasPorMatricula(
  empresaId: string,
  client: SupabaseClient
): Promise<AdapterContext['pessoasPorMatricula']> {
  const { data } = await client
    .from('crm_leads')
    .select('id, nome, documento, codigo_externo')
    .eq('empresa_id', empresaId)
    .eq('ativo', true)
    .not('codigo_externo', 'is', null)
    .limit(5000)

  const map = new Map<string, { id: string; documento: string | null; nome: string }>()
  for (const p of data || []) {
    const cod = String(p.codigo_externo || '').trim()
    if (!cod) continue
    const entry = {
      id: p.id as string,
      documento: (p.documento as string | null) || null,
      nome: p.nome as string,
    }
    map.set(cod, entry)
    map.set(digitsOnly(cod), entry)
  }
  return map
}

function groupKey(r: CanonicalReqRow): string {
  const cod = (r.codigo_origem || '').trim()
  const sist = (r.sistema_origem || (cod ? 'planilha' : '')).trim()
  if (cod) return `orig:${sist}|${cod}`
  return `doc:${digitsOnly(r.requisitante_documento) || `linha-${r.linha}`}`
}

export async function validarEAgruparCanonical(
  rows: CanonicalReqRow[],
  empresaId: string,
  client: SupabaseClient
): Promise<{
  grupos: RequisicaoPlanilhaGrupoPreview[]
  errosGlobais: string[]
}> {
  const errosGlobais: string[] = []
  if (rows.length === 0) {
    return { grupos: [], errosGlobais: ['Nenhuma linha válida na planilha.'] }
  }

  const skus = [...new Set(rows.map((r) => r.sku_codigo.trim()).filter(Boolean))]

  const { data: pessoas } = await client
    .from('crm_leads')
    .select('id, nome, documento, ativo, papeis')
    .eq('empresa_id', empresaId)
    .eq('ativo', true)
    .limit(3000)

  const pessoaByDoc = new Map<string, { id: string; nome: string; papeis: string[] }>()
  for (const p of pessoas || []) {
    const d = digitsOnly(String(p.documento || ''))
    if (!d) continue
    pessoaByDoc.set(d, {
      id: p.id,
      nome: p.nome,
      papeis: Array.isArray(p.papeis) ? p.papeis : [],
    })
  }

  const { data: skuRows } = await client
    .from('cad_skus')
    .select('id, codigo, nome, controla_estoque, ativo')
    .eq('empresa_id', empresaId)
    .eq('ativo', true)
    .in('codigo', skus.length ? skus : ['__none__'])

  const skuByCodigo = new Map<string, { id: string; nome: string; controla_estoque: boolean }>()
  for (const s of skuRows || []) {
    skuByCodigo.set(String(s.codigo), {
      id: s.id,
      nome: s.nome,
      controla_estoque: Boolean(s.controla_estoque),
    })
  }

  // Agrupa por codigo_origem+sistema (1:1) ou, sem origem, por documento
  const groupMap = new Map<string, CanonicalReqRow[]>()
  for (const r of rows) {
    const key = groupKey(r)
    const list = groupMap.get(key) || []
    list.push(r)
    groupMap.set(key, list)
  }

  // Pré-carrega duplicatas de origem
  const origemPairs = [
    ...new Set(
      rows
        .filter((r) => (r.codigo_origem || '').trim())
        .map((r) => `${(r.sistema_origem || 'planilha').trim()}|||${r.codigo_origem!.trim()}`)
    ),
  ]
  const existentes = new Map<string, { id: string; numero: string }>()
  if (origemPairs.length > 0) {
    const { data: existentesRows } = await client
      .from('est_requisicoes')
      .select('id, numero, codigo_origem, sistema_origem')
      .eq('empresa_id', empresaId)
      .in(
        'codigo_origem',
        origemPairs.map((p) => p.split('|||')[1])
      )
      .limit(500)

    for (const e of existentesRows || []) {
      const k = `${e.sistema_origem}|||${e.codigo_origem}`
      existentes.set(k, { id: e.id, numero: e.numero })
    }
  }

  const grupos: RequisicaoPlanilhaGrupoPreview[] = []

  for (const [, itens] of groupMap) {
    const first = itens[0]
    const docKey = digitsOnly(first.requisitante_documento)
    const pessoa = pessoaByDoc.get(docKey)
    const codigoOrigem = first.codigo_origem?.trim() || null
    const sistemaOrigem =
      first.sistema_origem?.trim() || (codigoOrigem ? 'planilha' : null)
    const nomeOrigem =
      [...new Set(itens.map((i) => i.requisitante_nome).filter(Boolean) as string[])].join(
        ' / '
      ) || null

    let erroCab: string | undefined
    let codigoCab: string | undefined
    let jaExiste = false
    let numeroExistente: string | null = null

    if (codigoOrigem && sistemaOrigem) {
      const ex = existentes.get(`${sistemaOrigem}|||${codigoOrigem}`)
      if (ex) {
        jaExiste = true
        numeroExistente = ex.numero
        erroCab = `Já importada como ${ex.numero} (${sistemaOrigem}/${codigoOrigem}).`
        codigoCab = 'REQUISICAO_ORIGEM_DUPLICADA'
      }
    }

    if (!erroCab) {
      if (!docKey) {
        erroCab = 'Documento do requisitante ausente.'
        codigoCab = 'REQUISITANTE_NAO_CADASTRADO'
      } else if (!pessoa) {
        erroCab = `Requisitante com documento ${first.requisitante_documento} não cadastrado em Pessoas.`
        codigoCab = 'REQUISITANTE_NAO_CADASTRADO'
      } else if (!pessoa.papeis.includes('funcionario')) {
        erroCab = `${pessoa.nome} não possui papel Funcionário.`
        codigoCab = 'REQUISITANTE_NAO_FUNCIONARIO'
      }
    }

    // Mesmo grupo: documentos divergentes
    const docsNoGrupo = new Set(itens.map((i) => digitsOnly(i.requisitante_documento)).filter(Boolean))
    if (!erroCab && docsNoGrupo.size > 1) {
      erroCab = 'Linhas da mesma codigo_origem com requisitantes diferentes.'
      codigoCab = 'REQUISITANTE_CONFLITO'
    }

    const obsParts = [
      ...new Set(itens.map((i) => i.observacao).filter(Boolean) as string[]),
    ]

    grupos.push({
      codigo_origem: codigoOrigem,
      sistema_origem: sistemaOrigem,
      requisitante_documento: first.requisitante_documento,
      requisitante_pessoa_id: pessoa?.id ?? null,
      requisitante_nome: pessoa?.nome ?? null,
      requisitante_nome_origem: nomeOrigem,
      observacao: obsParts.length ? obsParts.join(' | ') : null,
      ja_existe: jaExiste,
      numero_existente: numeroExistente,
      erro_cabecalho: erroCab,
      codigo_erro_cabecalho: codigoCab,
      itens: itens.map((it) => {
        const sku = skuByCodigo.get(it.sku_codigo.trim())
        let erro: string | undefined
        let codigo_erro: string | undefined
        if (!it.sku_codigo.trim()) {
          erro = 'SKU obrigatório.'
          codigo_erro = 'SKU_INVALIDO'
        } else if (!sku) {
          erro = `SKU "${it.sku_codigo}" não encontrado.`
          codigo_erro = 'SKU_INVALIDO'
        } else if (!sku.controla_estoque) {
          erro = `SKU "${it.sku_codigo}" não controla estoque.`
          codigo_erro = 'SKU_INVALIDO'
        } else if (!Number.isFinite(it.quantidade) || it.quantidade <= 0) {
          erro = 'Quantidade deve ser maior que zero.'
          codigo_erro = 'ITENS_OBRIGATORIOS'
        }
        return {
          linha: it.linha,
          sku_codigo: it.sku_codigo,
          sku_id: sku?.id ?? null,
          sku_nome: sku?.nome ?? null,
          quantidade: it.quantidade,
          erro,
          codigo_erro,
        }
      }),
    })
  }

  return { grupos, errosGlobais }
}

export function gruposParaCriacao(
  grupos: RequisicaoPlanilhaGrupoPreview[]
): Array<{
  requisitante_pessoa_id: string
  observacao: string | null
  codigo_origem: string | null
  sistema_origem: string | null
  requisitante_nome_origem: string | null
  itens: ItemRequisicaoInput[]
}> {
  const ok: Array<{
    requisitante_pessoa_id: string
    observacao: string | null
    codigo_origem: string | null
    sistema_origem: string | null
    requisitante_nome_origem: string | null
    itens: ItemRequisicaoInput[]
  }> = []

  for (const g of grupos) {
    if (g.erro_cabecalho || !g.requisitante_pessoa_id || g.ja_existe) continue
    const itensValidos = g.itens.filter((i) => !i.erro && i.sku_id)
    if (itensValidos.length === 0) continue
    ok.push({
      requisitante_pessoa_id: g.requisitante_pessoa_id,
      observacao: g.observacao,
      codigo_origem: g.codigo_origem,
      sistema_origem: g.sistema_origem,
      requisitante_nome_origem: g.requisitante_nome_origem,
      itens: itensValidos.map((i) => ({
        linha: i.linha,
        sku_id: i.sku_id!,
        quantidade_pedida: i.quantidade,
      })),
    })
  }
  return ok
}
