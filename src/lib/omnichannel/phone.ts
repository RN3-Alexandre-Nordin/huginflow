/** Normaliza telefone BR para chave única (lead, conversa, Evolution). */
export function normalizeWhatsAppPhone(phone: string): string {
  let digits = phone.replace(/\D/g, '')
  if (digits.startsWith('55') && digits.length === 12) {
    digits = `${digits.slice(0, 4)}9${digits.slice(4)}`
  }
  return digits
}
