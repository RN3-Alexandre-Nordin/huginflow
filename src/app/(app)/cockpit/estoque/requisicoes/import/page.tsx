import { FileSpreadsheet, Lock } from 'lucide-react'
import BackTextButton from '@/components/BackTextButton'
import EstoqueAreaNav from '@/components/estoque/EstoqueAreaNav'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { hasPermission } from '@/utils/permissions'
import { getEmpresaAddons } from '@/lib/addons/entitlements'
import { adaptersDisponiveis } from '@/lib/estoque/requisicao-planilha/adapters/registry'
import { createClient } from '@/utils/supabase/server'
import ImportRequisicaoPlanilhaForm from './ImportRequisicaoPlanilhaForm'

export const metadata = { title: 'Importar Requisições | HuginFlow' }

export default async function ImportarRequisicaoPlanilhaPage() {
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
        <h2 className="text-3xl font-extrabold text-white mb-2 tracking-tight">
          Acesso Interditado
        </h2>
        <p className="text-gray-400 max-w-md mx-auto mb-8 text-lg">
          Seu grupo não possui permissão para importar requisições por planilha.
        </p>
        <BackTextButton className="px-6 py-3 bg-[#ffffff05] hover:bg-[#ffffff10] border border-[#ffffff10] rounded-xl text-white font-semibold transition-all">
          Voltar ao Início
        </BackTextButton>
      </div>
    )
  }

  const empresaId = me?.empresa_id ?? ''
  const addons = empresaId ? await getEmpresaAddons(empresaId) : {}
  const adapters = adaptersDisponiveis(addons, isSuperAdmin)

  let planilhaAutoAtender = false
  if (empresaId) {
    const supabase = await createClient()
    const { data: cfg } = await supabase
      .from('est_config')
      .select('req_planilha_auto_atender')
      .eq('empresa_id', empresaId)
      .maybeSingle()
    planilhaAutoAtender = Boolean(cfg?.req_planilha_auto_atender)
  }

  return (
    <div className="space-y-6 pb-20 font-sans">
      <EstoqueAreaNav />

      <div>
        <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-purple-400" />
          Importar requisições por planilha
        </h1>
        <p className="text-xs text-gray-400 mt-0.5">
          Formato padrão Hugin Flow. Adaptadores de cliente (legado) liberados por addon
          cobrável.
        </p>
      </div>

      <ImportRequisicaoPlanilhaForm
        adapters={adapters}
        planilhaAutoAtender={planilhaAutoAtender}
      />
    </div>
  )
}
