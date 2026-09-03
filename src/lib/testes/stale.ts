/** Runs em `running`/`queued` há mais que isso são considerados travados. */
export const STALE_RUN_MS = 25 * 60 * 1000

export function isRunStale(startedAt: string | null | undefined, status: string) {
  if (!startedAt) return false
  if (status !== 'running' && status !== 'queued') return false
  return Date.now() - new Date(startedAt).getTime() > STALE_RUN_MS
}

export function staleRunMessage() {
  return 'Execução interrompida (processo encerrado ou timeout). Marque como concluída manualmente ou rode de novo.'
}
