/**
 * Aprovação interna de requisições de materiais.
 * Gate alinhado a est_transicionar_requisicao: aprovador configurado,
 * admin do tenant, administrador do grupo da mesma empresa ou superadmin.
 */

export type EstConfigAprovacao = {
  req_aprovacao_ativa?: boolean | null
  req_aprovador_usuario_id?: string | null
  req_aprovacao_valor_minimo?: number | string | null
}

export type GrupoAcessoLike = {
  is_admin?: boolean | null
  empresa_id?: string | null
}

export type ProfileLike = {
  id?: string | null
  empresa_id?: string | null
  role_global?: string | null
  grupos_acesso?: GrupoAcessoLike | GrupoAcessoLike[] | null
}

/** Grupo administrador somente quando grupos_acesso.empresa_id é a empresa do usuário. */
export function grupoAdminDaEmpresa(me: ProfileLike | null | undefined): boolean {
  const empresaId = me?.empresa_id
  if (!empresaId) return false
  const raw = me.grupos_acesso
  const grupos = Array.isArray(raw) ? raw : raw ? [raw] : []
  return grupos.some((g) => g?.is_admin === true && g.empresa_id === empresaId)
}

export function podeAprovarRequisicao(
  me: ProfileLike | null | undefined,
  config: EstConfigAprovacao | null | undefined,
): boolean {
  if (!me?.id) return false
  if (me.role_global === 'superadmin') return true
  if (me.role_global === 'admin') return true
  if (grupoAdminDaEmpresa(me)) return true
  const aprovadorId = config?.req_aprovador_usuario_id
  if (aprovadorId && aprovadorId === me.id) return true
  return false
}

/** Valor estimado = Σ qtd × preco_custo (preço de compra). */
export function calcularValorEstimadoRequisicao(
  itens: Array<{ sku_id: string; quantidade_pedida: number }>,
  precosPorSku: Map<string, number>,
): number {
  let total = 0
  for (const it of itens) {
    const custo = precosPorSku.get(it.sku_id) ?? 0
    total += Number(it.quantidade_pedida || 0) * custo
  }
  return Math.round(total * 100) / 100
}

/**
 * Decide status ao enviar:
 * - flag off → aprovada (auto)
 * - flag on + valor_minimo > 0 e valor < mínimo → aprovada (auto)
 * - flag on caso contrário → pendente_aprovacao
 */
export function statusAoEnviarRequisicao(
  config: EstConfigAprovacao | null | undefined,
  valorEstimado: number,
): 'pendente_aprovacao' | 'aprovada' {
  const ativa = Boolean(config?.req_aprovacao_ativa)
  if (!ativa) return 'aprovada'

  const minimo = Number(config?.req_aprovacao_valor_minimo ?? 0)
  if (minimo > 0 && valorEstimado < minimo) return 'aprovada'

  return 'pendente_aprovacao'
}

export function mensagemStatusEnvio(
  status: 'rascunho' | 'pendente_aprovacao' | 'aprovada',
  numero: string,
  opts?: { autoPorValorMinimo?: boolean; aprovacaoDesligada?: boolean },
): string {
  if (status === 'rascunho') {
    return `Requisição ${numero} salva como rascunho.`
  }
  if (status === 'pendente_aprovacao') {
    return `Requisição ${numero} enviada e aguardando aprovação.`
  }
  if (opts?.aprovacaoDesligada) {
    return `Requisição ${numero} criada e liberada (aprovação desligada na empresa).`
  }
  if (opts?.autoPorValorMinimo) {
    return `Requisição ${numero} liberada automaticamente (abaixo do valor mínimo de aprovação).`
  }
  return `Requisição ${numero} criada e aprovada.`
}
