import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowDownLeft, Lock } from 'lucide-react'
import BackTextButton from '@/components/BackTextButton'
import EstoqueAreaNav from '@/components/estoque/EstoqueAreaNav'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { hasPermission } from '@/utils/permissions'
import { createClient } from '@/utils/supabase/server'
import RetornoForm from './RetornoForm'

export const metadata = { title: 'Retorno de Remessa | HuginFlow' }

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function EstoqueRemessaRetornoPage({ params }: PageProps) {
  const { id } = await params
  const me = await getMyProfile()
  const isSuperAdmin = me?.role_global === 'superadmin'

  const canEdit =
    isSuperAdmin ||
    hasPermission(me, 'estoque_remessas', 'edit') ||
    hasPermission(me, 'estoque', 'edit')

  if (!canEdit) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in duration-700">
        <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mb-6 border border-red-500/20">
          <Lock className="w-10 h-10 text-red-500" />
        </div>
        <h2 className="text-3xl font-extrabold text-white mb-2 tracking-tight">Acesso Interditado</h2>
        <p className="text-gray-400 max-w-md mx-auto mb-8 text-lg">
          Seu grupo de acesso não possui permissão para registrar retorno de remessas.
        </p>
        <BackTextButton className="px-6 py-3 bg-[#ffffff05] hover:bg-[#ffffff10] border border-[#ffffff10] rounded-xl text-white font-semibold transition-all">
          Voltar ao Início
        </BackTextButton>
      </div>
    )
  }

  const empresaId = me?.empresa_id ?? ''
  const supabase = await createClient()

  let remQuery = supabase
    .from('est_remessa_lotes')
    .select(
      `
      id,
      numero,
      status,
      motivo_codigo,
      motivo_texto,
      documento,
      local_origem_id,
      crm_leads (id, nome, documento)
    `
    )
    .eq('id', id)

  if (!isSuperAdmin) {
    remQuery = remQuery.eq('empresa_id', empresaId)
  }

  const { data: remessa, error } = await remQuery.maybeSingle()

  if (error || !remessa) {
    notFound()
  }

  if (remessa.status === 'fechada' || remessa.status === 'cancelada') {
    return (
      <div className="space-y-4 pb-20 font-sans">
        <EstoqueAreaNav />
        <div className="bg-[#121820] border border-[#ffffff0a] rounded-2xl p-10 text-center space-y-3">
          <h2 className="text-sm font-semibold text-white">
            Remessa {remessa.numero} está {remessa.status}
          </h2>
          <p className="text-xs text-gray-400">Esta remessa não aceita novos retornos.</p>
          <Link
            href={`/cockpit/estoque/remessas/${id}`}
            className="inline-flex text-xs text-purple-300 hover:text-white transition-colors"
          >
            ← Voltar ao detalhe
          </Link>
        </div>
      </div>
    )
  }

  const { data: itensRaw, error: itensError } = await supabase
    .from('est_remessa_itens')
    .select(
      `
      id,
      sku_id,
      local_origem_id,
      quantidade_enviada,
      quantidade_retornada,
      quantidade_baixada,
      status_item,
      cad_skus (id, codigo, nome, unidade_estoque),
      local_origem:cad_locais_estoque!est_remessa_itens_local_origem_id_fkey (id, codigo, nome)
    `
    )
    .eq('remessa_id', id)
    .order('created_at', { ascending: true })

  if (itensError) {
    console.error('[estoque/remessas/retorno] falha ao carregar itens:', itensError.message)
  }

  const itens = (itensRaw || [])
    .map((it) => {
      const emPoder =
        Number(it.quantidade_enviada) -
        Number(it.quantidade_retornada || 0) -
        Number(it.quantidade_baixada || 0)
      const sku = it.cad_skus as {
        codigo?: string
        nome?: string
        unidade_estoque?: string
      } | null
      const localOrigem = it.local_origem as {
        id?: string
        codigo?: string
        nome?: string
      } | null

      return {
        id: it.id as string,
        sku_id: it.sku_id as string,
        local_origem_id: (it.local_origem_id as string) || null,
        quantidade_enviada: Number(it.quantidade_enviada),
        quantidade_retornada: Number(it.quantidade_retornada || 0),
        quantidade_baixada: Number(it.quantidade_baixada || 0),
        quantidade_em_poder: emPoder,
        cad_skus: sku
          ? {
              codigo: sku.codigo || '',
              nome: sku.nome || '',
              unidade_estoque: sku.unidade_estoque || 'UN',
            }
          : null,
        local_origem:
          localOrigem?.id && localOrigem.codigo
            ? {
                id: localOrigem.id,
                codigo: localOrigem.codigo,
                nome: localOrigem.nome || '',
              }
            : null,
      }
    })
    .filter((it) => it.quantidade_em_poder > 1e-9)

  let skusQuery = supabase
    .from('cad_skus')
    .select('id, codigo, nome, unidade_estoque')
    .eq('ativo', true)
    .eq('controla_estoque', true)
    .order('codigo')
  if (!isSuperAdmin) skusQuery = skusQuery.eq('empresa_id', empresaId)
  const { data: skus } = await skusQuery.limit(2000)

  const { data: locais } = await supabase
    .from('cad_locais_estoque')
    .select('id, codigo, nome, eh_principal')
    .eq('empresa_id', empresaId)
    .eq('ativo', true)
    .order('eh_principal', { ascending: false })
    .order('codigo')

  const defaultLocal =
    locais?.find((l) => l.id === remessa.local_origem_id) ||
    locais?.find((l) => l.eh_principal || l.codigo === 'BRANCO') ||
    locais?.[0]

  const terceiro = remessa.crm_leads as {
    nome?: string
    documento?: string | null
  } | null

  return (
    <div className="space-y-4 pb-20 font-sans">
      <EstoqueAreaNav />

      <div>
        <div className="flex items-center gap-2 mb-1 text-xs">
          <Link
            href="/cockpit/estoque/remessas"
            className="text-gray-400 hover:text-white transition-colors"
          >
            Remessas
          </Link>
          <span className="text-gray-600">/</span>
          <Link
            href={`/cockpit/estoque/remessas/${id}`}
            className="text-gray-400 hover:text-white transition-colors font-mono"
          >
            {remessa.numero}
          </Link>
          <span className="text-gray-600">/</span>
          <span className="text-emerald-400">Retorno</span>
        </div>
        <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
          <ArrowDownLeft className="h-5 w-5 text-emerald-400" />
          Retorno — {remessa.numero}
        </h1>
        <p className="text-xs text-gray-400 mt-0.5">
          Devolve material ao estoque e/ou baixa definitivamente o que não retorna.
        </p>
      </div>

      <RetornoForm
        remessa={{
          id: remessa.id,
          numero: remessa.numero,
          status: remessa.status,
          motivo_codigo: remessa.motivo_codigo,
          motivo_texto: remessa.motivo_texto,
          documento: remessa.documento,
          destinatario_nome: terceiro?.nome || '—',
          destinatario_doc: terceiro?.documento || null,
        }}
        itens={itens}
        locais={locais || []}
        skus={skus || []}
        defaultLocalId={defaultLocal?.id || ''}
      />
    </div>
  )
}
