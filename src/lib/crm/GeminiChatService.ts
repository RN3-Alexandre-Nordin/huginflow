import { GoogleGenerativeAI } from '@google/generative-ai'
import type { SupabaseClient } from '@supabase/supabase-js'

export type GeminiChatInput = {
  empresaId: string
  leadId: string
  conversaId?: string
  contactPhone: string
  contactName: string
  message: string
}

export type GeminiChatResult =
  | { success: true; response: string; responseForWhatsApp: string; crmStatus?: string }
  | { success: false; error: string }

async function generateEmbedding(text: string, apiKey: string) {
  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel(
    { model: 'models/gemini-embedding-001' },
    { apiVersion: 'v1beta' },
  )
  const result = await model.embedContent(text)
  return result.embedding.values
}

/** Remove tags [STATUS_CRM: ...] e demais blocos entre colchetes para envio ao cliente. */
export function stripOutboundTags(text: string): string {
  return text.replace(/\[STATUS_CRM:.*?\]/gi, '').replace(/\[.*?\]/g, '').trim()
}

export function parseCrmStatus(text: string): string | undefined {
  const match = text.match(/\[STATUS_CRM:\s*(.*?)\]/i)
  return match?.[1]?.trim().toUpperCase()
}

/**
 * Mesma lógica do Simulador: RAG (match_knowledge_base) + Gemini + histórico do lead.
 */
export class GeminiChatService {
  static async generateReply(
    supabase: SupabaseClient,
    input: GeminiChatInput,
  ): Promise<GeminiChatResult> {
    const { empresaId, leadId, conversaId, contactPhone, contactName, message } = input

    const { data: empresa, error: empresaError } = await supabase
      .from('empresas')
      .select('ai_context_prompt, ai_model, gemini_api_key')
      .eq('id', empresaId)
      .single()

    if (empresaError || !empresa) {
      return { success: false, error: 'Empresa não encontrada para carregar IA.' }
    }

    const geminiApiKey = empresa.gemini_api_key || process.env.GEMINI_API_KEY
    if (!geminiApiKey) {
      return {
        success: false,
        error: 'GEMINI_API_KEY não configurada (env ou cadastro da empresa).',
      }
    }

    const modelName = empresa.ai_model || 'gemini-3.5-flash'

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
      const userEmbedding = await generateEmbedding(message, geminiApiKey)
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
      console.error('[GeminiChat] Erro na busca semântica:', ragErr)
    }

    const systemPersonality = (
      empresa.ai_context_prompt || 'Você é a Mônica, assistente da Monte Sinai.'
    )
      .replace(/%22/g, '"')
      .trim()

    const formattedHistory = (history || [])
      .map((msg) => `${msg.role === 'user' ? 'Cliente' : 'Mônica'}: ${msg.content}`)
      .join('\n')

    const ragnarInstructions = `
    INSTRUÇÕES DE SISTEMA (RAGNAR CRM):
    1. Use os "DADOS DA BASE DE CONHECIMENTO" como única fonte de verdade.
    2. Se não houver dados, aja com o conhecimento geral mas seja cauteloso.
    3. Ao final da resposta, inclua metadados: [STATUS_CRM: NOVO_LEAD | EM_QUALIFICACAO | INTERESSADO | AGENDADO | PERDIDO | GANHO]
  `

    const fullPrompt = `
    ${systemPersonality}
    
    ${ragnarInstructions}
    
    [INFORMAÇÕES DA BASE DE CONHECIMENTO]:
    ${extraContext}
    
    HISTORICO DA CONVERSA:
    ${formattedHistory}
    
    Nova mensagem do Cliente (${contactName}, ${contactPhone}): ${message.trim()}
  `

    try {
      const genAI = new GoogleGenerativeAI(geminiApiKey)
      const model = genAI.getGenerativeModel({ model: modelName }, { apiVersion: 'v1beta' })
      const result = await model.generateContent(fullPrompt)
      const aiResponse = result.response.text()

      if (!aiResponse?.trim()) {
        return { success: false, error: 'IA retornou resposta vazia.' }
      }

      return {
        success: true,
        response: aiResponse,
        responseForWhatsApp: stripOutboundTags(aiResponse),
        crmStatus: parseCrmStatus(aiResponse),
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido no Gemini'
      console.error('[GeminiChat] Erro no Gemini:', err)
      return { success: false, error: msg }
    }
  }
}
