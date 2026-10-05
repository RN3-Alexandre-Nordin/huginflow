/**
 * Interpreta retorno da RPC `est_registrar_movimento_atomico` (Regra de Ouro).
 * A função Postgres devolve `success` (EN); callers legados checavam `sucesso`.
 *
 * Integridade UI↔DB: se a RPC commitou e devolveu `movimento_id`, tratamos como
 * sucesso mesmo com flag ausente/estranha — evita "deu erro mas moveu estoque".
 */

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function coerceOkFlag(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1'
}

export function parseMovimentoAtomicoResult(
  rpcRes: unknown,
  rpcErr: { message?: string } | null | undefined,
): { ok: boolean; movimentoId?: string; mensagem?: string } {
  // Erro PostgREST/Postgres = a função abortou → nada commitou (atomicidade OK).
  if (rpcErr) {
    return { ok: false, mensagem: rpcErr.message || 'Falha na RPC de movimento.' }
  }

  // Alguns clientes embrulham jsonb em array de 1 elemento
  const raw = Array.isArray(rpcRes) ? rpcRes[0] : rpcRes
  const res = asRecord(raw)
  if (!res) {
    return { ok: false, mensagem: 'RPC de movimento sem retorno.' }
  }

  const movimentoIdRaw = res.movimento_id ?? res.movimentoId
  const movimentoId =
    typeof movimentoIdRaw === 'string' && movimentoIdRaw.length > 0
      ? movimentoIdRaw
      : undefined

  const flagOk = coerceOkFlag(res.success) || coerceOkFlag(res.sucesso)

  // Movimento gravado = commit efetivo (fonte de verdade)
  if (movimentoId) {
    return { ok: true, movimentoId }
  }

  if (!flagOk) {
    const msg =
      (typeof res.mensagem === 'string' && res.mensagem) ||
      (typeof res.message === 'string' && res.message) ||
      'Falha na efetivação atômica do Cardex/Saldo.'
    return { ok: false, mensagem: msg }
  }

  return { ok: true, movimentoId }
}
