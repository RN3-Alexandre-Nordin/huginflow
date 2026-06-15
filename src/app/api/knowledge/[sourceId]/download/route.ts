import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { hasPermission } from '@/utils/permissions'

const KNOWLEDGE_BUCKET = 'knowledge_documents'
const CHUNK_OVERLAP = 200

function sanitizeFileName(name: string): string {
  return name.replace(/[^\w\s.\-()áàâãéêíóôõúüçÁÀÂÃÉÊÍÓÔÕÚÜÇ]/g, '_').trim() || 'documento'
}

function buildContentDisposition(fileName: string): string {
  const safe = sanitizeFileName(fileName)
  const encoded = encodeURIComponent(safe)
  return `attachment; filename="${safe}"; filename*=UTF-8''${encoded}`
}

function reassembleChunks(chunks: { content: string }[]): string {
  if (!chunks.length) return ''
  let text = chunks[0].content
  for (let i = 1; i < chunks.length; i++) {
    text += chunks[i].content.slice(CHUNK_OVERLAP)
  }
  return text
}

function resolveTextFileName(source: { file_name: string; category?: string | null }): string {
  if (source.file_name.toLowerCase().endsWith('.pdf')) {
    return source.file_name.replace(/\.pdf$/i, '.txt')
  }
  if (source.file_name.startsWith('Texto:')) {
    const base = source.category || source.file_name.replace(/^Texto:\s*/, '')
    return `${sanitizeFileName(base)}.txt`
  }
  if (!source.file_name.includes('.')) {
    return `${sanitizeFileName(source.file_name)}.txt`
  }
  return sanitizeFileName(source.file_name)
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sourceId: string }> }
) {
  const supabase = await createClient()
  const { sourceId } = await params

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('usuarios')
    .select('*, grupos_acesso(is_admin, permissoes)')
    .eq('auth_user_id', user.id)
    .single()

  if (!profile || !hasPermission(profile, 'conhecimento', 'view')) {
    return NextResponse.json({ error: 'Sem permissão para baixar documentos' }, { status: 403 })
  }

  const empresaId = profile.empresa_id as string

  const { data: source, error: sourceError } = await supabase
    .from('knowledge_sources')
    .select('id, file_name, category, organization_id, content_text, storage_path, mime_type')
    .eq('id', sourceId)
    .eq('organization_id', empresaId)
    .maybeSingle()

  if (sourceError || !source) {
    return NextResponse.json({ error: 'Documento não encontrado' }, { status: 404 })
  }

  // PDF original no Storage (uploads novos)
  if (source.storage_path) {
    const { data: fileData, error: storageError } = await supabase.storage
      .from(KNOWLEDGE_BUCKET)
      .download(source.storage_path)

    if (!storageError && fileData) {
      const buffer = Buffer.from(await fileData.arrayBuffer())
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': source.mime_type || 'application/pdf',
          'Content-Disposition': buildContentDisposition(source.file_name),
          'Content-Length': String(buffer.length),
        },
      })
    }
  }

  // Texto completo salvo na fonte
  let textContent = source.content_text as string | null

  // Fallback: recompor a partir dos chunks vetorizados
  if (!textContent) {
    const { data: chunks, error: chunksError } = await supabase
      .from('knowledge_base')
      .select('content')
      .eq('source_id', source.id)
      .eq('organization_id', empresaId)
      .order('created_at', { ascending: true })

    if (chunksError || !chunks?.length) {
      return NextResponse.json(
        { error: 'Conteúdo indisponível para download. Itens antigos podem precisar ser reenviados.' },
        { status: 404 }
      )
    }

    textContent = reassembleChunks(chunks)
  }

  const fileName = resolveTextFileName(source)
  const buffer = Buffer.from(textContent, 'utf-8')

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': buildContentDisposition(fileName),
      'Content-Length': String(buffer.length),
    },
  })
}
