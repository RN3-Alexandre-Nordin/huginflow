import { Lock } from 'lucide-react'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import BackTextButton from '@/components/BackTextButton'
import { empresaHasAddon } from '@/lib/addons/entitlements'
import { hasPermission } from '@/utils/permissions'
import { createClient } from '@/utils/supabase/server'
import { abrirRascunhoSolicitacao } from '../../actions'
import SolicitacaoForm from './SolicitacaoForm'

export const metadata = { title: 'Nova solicitação | HuginFlow' }

function matchPessoaPadrao(
  pessoas: Array<{ id: string; nome: string; email?: string | null }>,
  me: { email?: string | null; nome_completo?: string | null },
) {
  const email = me.email?.trim().toLowerCase()
  if (email) {
    const byEmail = pessoas.find((p) => p.email?.trim().toLowerCase() === email)
    if (byEmail) return byEmail.id
  }
  const nome = me.nome_completo?.trim().toLowerCase()
  if (nome) {
    const byNome = pessoas.find((p) => p.nome.trim().toLowerCase() === nome)
    if (byNome) return byNome.id
  }
  return pessoas[0]?.id || ''
}

export default async function NovaSolicitacaoPage() {
  const me = await getMyProfile()
  const isSuper = me?.role_global === 'superadmin'
  const permitido =
    !!me &&
    (isSuper ||
      (!!me.empresa_id &&
        (await empresaHasAddon(me.empresa_id, 'compras')) &&
        hasPermission(me, 'compras_solicitacoes', 'create')))

  if (!permitido || !me?.empresa_id) {
    return (
      <div className="flex flex-col items-center py-20 text-center">
        <Lock className="mb-4 h-10 w-10 text-red-500" />
        <h2 className="text-2xl font-semibold text-white">Acesso interditado</h2>
        <BackTextButton className="mt-6 text-sm text-[#2BAADF]">Voltar</BackTextButton>
      </div>
    )
  }

  const draft = await abrirRascunhoSolicitacao()
  if (draft.error || !draft.id || !draft.numero) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-red-400">{draft.error || 'Não foi possível abrir a solicitação.'}</p>
        <BackTextButton className="text-sm text-[#2BAADF]">Voltar</BackTextButton>
      </div>
    )
  }

  const supabase = await createClient()
  const [{ data: pessoas }, { data: skus }, { data: servicos }] = await Promise.all([
    supabase
      .from('crm_leads')
      .select('id, nome, documento, email')
      .eq('empresa_id', me.empresa_id)
      .eq('ativo', true)
      .contains('papeis', ['funcionario'])
      .order('nome')
      .limit(500),
    supabase
      .from('cad_skus')
      .select('id, codigo, nome, unidade_compra, preco_custo')
      .eq('empresa_id', me.empresa_id)
      .eq('ativo', true)
      .order('codigo')
      .limit(2000),
    supabase
      .from('cad_servicos')
      .select('id, codigo, nome, unidade, preco_referencia')
      .eq('empresa_id', me.empresa_id)
      .eq('ativo', true)
      .order('codigo')
      .limit(2000),
  ])

  const defaultSolicitanteId = matchPessoaPadrao(pessoas || [], {
    email: me.email,
    nome_completo: (me as { nome_completo?: string | null }).nome_completo,
  })

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-white">Nova solicitação</h1>
        <p className="text-sm text-gray-500">
          Número <span className="font-mono text-[#2BAADF]">{draft.numero}</span> já reservado.
          Tipo Serviço usa o cadastro de serviços.
        </p>
      </div>
      <SolicitacaoForm
        solicitacaoId={draft.id}
        numero={draft.numero}
        pessoas={pessoas || []}
        skus={skus || []}
        servicos={servicos || []}
        defaultSolicitanteId={defaultSolicitanteId}
      />
    </div>
  )
}
