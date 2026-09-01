/** Rótulos exibidos no cockpit (OmniChat). */
export const WHATSAPP_SENDER_LABELS = {
  ai: 'Agente de IA',
  system: 'Sistema',
  attendantFallback: 'Atendente',
} as const

/** Evita quebrar negrito WhatsApp (*texto*). */
function sanitizeWhatsAppLabel(label: string): string {
  return label.replace(/\*/g, '').trim()
}

/**
 * Texto humano para o WhatsApp — uma única bolha: *Nome:* + mensagem.
 * A IA não usa esta função (mensagem sem identificação).
 */
export function formatAttendantWhatsAppText(attendantName: string, body: string): string {
  const name = sanitizeWhatsAppLabel(attendantName)
  const text = body.trim()
  if (!name) return text
  if (!text) return `*${name}*`
  return `*${name}:*\n${text}`
}

/**
 * Legenda de mídia enviada por atendente — *Nome:* + legenda na mesma bolha.
 */
export function formatAttendantWhatsAppCaption(attendantName: string, caption?: string): string {
  const name = sanitizeWhatsAppLabel(attendantName)
  const cap = caption?.trim() ?? ''
  if (!name) return cap
  if (!cap) return `*${name}*`
  return `*${name}:*\n${cap}`
}

/** @deprecated Use formatAttendantWhatsAppText */
export function formatAttendantSignatureHeader(senderLabel: string): string {
  return sanitizeWhatsAppLabel(senderLabel)
}

/** @deprecated Use formatAttendantWhatsAppText */
export function formatWhatsAppSignatureHeader(senderLabel: string): string {
  return formatAttendantSignatureHeader(senderLabel)
}
