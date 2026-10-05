import { createClient } from '@/utils/supabase/server'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { podeAprovarRequisicao } from '@/lib/estoque/aprovacao-requisicao'
import EstoqueAreaNavClient from './EstoqueAreaNavClient'

/**
 * Nav do módulo estoque. Oculta "Aprovação" se o usuário não for
 * aprovador configurado / admin / superadmin.
 */
export default async function EstoqueAreaNav() {
  const me = await getMyProfile()
  let canAprovar = false

  if (me?.empresa_id) {
    const supabase = await createClient()
    const { data: config } = await supabase
      .from('est_config')
      .select('req_aprovacao_ativa, req_aprovador_usuario_id, req_aprovacao_valor_minimo')
      .eq('empresa_id', me.empresa_id)
      .maybeSingle()

    canAprovar = podeAprovarRequisicao(me, config)
  } else if (me?.role_global === 'superadmin') {
    canAprovar = true
  }

  return <EstoqueAreaNavClient canAprovarRequisicoes={canAprovar} />
}
