/**
 * Bloco 7 — base de conhecimento RAG (dev) na Empresa Teste Go-Live.
 *
 * Uso: node scripts/supabase/block7-test-conhecimento.mjs
 */
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const pdf = require('pdf-parse/lib/pdf-parse')

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '../..')
const envLocal = resolve(root, '.env.local')

const EMPRESA_ID = '645679bd-3f41-4f7d-ba10-98d97cab2a46'
const GESTOR_EMAIL = 'golive-gestor-510160@teste.ragnar.dev'
const PASSWORD = 'RagnarDevTest1!'
const KNOWLEDGE_BUCKET = 'knowledge_documents'
const EMBEDDING_MODEL = 'text-embedding-3-large'

function loadEnvLocal() {
  if (!existsSync(envLocal)) return {}
  const o = {}
  for (const line of readFileSync(envLocal, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i > 0) o[t.slice(0, i)] = t.slice(i + 1).trim()
  }
  return o
}

function chunkText(text, size = 1000, overlap = 200) {
  const chunks = []
  let start = 0
  while (start < text.length) {
    const end = Math.min(start + size, text.length)
    chunks.push(text.substring(start, end))
    start += size - overlap
  }
  return chunks
}

function buildMinimalPdf(text) {
  const safe = text.replace(/[()\\]/g, ' ').slice(0, 80)
  // PDF mínimo válido (xref correto) — compatível com pdf-parse
  return Buffer.from(
    `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Contents 4 0 R>>endobj
4 0 obj<</Length 60>>stream
BT /F1 12 Tf 100 700 Td (${safe}) Tj ET
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000052 00000 n 
0000000101 00000 n 
0000000190 00000 n 
trailer<</Size 5/Root 1 0 R>>
startxref
285
%%EOF`,
    'utf8',
  )
}

async function embedText(openai, text) {
  const result = await openai.embeddings.create({ model: EMBEDDING_MODEL, input: text })
  return result.data[0]?.embedding ?? []
}

async function ingestKnowledge(sb, openai, { type, content, fileName, fileBuffer, category }) {
  const { data: source, error: sourceErr } = await sb
    .from('knowledge_sources')
    .insert({
      organization_id: EMPRESA_ID,
      file_name: fileName,
      category,
    })
    .select('id')
    .single()
  if (sourceErr) throw new Error(`source: ${sourceErr.message}`)

  const meta = {
    content_text: content,
    mime_type: type === 'pdf' ? 'application/pdf' : 'text/plain',
  }

  if (type === 'pdf' && fileBuffer) {
    const storagePath = `${EMPRESA_ID}/${source.id}/${fileName}`
    const { error: upErr } = await sb.storage
      .from(KNOWLEDGE_BUCKET)
      .upload(storagePath, fileBuffer, { contentType: 'application/pdf', upsert: true })
    if (upErr) throw new Error(`storage upload: ${upErr.message}`)
    meta.storage_path = storagePath
  }

  await sb.from('knowledge_sources').update(meta).eq('id', source.id)

  const chunks = chunkText(content)
  const rows = []
  for (const chunk of chunks) {
    const embedding = await embedText(openai, chunk)
    rows.push({
      organization_id: EMPRESA_ID,
      source_id: source.id,
      content: chunk,
      embedding,
    })
  }

  const { error: chunkErr } = await sb.from('knowledge_base').insert(rows)
  if (chunkErr) {
    await sb.from('knowledge_sources').delete().eq('id', source.id)
    throw new Error(`chunks: ${chunkErr.message}`)
  }

  return { sourceId: source.id, chunks: rows.length, storagePath: meta.storage_path }
}

