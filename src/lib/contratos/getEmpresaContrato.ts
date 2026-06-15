import { createClient } from '@/utils/supabase/server'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { hasPermission } from '@/utils/permissions'
import {
  contractDataFromEmpresa,
  getMissingContractFields,
} from '@/lib/contratos/contractDataFromEmpresa'
import { mergeContratoIntoContractData } from '@/lib/contratos/contractDataFromContrato'
import { buildFilledContractHtml } from '@/lib/contratos/fillContractTemplate'
import type { ContractFillData } from '@/lib/contratos/types'

export type EmpresaContratoResult =
  | {
      ok: true
      empresaId: string
      empresaNome: string
      data: ContractFillData
      html: string
      missingFields: string[]
    }
  | { ok: false; error: string; status: number }

export async function getEmpresaContratoPayload(
  empresaId: string,
  contratoId?: string | null
): Promise<EmpresaContratoResult> {
  const me = await getMyProfile()
  if (!me || !hasPermission(me, 'empresas', 'view')) {
    return { ok: false, error: 'Sem permissão para gerar contrato.', status: 403 }
  }

  const supabase = await createClient()
  const { data: empresa, error } = await supabase
    .from('empresas')
    .select('*')
    .eq('id', empresaId)
    .maybeSingle()

  if (error || !empresa) {
    return { ok: false, error: 'Empresa não encontrada.', status: 404 }
  }

  if (me.role_global !== 'superadmin' && me.empresa_id !== empresa.id) {
    return { ok: false, error: 'Acesso negado a esta empresa.', status: 403 }
  }

  const data = contractDataFromEmpresa(empresa)

  if (contratoId) {
    const { data: contrato } = await supabase
      .from('finance_contratos')
      .select(
        '*, finance_contrato_servicos_extra(descricao, observacao)'
      )
      .eq('id', contratoId)
      .maybeSingle()

    if (contrato?.empresa_id === empresa.id) {
      Object.assign(data, mergeContratoIntoContractData(data, contrato))
      data.servicosExtras = (contrato.finance_contrato_servicos_extra ?? [])
        .map((item) => ({
          descricao: String(item.descricao ?? '').trim(),
          observacao: item.observacao ? String(item.observacao).trim() : undefined,
        }))
        .filter((item) => item.descricao)
    }
  }

  const missingFields = getMissingContractFields(data)
  const html = await buildFilledContractHtml(data)

  return {
    ok: true,
    empresaId: empresa.id,
    empresaNome: String(empresa.nome ?? 'Cliente'),
    data,
    html,
    missingFields,
  }
}
