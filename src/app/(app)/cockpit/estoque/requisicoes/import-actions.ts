'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { hasPermission } from '@/utils/permissions'
import { getEmpresaAddons } from '@/lib/addons/entitlements'
import {
  atenderRequisicao,
  criarRequisicao,
} from '@/lib/estoque/processar-requisicao'
import {
  gruposParaCriacao,
  loadPessoasPorMatricula,
  planilhaToCanonical,
  validarEAgruparCanonical,
} from '@/lib/estoque/requisicao-planilha/importar'
import {
  adaptersDisponiveis,
  isAdapterCodigo,
} from '@/lib/estoque/requisicao-planilha/adapters/registry'
import type { PlanilhaAdapterCodigo } from '@/lib/estoque/requisicao-planilha/types'

const LIST_PATH = '/cockpit/estoque/requisicoes'

function canCreateReq(me: Awaited<ReturnType<typeof getMyProfile>>) {
  if (!me) return false
  if (me.role_global === 'superadmin' || me.role_global === 'admin') return true
  return (
    hasPermission(me, 'estoque_requisicoes', 'create') ||
    hasPermission(me, 'estoque', 'edit')
  )
}

export async function listAdaptersRequisicaoAction() {
  const me = await getMyProfile()
  if (!me?.empresa_id) return { error: 'Usuário não autenticado.' }
  const addons = await getEmpresaAddons(me.empresa_id)
  const adapters = adaptersDisponiveis(addons, me.role_global === 'superadmin')
  return { adapters }
}

export async function previewRequisicaoPlanilhaAction(input: {
  csv_content: string
  adapter: string
}) {
  const me = await getMyProfile()
  if (!canCreateReq(me) || !me?.empresa_id) {
    return { error: 'Sem permissão para importar requisições.' }
  }
  if (!isAdapterCodigo(input.adapter)) {
    return { error: 'Formato de planilha inválido.' }
  }

  const adapter = input.adapter as PlanilhaAdapterCodigo
  const supabase = await createClient()

  const pessoasPorMatricula =
    adapter === 'cliente_atc_legado'
      ? await loadPessoasPorMatricula(me.empresa_id, supabase)
      : undefined

  const { rows, erros } = await planilhaToCanonical(input.csv_content, adapter, {
    empresaId: me.empresa_id,
    pessoasPorMatricula,
  })

  if (erros.length && rows.length === 0) {
    return { error: erros.join(' ') }
  }

  const { grupos, errosGlobais } = await validarEAgruparCanonical(
    rows,
    me.empresa_id,
    supabase
  )

  const totalLinhas = rows.length
  const gruposOk = gruposParaCriacao(grupos).length
  const linhasComErro = grupos.reduce(
    (acc, g) =>
      acc +
      (g.erro_cabecalho ? g.itens.length : g.itens.filter((i) => i.erro).length),
    0
  )

  return {
    grupos,
    avisos: [...erros, ...errosGlobais],
    resumo: { totalLinhas, gruposOk, linhasComErro },
  }
}

