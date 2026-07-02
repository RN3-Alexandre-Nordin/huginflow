import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import {
  generateEmbedding,
  generateText,
  getAiConfigErrorMessage,
  resolveEmpresaAiConfig,
} from '@/lib/ai/empresa-ai'

export async function POST(req: Request) {
  try {
    const { prompt, cardId } = await req.json()
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { data: perfil } = await supabase
      .from('usuarios')
      .select('empresa_id')
      .eq('auth_user_id', user.id)
      .single()

    if (!perfil) {
      return NextResponse.json({ error: 'Perfil de usuário não encontrado' }, { status: 404 })
    }

    const { data: empresa } = await supabase
      .from('empresas')
      .select('ai_model, ai_context_prompt')
      .eq('id', perfil.empresa_id)
      .single()

    const aiConfig = empresa ? resolveEmpresaAiConfig(empresa) : null
    if (!aiConfig) {
      return NextResponse.json({ error: getAiConfigErrorMessage() }, { status: 400 })
    }

    let extraContext = 'Nenhuma informação específica encontrada na base de conhecimento.'
    try {
      const queryEmbedding = await generateEmbedding(prompt, aiConfig)
      const { data: kbContext, error: kbError } = await supabase.rpc('match_knowledge_base', {
        query_embedding: queryEmbedding,
        match_threshold: 0.5,
        match_count: 10,
        org_id: perfil.empresa_id,
      })

      if (kbError) console.error('Erro na busca semântica:', kbError)

      if (kbContext?.length) {
        extraContext = kbContext
          .map((c: { file_name?: string; content: string }) => `[FONTE: ${c.file_name || 'Geral'}]: ${c.content}`)
          .join('\n---\n')
      }
    } catch (ragErr) {
      console.error('Erro ao gerar embedding para RAG:', ragErr)
    }

    const systemPersonality = (empresa?.ai_context_prompt || 'Você é a Mônica, assistente da Monte Sinai.')
      .replace(/%22/g, '"')
      .trim()

    const ragnarInstructions = `
      --- INSTRUÇÕES CRÍTICAS DE PRIORIDADE (RAG) ---
      1. VOCÊ DEVE CONSULTAR OS "DADOS DA BASE DE CONHECIMENTO" ABAIXO PARA QUALQUER PERGUNTA SOBRE PRODUTOS, PREÇOS, REGRAS OU FAQ.
      2. ESTA BASE É A ÚNICA FONTE DE VERDADE. SE A RESPOSTA ESTIVER LÁ, USE-A EXCLUSIVAMENTE.
      3. SE A INFORMAÇÃO NÃO ESTIVER NA BASE, RESPONDA COM EDUCAÇÃO E DIGA QUE IRÁ VERIFICAR, MAS NÃO TENTE INVENTAR PREÇOS OU REGRAS.
      
      --- DADOS DA BASE DE CONHECIMENTO (FONTE ÚNICA) ---
      ${extraContext}
      -----------------------------------------------

      PERSONALIDADE E DIRETRIZES:
      - ${systemPersonality}
      - Ao final da resposta, se identificar progresso na negociação, inclua obrigatoriamente um bloco oculto no formato:
        [STATUS_CRM: NOVO_LEAD | EM_QUALIFICACAO | INTERESSADO | APROVACAO | PEDIDO | GANHO | PERDIDO]
      - Baseie o status no progresso desta conversa específica.
    `

    const fullPrompt = `${ragnarInstructions}\n\nPergunta do Cliente: ${prompt.trim()}`
    const text = await generateText(fullPrompt, aiConfig)

    const statusMatch = text.match(/\[STATUS_CRM:\s*(.*?)\]/i)
    if (statusMatch && cardId) {
      const suggestedStatus = statusMatch[1].trim().toUpperCase()
      const stageMap: Record<string, string> = {
        NOVO_LEAD: '51107160-6030-42de-b25b-23cdcc5a70d0',
        PROSPECCAO: '51107160-6030-42de-b25b-23cdcc5a70d0',
        APROVACAO: 'cd16c7c7-f630-4a9a-bed6-1c6947bd968d',
        INTERESSADO: 'cd16c7c7-f630-4a9a-bed6-1c6947bd968d',
        GANHO: '39363b20-7452-4d1e-bdd5-b986d96137ed',
        PEDIDO: 'b5f8582a-7c72-425b-ae20-46a74f4566b1',
        PERDIDO: '7f3136d8-c88c-42c9-a2d7-4cb4fe6c04b6',
      }

      const newStageId = stageMap[suggestedStatus]
      if (newStageId) {
        await supabase
          .from('crm_cards')
          .update({ stage_id: newStageId, stage_entered_at: new Date().toISOString() })
          .eq('id', cardId)
      }
    }

    const cleanedText = text.replace(/\[.*?\]/g, '').trim()
    return NextResponse.json({ response: cleanedText })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro interno'
    console.error('Erro na API de Chat:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
