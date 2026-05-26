'use server'

import { createClient } from '@/utils/supabase/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { revalidatePath } from 'next/cache'
import { hasPermission } from '@/utils/permissions'
import { getMyProfile } from '@/app/(app)/cockpit/actions'

/**
 * Gera Embeddings para um texto usando o modelo gemini-embedding-001 (v1beta)
 */
async function generateEmbedding(text: string, apiKey: string) {
  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: "models/gemini-embedding-001" }, { apiVersion: 'v1beta' })

  const result = await model.embedContent(text)
  const values = result.embedding.values
  return values
}

export async function processChat(phone: string, name: string, message: string) {
  const me = await getMyProfile()
  if (!hasPermission(me, 'simulador', 'view')) {
    return { error: 'Sem permissão para utilizar o simulador.' }
  }

  const supabase = await createClient()
  const targetEmpresaId = me?.empresa_id

  if (!targetEmpresaId) return { error: 'Empresa não identificada para carregar configurações de IA.' }

  const geminiApiKey = process.env.GEMINI_API_KEY
  if (!geminiApiKey) {
    return { error: 'GEMINI_API_KEY não configurada no servidor. Adicione a chave no arquivo .env local.' }
  }

  // 2. Buscar configurações da organização (tabela empresas)
  const { data: empresa } = await supabase
    .from('empresas')
    .select('ai_context_prompt')
    .eq('id', targetEmpresaId)
    .single()

  // 3. Gestão de Lead (Detecção/Criação)
  let leadId: string
  
  const { data: existingLead } = await supabase
    .from('crm_leads')
    .select('id, nome')
    .eq('telefone', phone)
    .eq('empresa_id', targetEmpresaId)
    .maybeSingle()

  if (existingLead) {
    leadId = existingLead.id
  } else {
    const { data: newLead, error: leadError } = await supabase
      .from('crm_leads')
      .insert([{ 
        nome: name, 
        telefone: phone, 
        empresa_id: targetEmpresaId,
        canal_id: null 
      }])
      .select('id')
      .single()
    
    if (leadError) return { error: 'Falha ao criar lead: ' + leadError.message }
    leadId = newLead.id
  }

  // 4. Registrar mensagem do Usuário
  await supabase.from('crm_interacoes').insert([{
    empresa_id: targetEmpresaId,
    lead_id: leadId,
    contact_phone: phone,
    contact_name: name,
    role: 'user',
    content: message
  }])

  // 5. Recuperar Histórico para Memória (Últimas 20 mensagens)
  const { data: history } = await supabase
    .from('crm_interacoes')
    .select('role, content')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: true })
    .limit(20)

  const genAI = new GoogleGenerativeAI(geminiApiKey)
  const model = genAI.getGenerativeModel(
    { model: 'gemini-3.5-flash' },
    { apiVersion: 'v1beta' },
  )

  // 6. RECUPERAÇÃO DE CONTEXTO (RAG) - Refatorado para Busca Semântica
  let extraContext = "Nenhuma informação específica encontrada na base de conhecimento.";
  
  try {
    const userEmbedding = await generateEmbedding(message, geminiApiKey)
    
    const { data: kbContext, error: rpcError } = await supabase.rpc('match_knowledge_base', {
      query_embedding: userEmbedding,
      match_threshold: 0.4,
      match_count: 5,
      org_id: targetEmpresaId
    });

    if (rpcError) throw rpcError;

    if (kbContext && kbContext.length > 0) {
      extraContext = kbContext.map((c: any) => `[${c.category || 'Geral'}]: ${c.content}`).join('\n');
    }
  } catch (ragErr) {
    console.error("[RAG DEBUG] Erro na busca semântica:", ragErr);
  }

  const systemPersonality = (empresa?.ai_context_prompt || "Você é a Mônica, assistente da Monte Sinai.").replace(/%22/g, '"').trim();
  
  const formattedHistory = (history || [])
    .map(msg => `${msg.role === 'user' ? 'Cliente' : 'Mônica'}: ${msg.content}`)
    .join('\n');

  const ragnarInstructions = `
    INSTRUÇÕES DE SISTEMA (RAGNAR CRM):
    1. Use os "DADOS DA BASE DE CONHECIMENTO" como única fonte de verdade.
    2. Se não houver dados, aja com o conhecimento geral mas seja cauteloso.
    3. Ao final da resposta, inclua metadados: [STATUS_CRM: NOVO_LEAD | EM_QUALIFICACAO | INTERESSADO | AGENDADO | PERDIDO | GANHO]
  `;

  const fullPrompt = `
    ${systemPersonality}
    
    ${ragnarInstructions}
    
    [INFORMAÇÕES DA BASE DE CONHECIMENTO]:
    ${extraContext}
    
    HISTORICO DA CONVERSA:
    ${formattedHistory}
    
    Nova mensagem do Cliente: ${message.trim()}
  `;

  // 7. Chamada Direta e Simples
  try {
    const result = await model.generateContent(fullPrompt);
    const response = await result.response;
    const aiResponse = response.text();

    // 8. Salvar apenas a interação atual no banco
    if (aiResponse) {
       await supabase.from('crm_interacoes').insert([
          { empresa_id: targetEmpresaId, lead_id: leadId, contact_phone: phone, contact_name: name, role: 'assistant', content: aiResponse }
       ])
    }
    
    revalidatePath('/cockpit/crm/simulador')
    return { success: true, response: aiResponse }
  } catch (err: any) {
    console.error("Erro no Gemini:", err)
    return { error: 'Erro na IA: ' + err.message }
  }
}

/**
 * Recupera as interações existentes para a página
 */
export async function getChatHistory(phone: string) {
  const me = await getMyProfile()
  if (!hasPermission(me, 'simulador', 'view')) {
    return []
  }

  const supabase = await createClient()
  const { data } = await supabase
    .from('crm_interacoes')
    .select('*')
    .eq('contact_phone', phone)
    .eq('empresa_id', me?.empresa_id ?? '')
    .order('created_at', { ascending: true })

  return data || []
}