export async function efetivarRequisicaoPlanilhaAction(input: {
  csv_content: string
  adapter: string
  enviar_imediatamente?: boolean
}) {
  const me = await getMyProfile()
  if (!canCreateReq(me) || !me?.empresa_id) {
    return { error: 'Sem permissão para importar requisições.' }
  }
  if (!isAdapterCodigo(input.adapter)) {
    return { error: 'Formato de planilha inválido.' }
  }

  const adapter = input.adapter as PlanilhaAdapterCodigo
  const supabase = await createClient()

  const { data: estConfig } = await supabase
    .from('est_config')
    .select('req_planilha_auto_atender')
    .eq('empresa_id', me.empresa_id)
    .maybeSingle()

  const autoAtender = Boolean(estConfig?.req_planilha_auto_atender)

  const pessoasPorMatricula =
    adapter === 'cliente_atc_legado'
      ? await loadPessoasPorMatricula(me.empresa_id, supabase)
      : undefined

  const { rows, erros } = await planilhaToCanonical(input.csv_content, adapter, {
    empresaId: me.empresa_id,
    pessoasPorMatricula,
  })

  if (rows.length === 0) {
    return { error: erros.join(' ') || 'Nenhuma linha para importar.' }
  }

  const { grupos } = await validarEAgruparCanonical(rows, me.empresa_id, supabase)
  const paraCriar = gruposParaCriacao(grupos)

  if (paraCriar.length === 0) {
    return {
      error:
        'Nenhuma requisição válida para criar. Corrija requisitantes/SKUs e tente novamente.',
    }
  }

  const criadas: Array<{
    id: string
    numero: string
    status?: string
    atendimento?: string
  }> = []
  const falhas: string[] = []
  const avisosAtendimento: string[] = []

  for (const g of paraCriar) {
    const res = await criarRequisicao(
      {
        empresa_id: me.empresa_id,
        requisitante_pessoa_id: g.requisitante_pessoa_id,
        solicitante_usuario_id: me.id,
        observacao: g.observacao,
        origem: 'planilha',
        codigo_origem: g.codigo_origem,
        sistema_origem: g.sistema_origem,
        requisitante_nome_origem: g.requisitante_nome_origem,
        // Auto-baixa: cria rascunho e força aprovada (bypassa fila). Senão: envio normal.
        enviar_imediatamente: autoAtender
          ? false
          : Boolean(input.enviar_imediatamente),
        itens: g.itens,
      },
      supabase
    )
    if (!res.sucesso) {
      falhas.push(res.mensagem || 'Falha ao criar requisição')
      continue
    }
    if (!res.requisicaoId || !res.numero) continue

    const reqId = res.requisicaoId as string
    const numero = res.numero as string
    let statusFinal = (res.status as string) || 'rascunho'
    let atendimentoMsg: string | undefined

    if (autoAtender) {
      const agora = new Date().toISOString()
      const { error: errAprov } = await supabase
        .from('est_requisicoes')
        .update({ status: 'aprovada', updated_at: agora })
        .eq('empresa_id', me.empresa_id)
        .eq('id', reqId)

      if (errAprov) {
        falhas.push(
          `${numero}: criada, mas falhou ao liberar para baixa (${errAprov.message}).`
        )
        criadas.push({ id: reqId, numero, status: statusFinal })
        continue
      }

      const atend = await atenderRequisicao(
        {
          empresa_id: me.empresa_id,
          requisicao_id: reqId,
          usuario_id: me.id,
          modo_saldo: 'atende_parcial_pendente',
        },
        supabase
      )

      if (atend.sucesso) {
        statusFinal = (atend.novoStatus as string) || 'atendida_parcial'
        atendimentoMsg = atend.mensagem as string
      } else {
        statusFinal = 'aprovada'
        atendimentoMsg =
          atend.mensagem ||
          'Sem saldo para baixar agora — requisição aprovada com pendência.'
        avisosAtendimento.push(`${numero}: ${atendimentoMsg}`)
      }
    }

    criadas.push({
      id: reqId,
      numero,
      status: statusFinal,
      atendimento: atendimentoMsg,
    })
  }

  revalidatePath(LIST_PATH)
  revalidatePath('/cockpit/estoque')
  revalidatePath('/cockpit/estoque/requisicoes/aprovacao')
  revalidatePath('/cockpit/estoque/cardex')
  revalidatePath('/cockpit/estoque/saldos')

  if (criadas.length === 0) {
    return { error: falhas.join(' ') || 'Nenhuma requisição criada.' }
  }

  const partes: string[] = [
    `${criadas.length} requisição(ões) criada(s)`,
  ]
  if (autoAtender) {
    const totais = criadas.filter((c) => c.status === 'atendida_total').length
    const parciais = criadas.filter((c) => c.status === 'atendida_parcial').length
    const abertas = criadas.filter((c) => c.status === 'aprovada').length
    if (totais) partes.push(`${totais} atendida(s) total`)
    if (parciais) partes.push(`${parciais} parcialmente atendida(s)`)
    if (abertas) partes.push(`${abertas} aprovada(s) aguardando saldo`)
  }
  if (falhas.length) partes.push(`${falhas.length} falha(s)`)

  return {
    criadas,
    falhas,
    avisosAtendimento,
    autoAtender,
    mensagem: `${partes.join('; ')}.`,
  }
}
