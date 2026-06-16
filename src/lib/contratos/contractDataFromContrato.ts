import { CONTRATO_SETUP_MEIOS } from '@/lib/finance/contrato-constants'
import { computeMesesVigencia, formatBRL, formatDateBR } from '@/lib/finance/format'
import type { ContractFillData } from './types'

export type ContratoRow = Record<string, unknown>

function setupMeioLabel(value: unknown): string {
  const key = String(value ?? '')
  return CONTRATO_SETUP_MEIOS.find((m) => m.value === key)?.label ?? ''
}

function formatSetupValor(contrato: ContratoRow): string {
  const valor = Number(contrato.valor_setup ?? 0)
  const parcelas = Number(contrato.setup_parcelas ?? 1)
  let text = formatBRL(valor)
  if (parcelas > 1) text += ` em ${parcelas} parcelas`
  return text
}

function formatContractDateFromIso(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

function formatPrazoVigencia(contrato: ContratoRow): string {
  const dataInicio = String(contrato.data_inicio ?? '')
  const dataFim = contrato.data_fim ? String(contrato.data_fim) : null
  const meses =
    contrato.mensalidades_total != null
      ? Number(contrato.mensalidades_total)
      : computeMesesVigencia(dataInicio, dataFim)

  return `${meses} meses, com renovação automática por períodos sucessivos de ${meses} meses, salvo denúncia com 30 dias de antecedência`
}

export function mergeContratoIntoContractData(
  data: ContractFillData,
  contrato: ContratoRow
): ContractFillData {
  const valorSetup = Number(contrato.valor_setup ?? 0)
  const meioSetup = setupMeioLabel(contrato.meio_pagamento_setup)
  const dataAssinatura = contrato.data_assinatura ? String(contrato.data_assinatura) : ''

  return {
    ...data,
    hasContratoComercial: true,
    dataContrato: dataAssinatura ? formatContractDateFromIso(dataAssinatura) : data.dataContrato,
    dataInicioPrestacao: formatDateBR(String(contrato.data_inicio ?? '')),
    prazoVigencia: formatPrazoVigencia(contrato),
    planoContratado: String(contrato.titulo ?? '').trim(),
    valorSetup: formatSetupValor(contrato),
    meioPagamentoSetup: valorSetup > 0 ? meioSetup : '—',
    valorMensalidade: formatBRL(Number(contrato.valor_mensalidade ?? 0)),
    diaVencimentoMensal:
      contrato.dia_vencimento_mensal != null ? String(contrato.dia_vencimento_mensal) : '',
    limiteUsuarios:
      contrato.limite_usuarios != null ? String(contrato.limite_usuarios) : '',
    numeroOs: String(contrato.numero_os ?? '').trim(),
    testemunha1Nome: String(contrato.testemunha_1_nome ?? '').trim(),
    testemunha1Cpf: String(contrato.testemunha_1_cpf ?? '').trim(),
    testemunha2Nome: String(contrato.testemunha_2_nome ?? '').trim(),
    testemunha2Cpf: String(contrato.testemunha_2_cpf ?? '').trim(),
  }
}
