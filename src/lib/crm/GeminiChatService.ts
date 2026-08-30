import type { SupabaseClient } from '@supabase/supabase-js'
import {
  generateEmbedding,
  generateText,
  getAiConfigErrorMessage,
  resolveEmpresaAiConfig,
} from '@/lib/ai/empresa-ai'
import { PLATFORM_TRIAGE_INSTRUCTIONS } from '@/lib/omnichannel/triage/platformInstructions'
import {
  parseAiTags,
  stripOutboundTags,
  type ParsedAiTags,
} from '@/lib/omnichannel/triage/parseTriageTags'
import { buildSystemFacts, type SystemFacts } from '@/lib/omnichannel/triage/systemFacts'

export type GeminiChatInput = {
  empresaId: string
  leadId: string
  conversaId?: string
  contactPhone: string
  contactName: string
  message: string
}

export type GeminiChatResult =
  | {
      success: true
      response: string
      responseForWhatsApp: string
      crmStatus?: string
      tags: ParsedAiTags
      facts: SystemFacts
    }
  | { success: false; error: string }

export { stripOutboundTags, parseCrmStatus } from '@/lib/omnichannel/triage/parseTriageTags'

/**
 * RAG (match_knowledge_base) + fatos do sistema + OpenAI conforme modelo da empresa.
 */
export class GeminiChatService {
  static async generateReply(
    supabase: SupabaseClient,
    input: GeminiChatInput,
  ): Promise<GeminiChatResult> {
    const { empresaId, leadId, conversaId, contactPhone, contactName, message } = input

    const { data: empresa, error: empresaError } = await supabase
      .from('empresas')
      .select('ai_context_prompt, ai_model')
      .eq('id', empresaId)
      .single()

    if (empresaError || !empresa) {
      return { success: false, error: 'Empresa não encontrada para carregar IA.' }
    }

    const aiConfig = resolveEmpresaAiConfig(empresa)
    if (!aiConfig) {
      return { success: false, error: getAiConfigErrorMessage() }
    }

    const facts = await buildSystemFacts(supabase, empresaId, leadId)

    let historyQuery = supabase
      .from('crm_interacoes')
      .select('role, content')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: true })
      .limit(20)

    if (conversaId) {
      historyQuery = historyQuery.eq('conversa_id', conversaId)
    }

    const { data: history } = await historyQuery

    let extraContext = 'Nenhuma informação específica encontrada na base de conhecimento.'
    try {
      const userEmbedding = await generateEmbedding(message, aiConfig)
      const { data: kbContext, error: rpcError } = await supabase.rpc('match_knowledge_base', {
        query_embedding: userEmbedding,
        match_threshold: 0.4,
        match_count: 5,
        org_id: empresaId,
      })

      if (!rpcError && kbContext?.length) {
        extraContext = kbContext
          .map((c: { category?: string; content: string }) => `[${c.category || 'Geral'}]: ${c.content}`)
          .join('\n')
      }
    } catch (ragErr) {
      console.error('[EmpresaChat] Erro na busca semântica:', ragErr)
    }

    const systemPersonality = (
      empresa.ai_context_prompt || 'Você é o agente de triagem de atendimentos via WhatsApp.'
    )
      .replace(/%22/g, '"')
      .trim()

    const formattedHistory = (history || [])
      .map((msg) => `${msg.role === 'user' ? 'Cliente' : 'Assistente'}: ${msg.content}`)
      .join('\n')

    const fullPrompt = `
${systemPersonality}

${PLATFORM_TRIAGE_INSTRUCTIONS}

[FATOS DO SISTEMA]:
${facts.texto}

[INFORMAÇÕES DA BASE DE CONHECIMENTO]:
${extraContext}

HISTORICO DA CONVERSA:
${formattedHistory}

Nova mensagem do Cliente (${contactName}, ${contactPhone}): ${message.trim()}
`

    try {
      const aiResponse = await generateText(fullPrompt, aiConfig)

      if (!aiResponse?.trim()) {
        return { success: false, error: 'IA retornou resposta vazia.' }
      }

      const tags = parseAiTags(aiResponse)

      return {
        success: true,
        response: aiResponse,
        responseForWhatsApp: stripOutboundTags(aiResponse),
        crmStatus: tags.crmStatus,
        tags,
        facts,
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido na IA'
      console.error('[EmpresaChat] Erro ao gerar resposta:', err)
      return { success: false, error: msg }
    }
  }
}
