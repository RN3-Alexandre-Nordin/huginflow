import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { hasPermission } from '@/utils/permissions'

const KNOWLEDGE_BUCKET = 'knowledge_documents'
const DOWNLOADABLE_EXTENSIONS = ['.pdf', '.docx'] as const

function isDownloadableFileName(fileName: string): boolean {
  const lower = fileName.toLowerCase()
  return DOWNLOADABLE_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^\w\s.\-()áàâãéêíóôõúüçÁÀÂÃÉÊÍÓÔÕÚÜÇ]/g, '_').trim() || 'documento'
}

function buildContentDisposition(fileName: string): string {
  const safe = sanitizeFileName(fileName)
  const encoded = encodeURIComponent(safe)
  return `attachment; filename="${safe}"; filename*=UTF-8''${encoded}`
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

  if (!isDownloadableFileName(source.file_name)) {
    return NextResponse.json(
      { error: 'Download disponível apenas para arquivos PDF ou DOCX.' },
      { status: 400 }
    )
  }

  if (!source.storage_path) {
    return NextResponse.json(
      { error: 'Arquivo original indisponível. Reenvie o documento para habilitar o download.' },
      { status: 404 }
    )
  }

  const { data: fileData, error: storageError } = await supabase.storage
    .from(KNOWLEDGE_BUCKET)
    .download(source.storage_path)

  if (storageError || !fileData) {
    return NextResponse.json({ error: 'Falha ao recuperar o arquivo original.' }, { status: 404 })
  }

  const buffer = Buffer.from(await fileData.arrayBuffer())
  const mimeType =
    source.mime_type ||
    (source.file_name.toLowerCase().endsWith('.docx')
      ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : 'application/pdf')

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': mimeType,
      'Content-Disposition': buildContentDisposition(source.file_name),
      'Content-Length': String(buffer.length),
    },
  })
}
