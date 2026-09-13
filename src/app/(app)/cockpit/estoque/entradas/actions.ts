'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { hasPermission } from '@/utils/permissions'
import { validarLoteEntrada } from '@/lib/estoque/validacao-entrada'
import { processarLoteEntrada } from '@/lib/estoque/processar-entrada'
import { parseNfeXml } from '@/lib/estoque/parser-nfe-xml'
import type { ItemEntradaInput, LoteEntradaInput } from '@/lib/estoque/tipos'

const LIST_PATH = '/cockpit/estoque/entradas'

export async function validarEntradaPreviewAction(data: {
  pessoa_id: string
  local_id: string
  origem: 'lote_tela' | 'planilha' | 'nfe_xml'
  documento?: string
  nfe_chave?: string
  observacao?: string
  itens: ItemEntradaInput[]
}) {
  const me = await getMyProfile()
  if (!me?.empresa_id) return { error: 'Usuário não autenticado.' }

  const supabase = await createClient()

  const params: LoteEntradaInput = {
    empresa_id: me.empresa_id,
    origem: data.origem,
    pessoa_id: data.pessoa_id,
    local_id: data.local_id,
    documento: data.documento,
    nfe_chave: data.nfe_chave,
    observacao: data.observacao,
    usuario_id: me.id,
    itens: data.itens,
  }

  const validacao = await validarLoteEntrada(params, supabase)
  return { validacao }
}

export async function criarEntradaLoteTelaAction(data: {
  pessoa_id: string
  local_id: string
  documento?: string
  observacao?: string
  movimento_em?: string
  itens: ItemEntradaInput[]
}) {
  const me = await getMyProfile()
  const isSuperAdmin = me?.role_global === 'superadmin'

  const canCreate =
    isSuperAdmin ||
    hasPermission(me, 'estoque_entradas', 'create') ||
    hasPermission(me, 'estoque', 'edit')

  if (!canCreate) {
    return { error: 'Sem permissão para registrar entradas de estoque.' }
  }

  if (!data.pessoa_id) {
    return { error: 'Selecione o fornecedor em Cadastros → Pessoas.' }
  }

  if (!data.local_id) {
    return { error: 'Selecione o local de estoque de destino.' }
  }

  if (!data.itens || data.itens.length === 0) {
    return { error: 'Adicione ao menos um item para registrar a entrada.' }
  }

  const empresaId = me?.empresa_id ?? ''
  if (!empresaId) return { error: 'Empresa não identificada.' }

  const supabase = await createClient()

  const params: LoteEntradaInput = {
    empresa_id: empresaId,
    origem: 'lote_tela',
    pessoa_id: data.pessoa_id,
    local_id: data.local_id,
    documento: data.documento,
    observacao: data.observacao,
    usuario_id: me.id,
    movimento_em: data.movimento_em,
    itens: data.itens,
  }

  const resultado = await processarLoteEntrada(params, supabase)

  revalidatePath(LIST_PATH)
  revalidatePath('/cockpit/estoque')
  revalidatePath('/cockpit/estoque/cardex')
  revalidatePath('/cockpit/estoque/saldos')

  return resultado
}

export async function criarEntradaPlanilhaAction(data: {
  pessoa_id: string
  local_id: string
  documento?: string
  observacao?: string
  movimento_em?: string
  itens: ItemEntradaInput[]
}) {
  const me = await getMyProfile()
  const isSuperAdmin = me?.role_global === 'superadmin'

  const canCreate =
    isSuperAdmin ||
    hasPermission(me, 'estoque_entradas', 'create') ||
    hasPermission(me, 'estoque', 'edit')

  if (!canCreate) {
    return { error: 'Sem permissão para registrar entradas de estoque.' }
  }

  if (!data.pessoa_id) {
    return { error: 'Selecione o fornecedor em Cadastros → Pessoas.' }
  }

  if (!data.local_id) {
    return { error: 'Selecione o local de estoque de destino.' }
  }

  if (!data.itens || data.itens.length === 0) {
    return { error: 'A planilha não possui itens válidos para entrada.' }
  }

  const empresaId = me?.empresa_id ?? ''
  if (!empresaId) return { error: 'Empresa não identificada.' }

  const supabase = await createClient()

  const params: LoteEntradaInput = {
    empresa_id: empresaId,
    origem: 'planilha',
    pessoa_id: data.pessoa_id,
    local_id: data.local_id,
    documento: data.documento,
    observacao: data.observacao,
    usuario_id: me.id,
    movimento_em: data.movimento_em,
    itens: data.itens,
  }

  const resultado = await processarLoteEntrada(params, supabase)

  revalidatePath(LIST_PATH)
  revalidatePath('/cockpit/estoque')
  revalidatePath('/cockpit/estoque/cardex')
  revalidatePath('/cockpit/estoque/saldos')

  return resultado
}

