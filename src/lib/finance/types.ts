import type { FinanceMeioPagamento, FinanceTipo } from './constants'

export interface ContaReceberRelatorio {
  id: string
  empresa_id: string
  contrato_id: string | null
  tipo: FinanceTipo
  origem: string
  descricao: string | null
  competencia: string | null
  valor_total: number
  moeda: string
  status: string
  vencimento: string
  pago_total: number
  saldo: number
  meio_pagamento: FinanceMeioPagamento | null
  meio_pagamento_detalhe: string | null
  grupo_parcelamento_id: string | null
  parcela_numero: number
  parcelas_total: number
  valor_contrato_original: number | null
  numero_documento: string | null
  dias_atraso: number
  valor_aberto: number
  valor_pago: number
  status_calculado: string
  ultima_baixa: string | null
  created_at: string
  updated_at: string
}

export interface ContaReceberBaixa {
  id: string
  empresa_id: string
  conta_receber_id: string
  valor: number
  data_pagamento: string
  meio_pagamento: FinanceMeioPagamento
  meio_pagamento_detalhe: string | null
  observacao: string | null
  created_at: string
}

export interface FinanceDashboard {
  empresa_id: string
  total_aberto: number
  total_vencido: number
  total_a_vencer_7_dias: number
  total_recebido_periodo: number
  qtd_contas_abertas: number
  qtd_contas_vencidas: number
  qtd_contas_pagas: number
  por_tipo: Record<string, number>
}
