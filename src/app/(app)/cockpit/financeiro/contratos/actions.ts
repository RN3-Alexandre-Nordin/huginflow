'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { hasPermission } from '@/utils/permissions'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { parseMoneyInput } from '@/lib/finance/format'
import type { ContratoFormExtra, FinanceContrato } from '@/lib/finance/contrato-types'

function resolveEmpresaId(me: Awaited<ReturnType<typeof getMyProfile>>, formEmpresaId?: string | null) {
  if (me?.role_global === 'superadmin') return formEmpresaId || null
  return me?.empresa_id ?? null
}

function parseExtrasFromForm(formData: FormData): ContratoFormExtra[] {
  const descricoes = formData.getAll('extra_descricao') as string[]
  const valores = formData.getAll('extra_valor') as string[]
  const parcelasList = formData.getAll('extra_parcelas') as string[]

  const extras: ContratoFormExtra[] = []
  for (let i = 0; i < descricoes.length; i++) {
    const descricao = (descricoes[i] || '').trim()
    if (!descricao) continue
    const valor = parseMoneyInput(valores[i] || '')
    if (valor === null || valor < 0) continue
    extras.push({
      descricao,
      valor,
      parcelas: Math.max(1, parseInt(parcelasList[i] || '1', 10) || 1),
      recorrente_mensal: formData.get(`extra_recorrente_${i}`) === 'on',
      observacao: (formData.get(`extra_observacao_${i}`) as string) || undefined,
    })
  }
  return extras
}

function parseContratoFields(formData: FormData, empresaId: string | null) {
  const titulo = (formData.get('titulo') as string) || null
  const status = (formData.get('status') as string) || 'rascunho'
  const data_assinatura = (formData.get('data_assinatura') as string) || null
  const data_inicio = formData.get('data_inicio') as string
  const data_fim = (formData.get('data_fim') as string) || null
  const diaRaw = formData.get('dia_vencimento_mensal') as string
  const dia_vencimento_mensal = diaRaw ? parseInt(diaRaw, 10) : null
  const valor_setup = parseMoneyInput(formData.get('valor_setup') as string) ?? 0
  const setup_parcelas = Math.max(1, parseInt((formData.get('setup_parcelas') as string) || '1', 10) || 1)
  const valor_mensalidade = parseMoneyInput(formData.get('valor_mensalidade') as string) ?? 0
  const mensalidadesRaw = (formData.get('mensalidades_total') as string) || ''
  const mensalidades_total = mensalidadesRaw
    ? Math.min(120, Math.max(1, parseInt(mensalidadesRaw, 10) || 0))
    : null
  const meioSetupRaw = (formData.get('meio_pagamento_setup') as string) || ''
  const meio_pagamento_setup = meioSetupRaw || null
  const indiceRaw = formData.get('indice_reajuste') as string
  const indice_reajuste = indiceRaw || null
  const observacoes = (formData.get('observacoes') as string) || null
  const numero_contrato = (formData.get('numero_contrato') as string) || null
  const limiteRaw = (formData.get('limite_usuarios') as string) || ''
  const limite_usuarios = limiteRaw ? parseInt(limiteRaw, 10) : null
  const testemunha_1_nome = ((formData.get('testemunha_1_nome') as string) || '').trim() || null
  const testemunha_1_cpf = ((formData.get('testemunha_1_cpf') as string) || '').trim() || null
  const testemunha_2_nome = ((formData.get('testemunha_2_nome') as string) || '').trim() || null
  const testemunha_2_cpf = ((formData.get('testemunha_2_cpf') as string) || '').trim() || null

  if (!data_inicio) return { error: 'Data de início é obrigatória.' }
  if (!empresaId) return { error: 'Empresa é obrigatória.' }
  if (limite_usuarios != null && (!Number.isFinite(limite_usuarios) || limite_usuarios < 1)) {
    return { error: 'Limite de usuários deve ser um número inteiro positivo.' }
  }
  if (valor_setup > 0 && !meio_pagamento_setup) {
    return { error: 'Informe o meio de pagamento do setup quando houver valor de setup.' }
  }

  return {
    payload: {
      empresa_id: empresaId,
      titulo,
      status,
      data_assinatura,
      data_inicio,
      data_fim,
      dia_vencimento_mensal,
      valor_setup,
      setup_parcelas,
      valor_mensalidade,
      mensalidades_total,
      meio_pagamento_setup,
      indice_reajuste,
      observacoes,
      numero_contrato: numero_contrato?.trim() || null,
      limite_usuarios,
      testemunha_1_nome,
      testemunha_1_cpf,
      testemunha_2_nome,
      testemunha_2_cpf,
    },
  }
}