export async function parseNfeXmlAction(xmlContent: string) {
  const me = await getMyProfile()
  if (!me?.empresa_id) return { error: 'Usuário não autenticado.' }

  const parsed = parseNfeXml(xmlContent)
  if (!parsed.sucesso) {
    return { error: parsed.erro || 'Falha ao interpretar XML da NF-e.' }
  }

  const supabase = await createClient()

  // 1. Busca emitente/fornecedor por documento em crm_leads (somente leitura)
  let fornecedorEncontrado: { id: string; nome: string; documento: string | null } | null = null
  if (parsed.fornecedorCnpj) {
    const cnpjNumerico = parsed.fornecedorCnpj.replace(/\D/g, '')
    const { data: leads } = await supabase
      .from('crm_leads')
      .select('id, nome, documento')
      .eq('empresa_id', me.empresa_id)
      .eq('ativo', true)
      .contains('papeis', ['fornecedor'])
      .limit(200)

    const match = leads?.find((l: { id: string; nome: string; documento: string | null }) => {
      const c = l.documento ? l.documento.replace(/\D/g, '') : ''
      return c === cnpjNumerico && cnpjNumerico.length > 0
    })

    if (match) {
      fornecedorEncontrado = match
    }
  }

  // 2. Checa duplicidade da chave da NF-e no sistema (§6.4)
  let nfeDuplicada = false
  if (parsed.chaveNfe) {
    const { data: chaveExistente } = await supabase
      .from('est_entrada_lotes')
      .select('id, numero, status')
      .eq('empresa_id', me.empresa_id)
      .eq('nfe_chave', parsed.chaveNfe)
      .maybeSingle()

    if (chaveExistente) {
      nfeDuplicada = true
    }
  }

  return {
    parsed,
    fornecedorEncontrado,
    nfeDuplicada,
  }
}

export async function criarEntradaNfeXmlAction(data: {
  pessoa_id: string
  local_id: string
  xml_content: string
  documento?: string
  observacao?: string
  justificativaGeral?: string
}) {
  const me = await getMyProfile()
  const isSuperAdmin = me?.role_global === 'superadmin'

  const canCreate =
    isSuperAdmin ||
    hasPermission(me, 'estoque_entradas', 'create') ||
    hasPermission(me, 'estoque', 'edit')

  if (!canCreate) {
    return { error: 'Sem permissão para registrar entradas de estoque.' }
  }

  if (!data.pessoa_id) {
    return { error: 'Selecione o fornecedor em Cadastros → Pessoas.' }
  }

  if (!data.local_id) {
    return { error: 'Selecione o local de estoque de destino.' }
  }

  const parsed = parseNfeXml(data.xml_content)
  if (!parsed.sucesso) {
    return { error: parsed.erro || 'Falha ao interpretar XML da NF-e.' }
  }

  const empresaId = me?.empresa_id ?? ''
  if (!empresaId) return { error: 'Empresa não identificada.' }

  const supabase = await createClient()

  // Converte itens do XML para itens de lote
  const itens: ItemEntradaInput[] = parsed.itens.map((it) => ({
    linha: it.linha,
    codigo_parceiro: it.codigo_parceiro,
    unidade_origem: it.unidade_origem,
    quantidade_origem: it.quantidade_origem,
    valor_unitario: it.valor_unitario,
    valor_total: it.valor_total,
    justificativa: data.justificativaGeral || 'Entrada importada via XML NF-e',
  }))

  const params: LoteEntradaInput = {
    empresa_id: empresaId,
    origem: 'nfe_xml',
    pessoa_id: data.pessoa_id,
    local_id: data.local_id,
    documento: data.documento || (parsed.numeroNfe ? `NF-e ${parsed.numeroNfe}` : 'NF-e XML'),
    nfe_chave: parsed.chaveNfe,
    observacao: data.observacao || (parsed.fornecedorNome ? `Emitente: ${parsed.fornecedorNome}` : undefined),
    usuario_id: me.id,
    movimento_em: parsed.emissaoEm,
    itens,
  }

  const resultado = await processarLoteEntrada(params, supabase)

  revalidatePath(LIST_PATH)
  revalidatePath('/cockpit/estoque')
  revalidatePath('/cockpit/estoque/cardex')
  revalidatePath('/cockpit/estoque/saldos')

  return resultado
}
