export function normalizeConversationalText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Cumprimentos e confirmações curtas nunca devem ser bloqueados pelo gate de escopo. */
export function isLikelyGreetingOrAck(message: string): boolean {
  if (/^[\s👋👍🙏😊🙂🙋]+$/u.test(message)) return true

  const normalized = normalizeConversationalText(message)
  if (!normalized || normalized.length > 80) return false

  if (
    /^(?:ok|okay|certo|beleza|blz|sim|nao|entendi|combinado|obrigado|obrigada|muito obrigado|muito obrigada|valeu|perfeito|show|joia)$/.test(
      normalized,
    )
  ) {
    return true
  }

  // Consome apenas segmentos de saudação. Se sobrar uma solicitação real,
  // ela segue para RAG/classificador em vez de ser tratada como mero cumprimento.
  let remaining = normalized
  const greetingSegments = [
    /^(?:oi+|oie+|ola+|opa|alo|hey|e ai|eai|fala|salve)\b/,
    /^(?:bom dia|boa tarde|boa noite)\b/,
    /^(?:(?:tudo|td) (?:bem|bom)(?: com (?:voce|voces|vc|vcs))?|como (?:vai|esta|voce esta|vc esta))\b/,
    /^(?:pessoal|gente|por favor)\b/,
  ]

  let consumed = false
  while (remaining) {
    const segment = greetingSegments.find((candidate) => candidate.test(remaining))
    if (!segment) return false
    remaining = remaining.replace(segment, '').trim()
    consumed = true
  }
  return consumed
}