export async function listContratos(empresaId?: string): Promise<FinanceContrato[]> {
  const me = await getMyProfile()
  if (!hasPermission(me, 'contratos', 'view')) return []

  const supabase = await createClient()
  let query = supabase
    .from('finance_contratos')
    .select('*')
    .order('created_at', { ascending: false })

  if (me?.role_global === 'superadmin' && empresaId) {
    query = query.eq('empresa_id', empresaId)
  }

  const { data, error } = await query
  if (error) {
    console.error('[contratos] list:', error.message)
    return []
  }
  return (data ?? []) as FinanceContrato[]
}

export async function getContrato(id: string): Promise<FinanceContrato | null> {
  const me = await getMyProfile()
  if (!hasPermission(me, 'contratos', 'view')) return null

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('finance_contratos')
    .select('*, finance_contrato_servicos_extra(*)')
    .eq('id', id)
    .maybeSingle()

  if (error || !data) return null
  return data as FinanceContrato
}

async function syncExtras(contratoId: string, empresaId: string, extras: ContratoFormExtra[]) {
  const supabase = await createClient()
  await supabase.from('finance_contrato_servicos_extra').delete().eq('contrato_id', contratoId)

  if (extras.length === 0) return

  const rows = extras.map((e) => ({
    contrato_id: contratoId,
    empresa_id: empresaId,
    descricao: e.descricao,
    valor: e.valor,
    parcelas: e.parcelas,
    recorrente_mensal: e.recorrente_mensal,
    observacao: e.observacao || null,
  }))

  const { error } = await supabase.from('finance_contrato_servicos_extra').insert(rows)
  if (error) throw new Error(error.message)
}

export async function createContrato(formData: FormData) {
  const me = await getMyProfile()
  if (!hasPermission(me, 'contratos', 'create')) {
    return { error: 'Sem permissão para criar contratos.' }
  }

  const empresaId = resolveEmpresaId(me, formData.get('empresa_id') as string)
  const parsed = parseContratoFields(formData, empresaId)
  if ('error' in parsed) return { error: parsed.error }

  const extras = parseExtrasFromForm(formData)
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('finance_contratos')
    .insert([parsed.payload])
    .select('id, empresa_id')
    .single()

  if (error) return { error: error.message }

  try {
    await syncExtras(data.id, data.empresa_id, extras)
  } catch (e) {
    await supabase.from('finance_contratos').delete().eq('id', data.id)
    return { error: e instanceof Error ? e.message : 'Erro ao salvar serviços extras.' }
  }

  revalidatePath('/cockpit/financeiro/contratos')
  redirect(`/cockpit/financeiro/contratos/${data.id}`)
}

export async function updateContrato(id: string, formData: FormData) {
  const me = await getMyProfile()
  if (!hasPermission(me, 'contratos', 'edit')) {
    return { error: 'Sem permissão para editar contratos.' }
  }

  const existing = await getContrato(id)
  if (!existing) return { error: 'Contrato não encontrado.' }

  const empresaId = resolveEmpresaId(me, formData.get('empresa_id') as string) ?? existing.empresa_id
  const parsed = parseContratoFields(formData, empresaId)
  if ('error' in parsed) return { error: parsed.error }

  const extras = parseExtrasFromForm(formData)
  const supabase = await createClient()

  let query = supabase.from('finance_contratos').update(parsed.payload).eq('id', id)
  if (me?.role_global !== 'superadmin') {
    query = query.eq('empresa_id', me?.empresa_id ?? '')
  }

  const { error } = await query
  if (error) return { error: error.message }

  try {
    await syncExtras(id, empresaId, extras)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao atualizar serviços extras.' }
  }

  revalidatePath('/cockpit/financeiro/contratos')
  revalidatePath(`/cockpit/financeiro/contratos/${id}`)
  redirect(`/cockpit/financeiro/contratos/${id}`)
}

export interface GerarContasResult {
  contrato_id: string
  setup: number
  mensalidades: number
  extras: number
  total: number
  meses_vigencia: number
  primeira_conta_id: string | null
}

export async function countContasDoContrato(contratoId: string): Promise<number> {
  const supabase = await createClient()
  const { count } = await supabase
    .from('finance_contas_receber')
    .select('id', { count: 'exact', head: true })
    .eq('contrato_id', contratoId)
    .neq('status', 'cancelada')
  return count ?? 0
}

export async function gerarContasReceberDoContrato(
  contratoId: string,
  forcar = false,
  mensalidades?: number
): Promise<{ error?: string; result?: GerarContasResult }> {
  const me = await getMyProfile()
  if (!hasPermission(me, 'contratos', 'edit') || !hasPermission(me, 'financeiro', 'create')) {
    return { error: 'Sem permissão para gerar contas a receber.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('sp_finance_gerar_contas_do_contrato', {
    p_contrato_id: contratoId,
    p_forcar: forcar,
    p_mensalidades: mensalidades && mensalidades > 0 ? mensalidades : null,
  })

  if (error) return { error: error.message }

  revalidatePath('/cockpit/financeiro')
  revalidatePath('/cockpit/financeiro/contas')
  revalidatePath(`/cockpit/financeiro/contratos/${contratoId}`)

  return { result: data as GerarContasResult }
}
