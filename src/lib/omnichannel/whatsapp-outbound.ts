/** Rótulos alinhados ao chat omnichannel (getResponderLabel). */
export const WHATSAPP_SENDER_LABELS = {
  ai: 'Agente de IA',
  system: 'Sistema',
  attendantFallback: 'Atendente',
} as const

/** Bolha curta só com o nome — evita conflito com *negrito* no texto longo da IA. */
export function formatWhatsAppSignatureHeader(senderLabel: string): string {
  const label = senderLabel.trim()
  if (!label) return ''
  return `🤖 ${label}`
}
