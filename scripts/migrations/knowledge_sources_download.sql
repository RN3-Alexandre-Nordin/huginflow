-- Base de conhecimento: suporte a download de documentos
-- Rode no Supabase (dev e prod) após deploy do código.

ALTER TABLE knowledge_sources
  ADD COLUMN IF NOT EXISTS content_text text,
  ADD COLUMN IF NOT EXISTS storage_path text,
  ADD COLUMN IF NOT EXISTS mime_type text;

COMMENT ON COLUMN knowledge_sources.content_text IS 'Texto completo (digitado ou extraído do PDF) para exportação';
COMMENT ON COLUMN knowledge_sources.storage_path IS 'Caminho no Storage bucket knowledge_documents (PDF original)';
COMMENT ON COLUMN knowledge_sources.mime_type IS 'MIME type do arquivo original';

-- ---------------------------------------------------------------------------
-- Bucket + RLS (Storage)
-- Caminho dos arquivos: {empresa_id}/{source_id}/{nome.pdf}
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'knowledge_documents',
  'knowledge_documents',
  false,
  52428800, -- 50 MB
  ARRAY['application/pdf']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Helper: empresa do usuário logado
CREATE OR REPLACE FUNCTION public.current_user_empresa_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.empresa_id
  FROM public.usuarios u
  WHERE u.auth_user_id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_user_is_superadmin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND u.role_global = 'superadmin'
  );
$$;

-- SELECT (download / leitura)
DROP POLICY IF EXISTS "knowledge_documents_select" ON storage.objects;
CREATE POLICY "knowledge_documents_select"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'knowledge_documents'
  AND (
    (storage.foldername(name))[1] = public.current_user_empresa_id()::text
    OR public.current_user_is_superadmin()
  )
);

-- INSERT (upload ao cadastrar PDF)
DROP POLICY IF EXISTS "knowledge_documents_insert" ON storage.objects;
CREATE POLICY "knowledge_documents_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'knowledge_documents'
  AND (storage.foldername(name))[1] = public.current_user_empresa_id()::text
);

-- UPDATE (upsert: true no upload)
DROP POLICY IF EXISTS "knowledge_documents_update" ON storage.objects;
CREATE POLICY "knowledge_documents_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'knowledge_documents'
  AND (storage.foldername(name))[1] = public.current_user_empresa_id()::text
)
WITH CHECK (
  bucket_id = 'knowledge_documents'
  AND (storage.foldername(name))[1] = public.current_user_empresa_id()::text
);

-- DELETE (ao excluir item da base)
DROP POLICY IF EXISTS "knowledge_documents_delete" ON storage.objects;
CREATE POLICY "knowledge_documents_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'knowledge_documents'
  AND (
    (storage.foldername(name))[1] = public.current_user_empresa_id()::text
    OR public.current_user_is_superadmin()
  )
);