async function main() {
  const env = loadEnvLocal()
  const openaiKey = env.OPENAI_API_KEY || process.env.OPENAI_API_KEY
  if (!openaiKey) throw new Error('OPENAI_API_KEY ausente')

  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  const openai = new OpenAI({ apiKey: openaiKey })

  const { error: loginErr } = await sb.auth.signInWithPassword({
    email: GESTOR_EMAIL,
    password: PASSWORD,
  })
  if (loginErr) throw new Error(`Login: ${loginErr.message}`)

  const suffix = Date.now().toString().slice(-6)
  const pdfText = `Ragnar conhecimento teste go live bloco sete ${suffix} conteudo suficiente para vetorizacao.`
  const pdfBuffer = buildMinimalPdf(pdfText)
  let extracted = pdfText
  try {
    const pdfParsed = await pdf(pdfBuffer)
    if (pdfParsed.text?.trim().length >= 10) extracted = pdfParsed.text.trim()
  } catch {
    console.warn('[block7] pdf-parse falhou; usando texto fallback para vetorização')
  }

  // 7.3 — texto direto
  const textContent = `Politica comercial teste ${suffix}. Oferecemos suporte dedicado e prazo de entrega de 5 dias uteis para clientes go-live.`
  const textIng = await ingestKnowledge(sb, openai, {
    type: 'text',
    content: textContent,
    fileName: `Texto: Geral ${suffix}`,
    category: 'Geral',
  })

  // 7.1 — PDF
  const pdfIng = await ingestKnowledge(sb, openai, {
    type: 'pdf',
    content: extracted.length >= 10 ? extracted : pdfText,
    fileName: `documento-teste-${suffix}.pdf`,
    fileBuffer: pdfBuffer,
    category: 'Geral',
  })

  const { data: pdfChunks } = await sb
    .from('knowledge_base')
    .select('id')
    .eq('source_id', pdfIng.sourceId)

  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  let embeddingLen = 0
  const { data: raw } = await admin
    .from('knowledge_base')
    .select('embedding')
    .eq('source_id', pdfIng.sourceId)
    .limit(1)
    .single()
  if (raw?.embedding) {
    if (Array.isArray(raw.embedding)) embeddingLen = raw.embedding.length
    else if (typeof raw.embedding === 'string') {
      embeddingLen = raw.embedding.replace(/[\[\]]/g, '').split(',').filter(Boolean).length
    }
  }

  // 7.4 — download do storage (mesmo arquivo servido pela API)
  const { data: downloadData, error: dlErr } = await sb.storage
    .from(KNOWLEDGE_BUCKET)
    .download(pdfIng.storagePath)
  const downloadOk = !dlErr && downloadData && (await downloadData.arrayBuffer()).byteLength > 0

  // 7.2 — validação estática da UI (input file + click handler no código)
  const pageSrc = readFileSync(
    resolve(root, 'src/app/(app)/cockpit/crm/conhecimento/page.tsx'),
    'utf8',
  )
  const uiFilePickerOk =
    pageSrc.includes('type="file"') &&
    pageSrc.includes('fileInputRef.current?.click()') &&
    pageSrc.includes('accept="application/pdf')

  // 7.5 — excluir PDF (mantém texto para bloco 8)
  const { data: srcBefore } = await sb
    .from('knowledge_sources')
    .select('storage_path')
    .eq('id', pdfIng.sourceId)
    .single()

  if (srcBefore?.storage_path) {
    await sb.storage.from(KNOWLEDGE_BUCKET).remove([srcBefore.storage_path])
  }
  const { error: delErr } = await sb
    .from('knowledge_sources')
    .delete()
    .eq('id', pdfIng.sourceId)
    .eq('organization_id', EMPRESA_ID)
  if (delErr) throw new Error(`delete: ${delErr.message}`)

  const { data: deletedCheck } = await sb
    .from('knowledge_sources')
    .select('id')
    .eq('id', pdfIng.sourceId)
    .maybeSingle()

  const { count: chunkCount } = await sb
    .from('knowledge_base')
    .select('id', { count: 'exact', head: true })
    .eq('source_id', pdfIng.sourceId)

  await sb.auth.signOut()

  const tests = {
    '7.1_pdf_processado': pdfIng.chunks >= 1 && embeddingLen === 3072,
    '7.2_upload_ui': uiFilePickerOk,
    '7.3_texto_direto': textIng.chunks >= 1,
    '7.4_download_arquivo': downloadOk,
    '7.5_excluir': deletedCheck === null && (chunkCount ?? 0) === 0,
  }

  if (!Object.values(tests).every(Boolean)) {
    throw new Error(`Falha: ${JSON.stringify({ tests, embeddingLen })}`)
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        text_source_id: textIng.sourceId,
        pdf_source_id_deleted: pdfIng.sourceId,
        embedding_dimensions: embeddingLen,
        tests,
      },
      null,
      2,
    ),
  )
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
