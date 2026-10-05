import { Lock, ShieldCheck } from 'lucide-react'
import BackTextButton from '@/components/BackTextButton'
import EstoqueAreaNav from '@/components/estoque/EstoqueAreaNav'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { createClient } from '@/utils/supabase/server'
import { podeAprovarRequisicao } from '@/lib/estoque/aprovacao-requisicao'
import { estoqueRange, parseEstoquePage } from '@/lib/estoque/listagem'
import EstoquePagination from '@/components/estoque/EstoquePagination'
import AprovacaoList, { type PendenteRow } from './AprovacaoList'

export const metadata = { title: 'Aprovação de Requisições | HuginFlow' }

interface PageProps {
  searchParams: Promise<{ page?: string }>
}

export default async function AprovacaoRequisicoesPage({ searchParams }: PageProps) {
  const me = await getMyProfile()
  const empresaId = me?.empresa_id ?? ''
  const supabase = await createClient()

  const { data: config } = empresaId
    ? await supabase
        .from('est_config')
        .select('req_aprovacao_ativa, req_aprovador_usuario_id, req_aprovacao_valor_minimo')
        .eq('empresa_id', empresaId)
        .maybeSingle()
    : { data: null }

  if (!podeAprovarRequisicao(me, config)) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in duration-700">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-red-500/20 bg-red-500/10">
          <Lock className="h-10 w-10 text-red-500" />
        </div>
        <h2 className="mb-2 text-3xl font-extrabold tracking-tight text-white">Acesso Interditado</h2>
        <p className="mx-auto mb-8 max-w-md text-lg text-gray-400">
          Apenas o aprovador configurado em Estoque → Configuração, o admin da empresa ou superadmin
          podem acessar esta fila.
        </p>
        <BackTextButton className="rounded-xl border border-[#ffffff10] bg-[#ffffff05] px-6 py-3 font-semibold text-white transition-all hover:bg-[#ffffff10]">
          Voltar ao Início
        </BackTextButton>
      </div>
    )
  }

  const { page: pageParam } = await searchParams
  const { page, from, to, pageSize } = estoqueRange(parseEstoquePage(pageParam))

  let query = supabase
    .from('est_requisicoes')
    .select(
      `
      id,
      numero,
      observacao,
      valor_estimado,
      created_at,
      crm_leads!est_requisicoes_requisitante_pessoa_id_fkey (nome),
      usuarios!est_requisicoes_solicitante_usuario_id_fkey (nome_completo)
    `,
      { count: 'exact' },
    )
    .eq('status', 'pendente_aprovacao')
    .order('created_at', { ascending: true })
    .range(from, to)

  if (me?.role_global !== 'superadmin') {
    query = query.eq('empresa_id', empresaId)
  } else if (empresaId) {
    query = query.eq('empresa_id', empresaId)
  }

  const { data, count, error } = await query

  const itens: PendenteRow[] = (data || []).map((row) => {
    const lead = row.crm_leads as { nome?: string } | null
    const user = row.usuarios as { nome_completo?: string } | null
    return {
      id: row.id,
      numero: row.numero,
      observacao: row.observacao,
      valor_estimado: Number(row.valor_estimado || 0),
      created_at: row.created_at,
      requisitante_nome: lead?.nome || '—',
      solicitante_nome: user?.nome_completo || null,
    }
  })

  return (
    <div className="space-y-6 pb-20 font-sans">
      <EstoqueAreaNav />

      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-white">
          <ShieldCheck className="h-5 w-5 text-emerald-400" />
          Aprovação de Requisições
        </h1>
        <p className="mt-0.5 text-xs text-gray-400">
          Fila de requisições aguardando liberação. A decisão fica registrada (quem e quando) na
          consulta.
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-300">
          Erro ao carregar fila: {error.message}
        </div>
      ) : (
        <>
          <AprovacaoList itens={itens} />
          <EstoquePagination
            page={page}
            pageSize={pageSize}
            total={count ?? itens.length}
            baseQuery=""
          />
        </>
      )}
    </div>
  )
}
