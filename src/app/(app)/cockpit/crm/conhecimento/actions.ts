'use server'

import { createClient } from '@/utils/supabase/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { revalidatePath } from 'next/cache'
import pdf from 'pdf-parse/lib/pdf-parse'
import { hasPermission } from '@/utils/permissions'
import { getMyProfile } from '@/app/(app)/cockpit/actions'

const KNOWLEDGE_BUCKET = 'knowledge_documents'

/**
 * Busca o ID da empresa do usuário logado
 */
async function getOrganizationId() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Não autenticado')

  const { data: perfil } = await supabase
    .from('usuarios')
    .select('id, empresa_id, email')
    .eq('auth_user_id', user.id)
    .single()

  if (!perfil) throw new Error('Perfil não encontrado')
  return perfil.empresa_id
}

/**
 * Busca todos os registros da base de conhecimento da empresa
 */
export async function getKnowledgeBase() {
  const me = await getMyProfile()
  if (!hasPermission(me, 'conhecimento', 'view')) {
    throw new Error('Você não tem permissão para visualizar a base de conhecimento.')
  }
  const empresaId = me?.empresa_id ?? ''
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('knowledge_sources')
    .select('*')
    .eq('organization_id', empresaId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

/**
 * Gera Embeddings para um texto usando o modelo gemini-embedding-001
 */
async function generateEmbedding(text: string, apiKey: string) {
  const genAI = new GoogleGenerativeAI(apiKey)
  // v1beta endpoint e gemini-embedding-001 conforme solicitado
  const model = genAI.getGenerativeModel({ model: "models/gemini-embedding-001" }, { apiVersion: 'v1beta' })

  const result = await model.embedContent(text)
  const values = result.embedding.values
  console.log(`[RAG DEBUG] Embedding length generated: ${values.length}`)
  return values
}

/**
 * Divide o texto em blocos de aproximadamente 1000 caracteres
 */
function chunkText(text: string, size = 1000, overlap = 200): string[] {
  const chunks: string[] = []
  let start = 0

  while (start < text.length) {
    const end = Math.min(start + size, text.length)
    const chunk = text.substring(start, end)
    chunks.push(chunk)
    start += (size - overlap)
  }

  return chunks
}

/**
 * Extrai texto de um PDF usando pdf-parse (v1.1.1 - servidor-safe)
 */
async function extractTextFromPDF(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer())
  const data = await pdf(buffer)
  return data.text
}

/**
 * Salva ou Atualiza um registro de conhecimento (Texto ou PDF)
 */
export async function upsertKnowledge(formData: FormData) {
  try {
    const me = await getMyProfile()
    if (!hasPermission(me, 'conhecimento', 'create')) {
      throw new Error('Você não tem permissão para adicionar conhecimento.')
    }
    const empresaId = me?.empresa_id ?? ''
    const supabase = await createClient()

    // Pegar API Key da empresa
    const { data: empresa } = await supabase
      .from('empresas')
      .select('gemini_api_key')
      .eq('id', empresaId)
      .single()

    if (!empresa?.gemini_api_key) {
      throw new Error('Chave API Gemini não configurada. Vá em Empresas > Editar para configurar sua chave.')
    }

    const type = formData.get('type') as 'text' | 'pdf'
    const category = formData.get('category') as string || 'Geral'
    let rawContent = ''
    let fileName = ''

    if (type === 'text') {
      rawContent = formData.get('content') as string
      if (!rawContent) throw new Error('O conteúdo de texto está vazio.')
      fileName = `Texto: ${category}`
    } else {
      const file = formData.get('file') as File
      if (!file || file.size === 0) throw new Error('Nenhum arquivo enviado.')

      fileName = file.name
      console.log(`[KnowledgeBase] Iniciando extração local de PDF: ${fileName}`)
      rawContent = await extractTextFromPDF(file)
    }

    if (!rawContent || rawContent.length < 10) {
      throw new Error('Conteúdo insuficiente para vetorização.')
    }

    // 1. Criar a Fonte (Documento)
    const { data: source, error: sourceError } = await supabase
      .from('knowledge_sources')
      .insert({
        organization_id: empresaId,
        file_name: fileName,
        category: category
      })
      .select()
      .single()

    if (sourceError) throw new Error('Erro ao criar fonte: ' + sourceError.message)

    // Metadados para download (requer migration knowledge_sources_download.sql)
    const downloadMeta: Record<string, string> = {
      content_text: rawContent,
      mime_type: type === 'text' ? 'text/plain' : 'application/pdf',
    }

    if (type === 'pdf') {
      const file = formData.get('file') as File
      const storagePath = `${empresaId}/${source.id}/${file.name}`
      const { error: uploadError } = await supabase.storage
        .from(KNOWLEDGE_BUCKET)
        .upload(storagePath, file, { contentType: 'application/pdf', upsert: true })

      if (!uploadError) {
        downloadMeta.storage_path = storagePath
      } else {
        console.warn('[KnowledgeBase] PDF não salvo no Storage (download será .txt):', uploadError.message)
      }
    }

    const { error: metaError } = await supabase
      .from('knowledge_sources')
      .update(downloadMeta)
      .eq('id', source.id)

    if (metaError) {
      console.warn('[KnowledgeBase] Campos de download indisponíveis. Rode scripts/migrations/knowledge_sources_download.sql')
    }

    // 2. Chunking
    const chunks = chunkText(rawContent)
    console.log(`[KnowledgeBase] Documento "${fileName}" dividido em ${chunks.length} blocos. Gerando embeddings...`)

    // 3. Vetorização e Persistência de Chunks
    const insertData = []

    for (const chunk of chunks) {
      const embedding = await generateEmbedding(chunk, empresa.gemini_api_key)
      insertData.push({
        organization_id: empresaId,
        source_id: source.id,
        content: chunk,
        embedding: embedding
      })
    }

    const { error: chunkError } = await supabase
      .from('knowledge_base')
      .insert(insertData)

    if (chunkError) {
      // Rollback manual da source se falhar o insert dos chunks (opcional, mas bom)
      await supabase.from('knowledge_sources').delete().eq('id', source.id)
      throw new Error('Erro ao salvar pedaços no banco: ' + chunkError.message)
    }

    revalidatePath('/cockpit/crm/conhecimento')
    return { success: true, count: chunks.length, sourceId: source.id }
  } catch (err: any) {
    console.error('[KnowledgeBase] Erro:', err)
    return { error: err.message || 'Erro inesperado.' }
  }
}

/**
 * Deleta um registro
 */
export async function deleteKnowledge(id: string) {
  const me = await getMyProfile()
  if (!hasPermission(me, 'conhecimento', 'delete')) {
    throw new Error('Você não tem permissão para excluir itens da base de conhecimento.')
  }
  const empresaId = me?.empresa_id ?? ''
  const supabase = await createClient()

  const { data: source } = await supabase
    .from('knowledge_sources')
    .select('storage_path')
    .eq('id', id)
    .eq('organization_id', empresaId)
    .maybeSingle()

  if (source?.storage_path) {
    await supabase.storage.from(KNOWLEDGE_BUCKET).remove([source.storage_path])
  }

  // Deletar a fonte (triggers CASCADE na knowledge_base)
  const { error } = await supabase
    .from('knowledge_sources')
    .delete()
    .eq('id', id)
    .eq('organization_id', empresaId)

  if (error) throw error

  revalidatePath('/cockpit/crm/conhecimento')
}
