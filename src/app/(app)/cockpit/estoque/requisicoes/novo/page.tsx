import { createClient } from '@/utils/supabase/server'
import { ClipboardList, Lock } from 'lucide-react'
import BackTextButton from '@/components/BackTextButton'
import EstoqueAreaNav from '@/components/estoque/EstoqueAreaNav'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { hasPermission } from '@/utils/permissions'
import RequisicaoForm from './RequisicaoForm'

export const metadata = { title: 'Nova Requisição de Materiais | HuginFlow' }

export default async function NovaRequisicaoPage() {
  const me = await getMyProfile()
  const isSuperAdmin = me?.role_global === 'superadmin'

  const canCreate =
    isSuperAdmin ||
    hasPermission(me, 'estoque_requisicoes', 'create') ||
    hasPermission(me, 'estoque', 'edit')

  if (!canCreate) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in duration-700">
        <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mb-6 border border-red-500/20">
          <Lock className="w-10 h-10 text-red-500" />
        </div>
        <h2 className="text-3xl font-extrabold text-white mb-2 tracking-tight">Acesso Interditado</h2>
        <p className="text-gray-400 max-w-md mx-auto mb-8 text-lg">
          Seu grupo de acesso não possui permissão para abrir novas requisições de estoque.
        </p>
        <BackTextButton className="px-6 py-3 bg-[#ffffff05] hover:bg-[#ffffff10] border border-[#ffffff10] rounded-xl text-white font-semibold transition-all">
          Voltar ao Início
        </BackTextButton>
      </div>
    )
  }

  const empresaId = me?.empresa_id ?? ''
  const supabase = await createClient()

  // 1. Carrega Requisitantes — apenas Pessoas com papel funcionário
  let pessoasQuery = supabase
    .from('crm_leads')
    .select('id, nome, documento, papeis')
    .eq('ativo', true)
    .contains('papeis', ['funcionario'])
    .order('nome')
    .limit(500)

  if (!isSuperAdmin) {
    pessoasQuery = pessoasQuery.eq('empresa_id', empresaId)
  }
  const { data: pessoas } = await pessoasQuery

  // 2. Carrega SKUs que controlam estoque
  let skusQuery = supabase
    .from('cad_skus')
    .select('id, codigo, nome, unidade_estoque')
    .eq('ativo', true)
    .eq('controla_estoque', true)
    .order('codigo')

  if (!isSuperAdmin) {
    skusQuery = skusQuery.eq('empresa_id', empresaId)
  }
  const { data: skus } = await skusQuery

  // 3. Carrega Locais de Estoque (sem TERCEIROS — só operação própria)
  let locaisQuery = supabase
    .from('cad_locais_estoque')
    .select('id, codigo, nome')
    .eq('ativo', true)
    .eq('eh_terceiros', false)
    .order('eh_principal', { ascending: false })
    .order('codigo')

  if (!isSuperAdmin) {
    locaisQuery = locaisQuery.eq('empresa_id', empresaId)
  }
  const { data: locais } = await locaisQuery

  const { data: config } = await supabase
    .from('est_config')
    .select('req_aprovacao_ativa, req_aprovacao_valor_minimo')
    .eq('empresa_id', empresaId)
    .maybeSingle()

  return (
    <div className="space-y-6 pb-20 font-sans">
      <EstoqueAreaNav />

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-purple-400" />
          Nova Requisição de Materiais
        </h1>
        <p className="text-xs text-gray-400 mt-0.5">
          Abra uma solicitação de materiais para consumo ou operação. O atendimento respeitará a política de saldo da sua empresa.
        </p>
      </div>

      <RequisicaoForm
        pessoas={pessoas || []}
        skus={skus || []}
        locais={locais || []}
        aprovacaoAtiva={Boolean(config?.req_aprovacao_ativa)}
        valorMinimo={Number(config?.req_aprovacao_valor_minimo || 0)}
      />
    </div>
  )
}
