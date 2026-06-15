import type { ContratoStatus } from './contrato-constants'

export interface ContratoServicoExtra {
  id: string
  contrato_id: string
  empresa_id: string
  descricao: string
  valor: number
  parcelas: number
  recorrente_mensal: boolean
  observacao: string | null
  created_at: string
}

export interface FinanceContrato {
  id: string
  empresa_id: string
  numero_contrato: string | null
  numero_os: string | null
  titulo: string | null
  status: ContratoStatus
  data_assinatura: string | null
  data_inicio: string
  data_fim: string | null
  dia_vencimento_mensal: number | null
  valor_setup: number
  setup_parcelas: number
  valor_mensalidade: number
  mensalidades_total: number | null
  meio_pagamento_setup: string | null
  limite_usuarios: number | null
  testemunha_1_nome: string | null
  testemunha_1_cpf: string | null
  testemunha_2_nome: string | null
  testemunha_2_cpf: string | null
  moeda: string
  indice_reajuste: string | null
  observacoes: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
  contas_ar_geradas_em: string | null
  contas_ar_geradas_qtd: number
  finance_contrato_servicos_extra?: ContratoServicoExtra[]
}

export interface ContratoFormExtra {
  descricao: string
  valor: number
  parcelas: number
  recorrente_mensal: boolean
  observacao?: string
}
