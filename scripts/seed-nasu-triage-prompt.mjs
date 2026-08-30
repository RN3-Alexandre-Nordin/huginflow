/**
 * Atualiza prompt de triagem + KB (horário/mapa) da empresa NASU em um projeto Supabase.
 * Uso:
 *   node --env-file=.env.production scripts/seed-nasu-triage-prompt.mjs prod
 *   node --env-file=.env.local scripts/seed-nasu-triage-prompt.mjs dev
 */
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

const NASU_EMPRESA_ID = '2b87fa27-a1da-4a6b-b7c9-8cfef5685ce7'

const NASU_TRIAGE_PROMPT = `Você é o agente de TRIAGEM e direcionamento de atendimentos da NASU Locações — Manutenção e Comércio de Equipamentos Ltda (nasulocacoes.com.br), no canal WhatsApp.

Tom: cordial, objetivo e profissional. Fale em português do Brasil. Não invente preços, prazos ou políticas fora da Base de Conhecimento.

Sua função:
1. Entender a solicitação do cliente (use TODO o histórico da conversa).
2. Identificar o departamento responsável (Comercial, Expedição, Financeiro — ou o que constar nos FATOS DO SISTEMA).
3. Identificar o funil/fluxo correto pelos IDs dos FATOS.
4. Usar obrigatoriamente a Base de Conhecimento e os FATOS DO SISTEMA antes de classificar.
5. Emitir tags para o sistema criar/atualizar o card — você NÃO escolhe o atendente final (o sistema distribui por carga/rodízio).
6. Se faltar informação essencial, faça UMA pergunta objetiva e emita [ACTION: ASK_CLARIFY].

Horário (fato dentro_horario):
- Dentro OU fora do horário: continue a conversa até conseguir classificar e criar o card.
- NÃO responda apenas que está fora do horário sem coletar/classificar a solicitação.
- Com classificação completa: emita [ACTION: CREATE_CARD] e [ACTION: HANDOVER].
- Se dentro_horario=false: emita também [ACTION: FORA_HORARIO] e, na mensagem ao cliente, diga que um atendente entrará em contato no horário comercial (seg–sex 8h–17h Brasília), DEPOIS de confirmar que a solicitação foi registrada.
- Se dentro_horario=true: confirme que a equipe dará continuidade em breve.

Se card_aberto=true, emita CREATE_CARD para o sistema atualizar o card existente (não diga que criou um segundo atendimento).

Nunca exponha tags, IDs internos ou raciocínio ao cliente.`

const SOURCE_ID = 'a1000001-0001-4000-8000-000000000010'

const KB_DOCS = [
  {
    content: `Horário de atendimento humano NASU Locações (WhatsApp e canais):
- Dias: segunda a sexta-feira
- Horário: 08:00 às 17:00
- Fuso: America/Sao_Paulo (horário de Brasília)
- Sábados, domingos e fora desse intervalo: NÃO há atendente humano imediato.
- A IA DEVE continuar a conversa fora do horário até classificar a solicitação e permitir a criação do card.
- Só após registrar/classificar, informe o cliente sobre o retorno no horário comercial.
- Mensagem sugerida (após criar o card, fora do horário): "Registramos sua solicitação. Nosso horário de atendimento humano é de segunda a sexta, das 8h às 17h (horário de Brasília). Um de nossos atendentes entrará em contato nesse período. Obrigado!"`,
  },
  {
    content: `Mapa de triagem NASU (assuntos → departamento → funil):
- Orçamentos, locação de equipamentos, condições comerciais, novos clientes → departamento Comercial → funil Atendimento.
- Entrega, retirada, OS de expedição, comprovante de entrega, logística de equipamentos → departamento Expedição → funil Expedição.
- Boletos, notas fiscais, cobrança, pagamentos, contratos financeiros → departamento Financeiro → funil Financeiro.
- Assunto ambíguo: perguntar se é comercial, expedição ou financeiro antes de criar card.
- Um card por solicitação principal; registrar no resumo dados informados (contrato, endereço, equipamento, etc.).`,
  },
]

async function embed(openai, text) {
  const res = await openai.embeddings.create({
    model: 'text-embedding-3-large',
    input: text,
  })
  return res.data[0].embedding
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const openaiKey = process.env.OPENAI_API_KEY

  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const supabase = createClient(url, key)

  const { data: empresa, error: empErr } = await supabase
    .from('empresas')
    .update({ ai_context_prompt: NASU_TRIAGE_PROMPT })
    .eq('id', NASU_EMPRESA_ID)
    .select('id, nome')
    .single()

  if (empErr) {
    console.error('Falha ao atualizar prompt:', empErr)
    process.exit(1)
  }
  console.log('Prompt atualizado:', empresa?.nome, empresa?.id)

  if (!openaiKey) {
    console.warn('OPENAI_API_KEY ausente — prompt ok, KB sem embedding')
  }

  const openai = openaiKey ? new OpenAI({ apiKey: openaiKey }) : null

  const { data: existingSource } = await supabase
    .from('knowledge_sources')
    .select('id')
    .eq('id', SOURCE_ID)
    .maybeSingle()

  if (!existingSource) {
    const { error: srcErr } = await supabase.from('knowledge_sources').insert({
      id: SOURCE_ID,
      organization_id: NASU_EMPRESA_ID,
      file_name: 'Triagem WhatsApp — horário e mapa.md',
      category: 'Triagem',
      content_text: KB_DOCS.map((d) => d.content).join('\n\n'),
      mime_type: 'text/markdown',
    })
    if (srcErr) {
      console.error('Falha ao criar knowledge_sources:', srcErr)
      process.exit(1)
    }
    console.log('knowledge_sources criado:', SOURCE_ID)
  } else {
    await supabase
      .from('knowledge_sources')
      .update({
        content_text: KB_DOCS.map((d) => d.content).join('\n\n'),
        category: 'Triagem',
        file_name: 'Triagem WhatsApp — horário e mapa.md',
      })
      .eq('id', SOURCE_ID)
    console.log('knowledge_sources atualizado:', SOURCE_ID)
  }

  // Remove chunks antigos desta fonte e reinsere
  await supabase.from('knowledge_base').delete().eq('source_id', SOURCE_ID)

  for (const doc of KB_DOCS) {
    let embedding = null
    if (openai) {
      embedding = await embed(openai, doc.content)
    }

    const row = {
      organization_id: NASU_EMPRESA_ID,
      source_id: SOURCE_ID,
      content: doc.content,
      ...(embedding ? { embedding } : {}),
    }
    const { error } = await supabase.from('knowledge_base').insert(row)
    if (error) console.error('KB insert fail', error)
    else console.log('KB chunk inserido')
  }

  console.log('Concluído.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
