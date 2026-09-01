/** Feature flag: sessões por departamento + falante ativo. */
export function isDeptSessionsEnabled(): boolean {
  const v = process.env.HUGINFLOW_DEPT_SESSIONS?.trim().toLowerCase()
  // Default ON (demo/negócio); desligar com disabled|false|0
  return v !== 'disabled' && v !== 'false' && v !== '0'
}

export const ACTIVE_SPEAKER_TIMEOUT_MINUTES = Number(
  process.env.HUGINFLOW_ACTIVE_SPEAKER_TIMEOUT_MIN ?? 120,
)
