import { createClient } from '@/utils/supabase/server'
import { Lock, Settings2 } from 'lucide-react'
import BackTextButton from '@/components/BackTextButton'
import EstoqueAreaNav from '@/components/estoque/EstoqueAreaNav'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { hasPermission } from '@/utils/permissions'
import { empresaHasAddon } from '@/lib/addons/entitlements'
import ConfigForm from './ConfigForm'

export const metadata = { title: 'Configuração de Estoque | HuginFlow' }

export default async function EstoqueConfigPage() {
  const me = await getMyProfile()
  const isSuperAdmin = me?.role_global === 'superadmin'

  const canView =
    isSuperAdmin ||
    hasPermission(me, 'estoque_config', 'view') ||
    hasPermission(me, 'estoque', 'view')

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in duration-700">
        <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mb-6 border border-red-500/20">
          <Lock className="w-10 h-10 text-red-500" />
        </div>
        <h2 className="text-3xl font-extrabold text-white mb-2 tracking-tight">Acesso Interditado</h2>
        <p className="text-gray-400 max-w-md mx-auto mb-8 text-lg">
          Seu grupo de acesso não possui permissão para visualizar as configurações do módulo de estoque.
        </p>
        <BackTextButton className="px-6 py-3 bg-[#ffffff05] hover:bg-[#ffffff10] border border-[#ffffff10] rounded-xl text-white font-semibold transition-all">
          Voltar ao Início
        </BackTextButton>
      </div>
    )
  }

  const canManage =
    isSuperAdmin ||
    hasPermission(me, 'estoque_config', 'edit') ||
    hasPermission(me, 'estoque_config', 'create') ||
    hasPermission(me, 'estoque', 'edit')

  const empresaId = me?.empresa_id ?? ''
  const supabase = await createClient()

  // 1. Verificar se o módulo de workflow está ativo para esta empresa
  const hasWorkflowAddon = empresaId
    ? await empresaHasAddon(empresaId, 'workflow', supabase)
    : false

  // 2. Carregar configuração atual
  const { data: config } = await supabase
    .from('est_config')
    .select('*')
    .eq('empresa_id', empresaId)
    .maybeSingle()

  // 3. Carregar locais da empresa
  let locaisQuery = supabase
    .from('cad_locais_estoque')
    .select('id, codigo, nome, eh_principal')
    .eq('ativo', true)
    .order('eh_principal', { ascending: false })
    .order('codigo')

  if (!isSuperAdmin) {
    locaisQuery = locaisQuery.eq('empresa_id', empresaId)
  }
  const { data: locais } = await locaisQuery

  // 4. Carregar funis de workflow da empresa somente se o addon estiver ativo
  let pipelines: { id: string; nome: string }[] = []
  let stages: { id: string; pipeline_id: string; nome: string; ordem: number }[] = []

  if (hasWorkflowAddon) {
    let pipelinesQuery = supabase
      .from('pipelines')
      .select('id, nome')
      .or('ativo.is.null,ativo.eq.true')
      .order('nome')

    if (!isSuperAdmin) {
      pipelinesQuery = pipelinesQuery.eq('empresa_id', empresaId)
    }
    const { data: pData } = await pipelinesQuery
    pipelines = pData || []

    let stagesQuery = supabase
      .from('pipeline_stages')
      .select('id, pipeline_id, nome, ordem')
      .order('ordem')

    const { data: sData } = await stagesQuery
    stages = sData || []
  }

  // 5. Usuários ativos da empresa (aprovador)
  let usuariosQuery = supabase
    .from('usuarios')
    .select('id, nome_completo, email')
    .eq('ativo', true)
    .order('nome_completo')
    .limit(300)

  if (!isSuperAdmin) {
    usuariosQuery = usuariosQuery.eq('empresa_id', empresaId)
  } else if (empresaId) {
    usuariosQuery = usuariosQuery.eq('empresa_id', empresaId)
  }
  const { data: usuarios } = await usuariosQuery

  return (
    <div className="space-y-6 pb-20 font-sans">
      <EstoqueAreaNav />

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
          <Settings2 className="h-5 w-5 text-[#2BAADF]" />
          Configurações do Módulo de Estoque
        </h1>
        <p className="text-xs text-gray-400 mt-0.5">
          Parâmetros operacionais para importação de notas fiscais, atendimento de requisições e integração com workflows.
        </p>
      </div>

      <ConfigForm
        config={config}
        locais={locais || []}
        pipelines={pipelines}
        stages={stages}
        usuarios={usuarios || []}
        hasWorkflowAddon={hasWorkflowAddon}
        canManage={canManage}
      />
    </div>
  )
}
