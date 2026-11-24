'use server'

import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
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
import { motivoRejeicaoIntegralPlanilha } from '@/lib/estoque/requisicao-planilha/rejeicao-integral'
import { planoEfetivacaoRequisicaoPlanilha } from '@/lib/estoque/requisicao-planilha/politica-importacao'
import {
  ADDON_ADAPTER_ATC,
  motivoBloqueioGrupo,
  type PlanilhaAdapterCodigo,
} from '@/lib/estoque/requisicao-planilha/types'

const LIST_PATH = '/cockpit/estoque/requisicoes'

function canCreateReq(me: Awaited<ReturnType<typeof getMyProfile>>) {
  if (!me) return false
  if (me.role_global === 'superadmin' || me.role_global === 'admin') return true
  return (
    hasPermission(me, 'estoque_requisicoes', 'create') ||
    hasPermission(me, 'estoque', 'edit')
  )
}

/** Cadastra o requisitante ausente da planilha como funcionário em Pessoas. */
export async function cadastrarRequisitantePlanilhaAction(input: {
  nome: string
  documento?: string | null
  codigo_externo?: string | null
}) {
  const me = await getMyProfile()
  if (!canCreateReq(me) || !me?.empresa_id) {
    return { error: 'Sem permissão para cadastrar o requisitante.' }
  }

  const nome = input.nome.trim()
  const documento = (input.documento || '').replace(/\D/g, '')
  const codigoExterno = (input.codigo_externo || '').trim()
  if (!nome) return { error: 'A planilha não trouxe o nome do requisitante.' }
  if (!documento && !codigoExterno) {
    return { error: 'Informe documento ou matrícula para cadastrar o requisitante.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('crm_leads')
    .insert([
      {
        empresa_id: me.empresa_id,
        nome,
        documento: documento || null,
        codigo_externo: codigoExterno || null,
        natureza: documento.length === 14 ? 'pj' : 'pf',
        papeis: ['funcionario'],
        ativo: true,
        status_relacionamento: 'ativo',
      },
    ])
    .select('id, nome')
    .single()

  if (error || !data) {
    return { error: error?.message || 'Falha ao cadastrar o funcionário.' }
  }

  revalidatePath('/cockpit/crm/leads')
  return { id: data.id as string, nome: data.nome as string }
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
    return {
      error: erros.join(' '),
      errosIdentificacao: erros,
      grupos: [],
      avisos: [],
      resumo: { totalLinhas: 0, gruposOk: 0, linhasComErro: 0 },
    }
  }

  const { grupos, errosGlobais } = await validarEAgruparCanonical(
    rows,
    me.empresa_id,
    supabase
  )

  const totalLinhas = rows.length
  const gruposOk = gruposParaCriacao(grupos).length
  const linhasComErro = grupos.reduce(
    (acc, g) => acc + (motivoBloqueioGrupo(g) ? g.itens.length : 0),
    0
  )

  return {
    grupos,
    errosIdentificacao: erros,
    avisos: errosGlobais,
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

  const plano = planoEfetivacaoRequisicaoPlanilha(
    adapter,
    estConfig,
    input.enviar_imediatamente
  )
  const autoAtender = plano.autoAtender

  if (adapter === 'cliente_atc_legado') {
    const addons = await getEmpresaAddons(me.empresa_id)
    if (addons[ADDON_ADAPTER_ATC] !== true) {
      return { error: 'A empresa não possui o adaptador Atlas habilitado.' }
    }
  }

  let clientPrivilegiado: ReturnType<typeof createAdminClient> | undefined
  if (plano.aprovada_na_origem) {
    try {
      clientPrivilegiado = createAdminClient()
    } catch {
      return { error: 'Servidor sem credencial para aprovar requisição de origem.' }
    }
  }

  const pessoasPorMatricula =
    adapter === 'cliente_atc_legado'
      ? await loadPessoasPorMatricula(me.empresa_id, supabase)
      : undefined

  const { rows, erros } = await planilhaToCanonical(input.csv_content, adapter, {
    empresaId: me.empresa_id,
    pessoasPorMatricula,
  })

  const rejeicaoIntegral = motivoRejeicaoIntegralPlanilha(adapter, erros)
  if (rejeicaoIntegral) {
    return { error: rejeicaoIntegral, errosIdentificacao: erros }
  }

  if (rows.length === 0) {
    return { error: erros.join(' ') || 'Nenhuma linha para importar.' }
  }

  // Revalida a planilha na efetivação. A pré-visualização não autoriza a gravação.
  const { grupos } = await validarEAgruparCanonical(rows, me.empresa_id, supabase)
  const paraCriar = gruposParaCriacao(grupos)
  const gruposBloqueados = grupos.length - paraCriar.length

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
        // Atlas: aprovada na origem, sem rascunho e sem baixa.
        // Hugin: auto-baixa cria rascunho e atende abaixo; senão, envio normal.
        enviar_imediatamente: plano.enviar_imediatamente,
        aprovada_na_origem: plano.aprovada_na_origem,
        itens: g.itens,
      },
      supabase,
      clientPrivilegiado
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

    if (plano.executarAtendimento) {
      const { data: liberada, error: errAprov } = await supabase.rpc(
        'est_transicionar_requisicao',
        {
          p_empresa_id: me.empresa_id,
          p_requisicao_id: reqId,
          p_intencao: 'liberar_para_baixa',
        }
      )

      if (errAprov || !liberada?.sucesso) {
        falhas.push(
          `${numero}: criada, mas falhou ao liberar para baixa (${liberada?.mensagem || errAprov?.message || 'erro'}).`
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
  if (gruposBloqueados > 0) {
    partes.push(`${gruposBloqueados} grupo(s) bloqueado(s) não importado(s)`)
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
