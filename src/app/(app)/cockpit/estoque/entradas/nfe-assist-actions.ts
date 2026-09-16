'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { hasPermission } from '@/utils/permissions'
import { parseNfeXml, type NfeXmlEmitente } from '@/lib/estoque/parser-nfe-xml'
import { validarLoteEntrada } from '@/lib/estoque/validacao-entrada'
import type { ItemEntradaInput, LoteEntradaInput } from '@/lib/estoque/tipos'
import { SKU_UNIDADES } from '@/lib/skus/constants'

function canEntrada(me: Awaited<ReturnType<typeof getMyProfile>>) {
  if (!me) return false
  if (me.role_global === 'superadmin' || me.role_global === 'admin') return true
  return (
    hasPermission(me, 'estoque_entradas', 'create') ||
    hasPermission(me, 'estoque', 'edit') ||
    hasPermission(me, 'estoque', 'create')
  )
}

function formatDocumento(doc: string): string {
  const d = doc.replace(/\D/g, '')
  if (d.length === 14) {
    return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
  }
  if (d.length === 11) {
    return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
  }
  return doc
}

/** Cria fornecedor a partir do emit da NF-e (confirmação do operador). Gate: estoque_entradas. */
export async function criarFornecedorFromNfeAction(input: {
  emitente: NfeXmlEmitente
  nomeOverride?: string
}) {
  const me = await getMyProfile()
  if (!canEntrada(me) || !me?.empresa_id) {
    return { error: 'Sem permissão para registrar entradas / criar fornecedor neste fluxo.' }
  }

  const docDigits = (input.emitente.cnpj || input.emitente.cpf || '').replace(/\D/g, '')
  if (!docDigits) return { error: 'XML sem CNPJ/CPF do emitente.' }

  const nome =
    (input.nomeOverride || input.emitente.nome || input.emitente.nome_fantasia || '').trim() ||
    `Fornecedor ${formatDocumento(docDigits)}`

  const supabase = await createClient()

  // Já existe?
  const { data: existentes } = await supabase
    .from('crm_leads')
    .select('id, nome, documento, papeis')
    .eq('empresa_id', me.empresa_id)
    .eq('ativo', true)
    .limit(300)

  const match = (existentes || []).find((l) => {
    const c = l.documento ? String(l.documento).replace(/\D/g, '') : ''
    return c === docDigits
  })

  if (match) {
    const papeis = Array.isArray(match.papeis) ? [...match.papeis] : []
    if (!papeis.includes('fornecedor')) {
      papeis.push('fornecedor')
      await supabase
        .from('crm_leads')
        .update({ papeis, updated_at: new Date().toISOString() })
        .eq('id', match.id)
        .eq('empresa_id', me.empresa_id)
    }
    return {
      pessoa: { id: match.id as string, nome: match.nome as string, documento: match.documento as string | null },
      criado: false,
    }
  }

  const e = input.emitente
  const payload = {
    empresa_id: me.empresa_id,
    nome,
    nome_fantasia: e.nome_fantasia || null,
    natureza: docDigits.length === 14 ? 'pj' : 'pf',
    papeis: ['fornecedor'],
    documento: formatDocumento(docDigits),
    rg_ie: e.ie || null,
    inscricao_municipal: e.im || null,
    telefone: e.telefone || null,
    cep: e.cep || null,
    logradouro: e.logradouro || null,
    numero: e.numero || null,
    complemento: e.complemento || null,
    bairro: e.bairro || null,
    cidade: e.cidade || null,
    uf: e.uf || null,
    pais: e.pais || 'Brasil',
    ativo: true,
    status_relacionamento: 'ativo',
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('crm_leads')
    .insert([payload])
    .select('id, nome, documento')
    .single()

  if (error) return { error: error.message }

  revalidatePath('/cockpit/cadastros/pessoas')
  return {
    pessoa: { id: data.id as string, nome: data.nome as string, documento: data.documento as string | null },
    criado: true,
  }
}

/**
 * Complementa um cadastro existente (ex.: fornecedor sem CNPJ) com dados do emit da NF-e.
 * Não sobrescreve documento diferente; só preenche campos vazios + documento da NF-e.
 */
export async function complementarFornecedorFromNfeAction(input: {
  pessoa_id: string
  emitente: NfeXmlEmitente
}) {
  const me = await getMyProfile()
  if (!canEntrada(me) || !me?.empresa_id) {
    return { error: 'Sem permissão para complementar fornecedor neste fluxo.' }
  }

  const pessoaId = input.pessoa_id?.trim()
  if (!pessoaId) return { error: 'Selecione o cadastro existente a complementar.' }

  const docDigits = (input.emitente.cnpj || input.emitente.cpf || '').replace(/\D/g, '')
  if (!docDigits) return { error: 'XML sem CNPJ/CPF do emitente.' }

  const supabase = await createClient()

  const { data: lead, error: leadErr } = await supabase
    .from('crm_leads')
    .select(
      'id, nome, documento, papeis, rg_ie, inscricao_municipal, telefone, cep, logradouro, numero, complemento, bairro, cidade, uf, pais, natureza, nome_fantasia',
    )
    .eq('id', pessoaId)
    .eq('empresa_id', me.empresa_id)
    .eq('ativo', true)
    .maybeSingle()

  if (leadErr) return { error: leadErr.message }
  if (!lead) return { error: 'Cadastro não encontrado nesta empresa.' }

  const docAtual = lead.documento ? String(lead.documento).replace(/\D/g, '') : ''
  if (docAtual && docAtual !== docDigits) {
    return {
      error: `Este cadastro já possui outro documento (${lead.documento}). Não é possível sobrescrever com o CNPJ/CPF da NF-e.`,
    }
  }

  // Outro lead já usa este documento?
  if (!docAtual) {
    const { data: outros } = await supabase
      .from('crm_leads')
      .select('id, nome, documento')
      .eq('empresa_id', me.empresa_id)
      .eq('ativo', true)
      .neq('id', pessoaId)
      .limit(400)

    const conflito = (outros || []).find((l) => {
      const c = l.documento ? String(l.documento).replace(/\D/g, '') : ''
      return c === docDigits
    })
    if (conflito) {
      return {
        error: `O documento da NF-e já está no cadastro "${conflito.nome}". Selecione esse registro ou use o match automático.`,
      }
    }
  }

  const e = input.emitente
  const fill = (atual: unknown, novo: string | undefined | null) => {
    const a = atual != null ? String(atual).trim() : ''
    const n = novo != null ? String(novo).trim() : ''
    return a || n || null
  }

  const papeis = Array.isArray(lead.papeis) ? [...lead.papeis] : []
  if (!papeis.includes('fornecedor')) papeis.push('fornecedor')

  const payload: Record<string, unknown> = {
    documento: formatDocumento(docDigits),
    natureza: docDigits.length === 14 ? 'pj' : docDigits.length === 11 ? 'pf' : lead.natureza,
    papeis,
    nome_fantasia: fill(lead.nome_fantasia, e.nome_fantasia),
    rg_ie: fill(lead.rg_ie, e.ie),
    inscricao_municipal: fill(lead.inscricao_municipal, e.im),
    telefone: fill(lead.telefone, e.telefone),
    cep: fill(lead.cep, e.cep),
    logradouro: fill(lead.logradouro, e.logradouro),
    numero: fill(lead.numero, e.numero),
    complemento: fill(lead.complemento, e.complemento),
    bairro: fill(lead.bairro, e.bairro),
    cidade: fill(lead.cidade, e.cidade),
    uf: fill(lead.uf, e.uf),
    pais: fill(lead.pais, e.pais || 'Brasil'),
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('crm_leads')
    .update(payload)
    .eq('id', pessoaId)
    .eq('empresa_id', me.empresa_id)
    .select('id, nome, documento')
    .single()

  if (error) return { error: error.message }

  revalidatePath('/cockpit/cadastros/pessoas')
  return {
    pessoa: { id: data.id as string, nome: data.nome as string, documento: data.documento as string | null },
    complementado: true,
  }
}

/** Preview de validação das linhas da NF-e (com overrides de sku_id por linha). */
export async function previewNfeLinhasAction(input: {
  pessoa_id: string
  local_id: string
  xml_content: string
  /** sku_id já resolvido pelo operador (mapa linha → sku) */
  skuOverrides?: Record<number, string>
}) {
  const me = await getMyProfile()
  if (!canEntrada(me) || !me?.empresa_id) return { error: 'Sem permissão.' }

  const parsed = parseNfeXml(input.xml_content)
  if (!parsed.sucesso) return { error: parsed.erro || 'XML inválido.' }

  const itens: ItemEntradaInput[] = parsed.itens.map((it) => ({
    linha: it.linha,
    codigo_parceiro: it.codigo_parceiro,
    sku_id: input.skuOverrides?.[it.linha] || null,
    unidade_origem: it.unidade_origem,
    quantidade_origem: it.quantidade_origem,
    justificativa: 'Entrada importada via XML NF-e',
  }))

  const params: LoteEntradaInput = {
    empresa_id: me.empresa_id,
    origem: 'nfe_xml',
    pessoa_id: input.pessoa_id,
    local_id: input.local_id,
    nfe_chave: parsed.chaveNfe,
    documento: parsed.numeroNfe ? `NF-e ${parsed.numeroNfe}` : undefined,
    itens,
  }

  const supabase = await createClient()
  const validacao = await validarLoteEntrada(params, supabase)

  return { parsed, validacao }
}

export async function buscarSkusEntradaAction(q: string) {
  const me = await getMyProfile()
  if (!canEntrada(me) || !me?.empresa_id) return { error: 'Sem permissão.', skus: [] }

  const supabase = await createClient()
  const term = q.trim()
  let query = supabase
    .from('cad_skus')
    .select('id, codigo, nome, unidade_estoque, ncm')
    .eq('empresa_id', me.empresa_id)
    .eq('ativo', true)
    .eq('controla_estoque', true)
    .order('codigo')
    .limit(40)

  if (term) {
    query = query.or(`codigo.ilike.%${term}%,nome.ilike.%${term}%`)
  }

  const { data, error } = await query
  if (error) return { error: error.message, skus: [] }
  return { skus: data || [] }
}

/** Grava de-para e devolve sku resolvido. */
export async function vincularDeparaNfeAction(input: {
  pessoa_id: string
  codigo_parceiro: string
  sku_id: string
  descricao_parceiro?: string
}) {
  const me = await getMyProfile()
  if (!canEntrada(me) || !me?.empresa_id) return { error: 'Sem permissão.' }

  const codigo = input.codigo_parceiro.trim()
  if (!codigo || !input.sku_id || !input.pessoa_id) {
    return { error: 'Dados incompletos para o de-para.' }
  }

  const supabase = await createClient()
  const now = new Date().toISOString()

  const { data: sku } = await supabase
    .from('cad_skus')
    .select('id, codigo, nome, unidade_estoque')
    .eq('empresa_id', me.empresa_id)
    .eq('id', input.sku_id)
    .maybeSingle()

  if (!sku) return { error: 'SKU inválido para esta empresa.' }

  const { data: existingDepara } = await supabase
    .from('cad_sku_depara')
    .select('id, sku_id')
    .eq('empresa_id', me.empresa_id)
    .eq('pessoa_id', input.pessoa_id)
    .eq('codigo_parceiro', codigo)
    .maybeSingle()

  if (existingDepara) {
    if (existingDepara.sku_id === input.sku_id) {
      return { sku }
    }
    const { error: updErr } = await supabase
      .from('cad_sku_depara')
      .update({
        sku_id: input.sku_id,
        observacao: input.descricao_parceiro
          ? `NF-e: ${input.descricao_parceiro}`.slice(0, 240)
          : 'Atualizado na entrada por XML NF-e',
        ativo: true,
        updated_at: now,
      })
      .eq('id', existingDepara.id)
    if (updErr) return { error: updErr.message }
    revalidatePath('/cockpit/cadastros/sku-depara')
    return { sku }
  }

  const { error } = await supabase.from('cad_sku_depara').insert({
    empresa_id: me.empresa_id,
    pessoa_id: input.pessoa_id,
    sku_id: input.sku_id,
    codigo_parceiro: codigo,
    observacao: input.descricao_parceiro
      ? `NF-e: ${input.descricao_parceiro}`.slice(0, 240)
      : 'Criado na entrada por XML NF-e',
    ativo: true,
    updated_at: now,
  })

  if (error) {
    if (error.code === '23505') {
      return { error: 'Já existe de-para conflitante para este SKU/parceiro.' }
    }
    return { error: error.message }
  }

  revalidatePath('/cockpit/cadastros/sku-depara')
  return { sku }
}

/** Cria SKU novo (dados do XML) + de-para + conversão UM se necessário. */
export async function criarSkuFromNfeAction(input: {
  pessoa_id: string
  codigo_parceiro: string
  descricao_parceiro: string
  unidade_origem: string
  unidade_estoque: string
  fator_conversao?: number
  ncm?: string
  cest?: string
  codigo_barras?: string
  valor_unitario?: number
  codigo_sku?: string
}) {
  const me = await getMyProfile()
  if (!canEntrada(me) || !me?.empresa_id) return { error: 'Sem permissão.' }

  const uOrigem = input.unidade_origem.trim().toUpperCase() || 'UN'
  const uEstoque = input.unidade_estoque.trim().toUpperCase() || uOrigem
  if (!uEstoque) return { error: 'Confirme a unidade de estoque.' }

  if (uOrigem !== uEstoque) {
    const fator = Number(input.fator_conversao)
    if (!Number.isFinite(fator) || fator <= 0) {
      return { error: 'Informe o fator de conversão (UM da NF-e → UM de estoque).' }
    }
  }

  const nome = (input.descricao_parceiro || input.codigo_parceiro).trim()
  if (!nome) return { error: 'Descrição do item ausente.' }

  const codigoSku =
    (input.codigo_sku || input.codigo_parceiro || '').trim().slice(0, 60) ||
    `NFE-${Date.now().toString(36).toUpperCase()}`

  const supabase = await createClient()
  const now = new Date().toISOString()

  // código único — se colidir, sufixa
  let codigoFinal = codigoSku
  for (let i = 0; i < 5; i++) {
    const { data: exists } = await supabase
      .from('cad_skus')
      .select('id')
      .eq('empresa_id', me.empresa_id)
      .eq('codigo', codigoFinal)
      .maybeSingle()
    if (!exists) break
    codigoFinal = `${codigoSku}-${i + 2}`.slice(0, 60)
  }

  const allowedUm = new Set(SKU_UNIDADES as readonly string[])
  const umEstoque = allowedUm.has(uEstoque) || uEstoque.length <= 10 ? uEstoque : 'UN'
  const umCompra = allowedUm.has(uOrigem) || uOrigem.length <= 10 ? uOrigem : umEstoque

  const { data: sku, error: skuErr } = await supabase
    .from('cad_skus')
    .insert([
      {
        empresa_id: me.empresa_id,
        codigo: codigoFinal,
        nome: nome.slice(0, 200),
        nome_fiscal: nome.slice(0, 200),
        tipo: 'produto',
        natureza: 'fisico',
        codigo_barras: input.codigo_barras || null,
        unidade_venda: umEstoque,
        unidade_compra: umCompra,
        unidade_estoque: umEstoque,
        preco_custo: input.valor_unitario != null ? Number(input.valor_unitario) : null,
        controla_estoque: true,
        ncm: input.ncm || null,
        cest: input.cest || null,
        fornecedor_padrao_id: input.pessoa_id,
        ativo: true,
        updated_at: now,
      },
    ])
    .select('id, codigo, nome, unidade_estoque')
    .single()

  if (skuErr) return { error: skuErr.message }

  if (uOrigem !== umEstoque) {
    const fator = Number(input.fator_conversao)
    await supabase.from('cad_sku_unidade_conversao').insert([
      {
        empresa_id: me.empresa_id,
        sku_id: sku.id,
        unidade_origem: uOrigem,
        unidade_destino: umEstoque,
        fator_conversao: fator,
        updated_at: now,
      },
    ])
  }

  const depara = await vincularDeparaNfeAction({
    pessoa_id: input.pessoa_id,
    codigo_parceiro: input.codigo_parceiro,
    sku_id: sku.id,
    descricao_parceiro: input.descricao_parceiro,
  })

  if ('error' in depara && depara.error) {
    return { error: `SKU criado, mas de-para falhou: ${depara.error}`, sku }
  }

  revalidatePath('/cockpit/cadastros/skus')
  return { sku }
}
