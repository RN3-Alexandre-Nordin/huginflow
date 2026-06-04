/** IA ligada por padrão; só desliga se `ia_config.ativo === false` explicitamente. */
export function isChannelAiEnabled(
  iaConfig?: { ativo?: boolean } | null,
): boolean {
  return iaConfig?.ativo !== false
}

export const DEFAULT_IA_CONFIG = {
  ativo: true,
  timeout: 0,
  prompt_base: '',
}
