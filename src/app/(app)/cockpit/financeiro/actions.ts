'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { isRn3SuperAdmin } from '@/utils/permissions'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { parseMoneyInput } from '@/lib/finance/format'
import type { FinanceDashboard, ContaReceberRelatorio } from '@/lib/finance/types'

function resolveEmpresaId(me: Awaited<ReturnType<typeof getMyProfile>>, formEmpresaId?: string | null) {
  if (me?.role_global === 'superadmin') {
    return formEmpresaId || null
  }
  return me?.empresa_id ?? null
}

export async function getFinanceDashboard(empresaId?: string | null): Promise<FinanceDashboard | null> {
  const me = await getMyProfile()
  if (!isRn3SuperAdmin(me)) return null

  const supabase = await createClient()
  const pEmpresa =
    me?.role_global === 'superadmin' && empresaId ? empresaId : null

  const { data, error } = await supabase.rpc('fn_finance_dashboard', {
    p_empresa_id: pEmpresa,
  })

  if (error) {
    console.error('[finance] dashboard:', error.message)
    return null
  }

  return data as FinanceDashboard
}

export async function listContasReceber(filters: {
  q?: string
  status?: string
  tipo?: string
  empresaId?: string
  contratoId?: string
}): Promise<ContaReceberRelatorio[]> {
  const me = await getMyProfile()
  if (!isRn3SuperAdmin(me)) return []

  const supabase = await createClient()
  let query = supabase
    .from('vw_finance_contas_receber_relatorio')
    .select('*')
    .order('vencimento', { ascending: true })

  if (me?.role_global === 'superadmin' && filters.empresaId) {
    query = query.eq('empresa_id', filters.empresaId)
  }

  if (filters.status) {
    query = query.eq('status', filters.status)
  }

  if (filters.tipo) {
    query = query.eq('tipo', filters.tipo)
  }

  if (filters.contratoId) {
    query = query.eq('contrato_id', filters.contratoId)
  }

  if (filters.q) {
    query = query.or(`descricao.ilike.%${filters.q}%,origem.ilike.%${filters.q}%`)
  }

  const { data, error } = await query

  if (error) {
    console.error('[finance] list:', error.message)
    return []
  }

  return (data ?? []) as ContaReceberRelatorio[]
}

export async function createContaReceber(formData: FormData) {
  const me = await getMyProfile()
  if (!isRn3SuperAdmin(me)) {
    return { error: 'Acesso restrito ao Super Admin RN3.' }
  }

  const tipo = formData.get('tipo') as string
  const valorRaw = formData.get('valor_total') as string
  const vencimento = formData.get('vencimento') as string
  const descricao = (formData.get('descricao') as string) || null
  const competenciaRaw = formData.get('competencia') as string
  const competencia = competenciaRaw || null
  const meioRaw = formData.get('meio_pagamento') as string
  const meio_pagamento = meioRaw || null
  const meio_pagamento_detalhe = (formData.get('meio_pagamento_detalhe') as string) || null
  const empresa_id = resolveEmpresaId(me, formData.get('empresa_id') as string)
  const parcelasRaw = formData.get('parcelas_total') as string
  const parcelas_total = Math.max(1, parseInt(parcelasRaw || '1', 10) || 1)

  const valor_total = parseMoneyInput(valorRaw)
  if (!tipo || !vencimento || valor_total === null || valor_total <= 0) {
    return { error: 'Preencha tipo, valor e vencimento corretamente.' }
  }

  if (parcelas_total < 1 || parcelas_total > 120) {
    return { error: 'Quantidade de parcelas deve ser entre 1 e 120.' }
  }

  if (tipo === 'mensalidade' && meio_pagamento && meio_pagamento !== 'stripe') {
    return { error: 'Mensalidades devem usar Stripe como meio de pagamento.' }
  }

  const supabase = await createClient()
  const { data: contaId, error } = await supabase.rpc('sp_finance_criar_conta_receber', {
    p_tipo: tipo,
    p_valor_total: valor_total,
    p_vencimento: vencimento,
    p_empresa_id: empresa_id,
    p_descricao: descricao,
    p_competencia: competencia,
    p_origem: 'manual',
    p_meio_pagamento: meio_pagamento,
    p_meio_pagamento_detalhe: meio_pagamento_detalhe,
    p_metadata: {},
    p_parcelas_total: parcelas_total,
  })

  if (error) return { error: error.message }

  revalidatePath('/cockpit/financeiro')
  revalidatePath('/cockpit/financeiro/contas')
  redirect(`/cockpit/financeiro/contas/${contaId}`)
}

export async function registrarBaixa(contaId: string, formData: FormData) {
  const me = await getMyProfile()
  if (!isRn3SuperAdmin(me)) {
    return { error: 'Acesso restrito ao Super Admin RN3.' }
  }

  const valorRaw = formData.get('valor') as string
  const meio_pagamento = formData.get('meio_pagamento') as string
  const data_pagamento = (formData.get('data_pagamento') as string) || undefined
  const meio_pagamento_detalhe = (formData.get('meio_pagamento_detalhe') as string) || null
  const observacao = (formData.get('observacao') as string) || null

  const valor = parseMoneyInput(valorRaw)
  if (!meio_pagamento || valor === null || valor <= 0) {
    return { error: 'Informe valor e meio de pagamento válidos.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('sp_finance_registrar_baixa', {
    p_conta_receber_id: contaId,
    p_valor: valor,
    p_meio_pagamento: meio_pagamento,
    p_data_pagamento: data_pagamento,
    p_meio_pagamento_detalhe: meio_pagamento_detalhe,
    p_observacao: observacao,
  })

  if (error) return { error: error.message }

  revalidatePath('/cockpit/financeiro')
  revalidatePath('/cockpit/financeiro/contas')
  revalidatePath(`/cockpit/financeiro/contas/${contaId}`)
  return { success: true }
}

export async function cancelarContaReceber(contaId: string, formData: FormData) {
  const me = await getMyProfile()
  if (!isRn3SuperAdmin(me)) {
    return { error: 'Acesso restrito ao Super Admin RN3.' }
  }

  const motivo = (formData.get('motivo') as string) || null
  const supabase = await createClient()
  const { error } = await supabase.rpc('sp_finance_cancelar_conta_receber', {
    p_conta_id: contaId,
    p_motivo: motivo,
  })

  if (error) return { error: error.message }

  revalidatePath('/cockpit/financeiro')
  revalidatePath('/cockpit/financeiro/contas')
  revalidatePath(`/cockpit/financeiro/contas/${contaId}`)
  redirect(`/cockpit/financeiro/contas/${contaId}`)
}
