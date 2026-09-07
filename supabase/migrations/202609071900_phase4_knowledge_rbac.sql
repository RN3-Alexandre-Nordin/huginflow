-- Fase 4: RAG alinhado à matriz de permissões e integridade source/tenant.

ALTER TABLE public.knowledge_sources
  ADD CONSTRAINT knowledge_sources_id_organization_key UNIQUE (id, organization_id);

ALTER TABLE public.knowledge_base
  ADD CONSTRAINT knowledge_base_source_organization_fkey
  FOREIGN KEY (source_id, organization_id)
  REFERENCES public.knowledge_sources (id, organization_id)
  ON DELETE CASCADE;

DO $$
DECLARE
  policy_row record;
BEGIN
  FOR policy_row IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('knowledge_sources', 'knowledge_base')
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I.%I',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename
    );
  END LOOP;
END
$$;

CREATE POLICY knowledge_sources_select ON public.knowledge_sources
FOR SELECT TO authenticated
USING (
  public.check_permission('conhecimento', 'view')
  AND (
    organization_id = public.current_user_empresa_id()
    OR public.current_user_is_superadmin()
  )
);

CREATE POLICY knowledge_sources_insert ON public.knowledge_sources
FOR INSERT TO authenticated
WITH CHECK (
  public.check_permission('conhecimento', 'create')
  AND organization_id = public.current_user_empresa_id()
);

CREATE POLICY knowledge_sources_update ON public.knowledge_sources
FOR UPDATE TO authenticated
USING (
  public.check_permission('conhecimento', 'edit')
  AND (
    organization_id = public.current_user_empresa_id()
    OR public.current_user_is_superadmin()
  )
)
WITH CHECK (
  public.check_permission('conhecimento', 'edit')
  AND (
    organization_id = public.current_user_empresa_id()
    OR public.current_user_is_superadmin()
  )
);

CREATE POLICY knowledge_sources_delete ON public.knowledge_sources
FOR DELETE TO authenticated
USING (
  public.check_permission('conhecimento', 'delete')
  AND (
    organization_id = public.current_user_empresa_id()
    OR public.current_user_is_superadmin()
  )
);

CREATE POLICY knowledge_base_select ON public.knowledge_base
FOR SELECT TO authenticated
USING (
  public.check_permission('conhecimento', 'view')
  AND (
    organization_id = public.current_user_empresa_id()
    OR public.current_user_is_superadmin()
  )
);

CREATE POLICY knowledge_base_insert ON public.knowledge_base
FOR INSERT TO authenticated
WITH CHECK (
  public.check_permission('conhecimento', 'create')
  AND organization_id = public.current_user_empresa_id()
  AND (
    source_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.knowledge_sources source
      WHERE source.id = knowledge_base.source_id
        AND source.organization_id = knowledge_base.organization_id
    )
  )
);

CREATE POLICY knowledge_base_update ON public.knowledge_base
FOR UPDATE TO authenticated
USING (
  public.check_permission('conhecimento', 'edit')
  AND (
    organization_id = public.current_user_empresa_id()
    OR public.current_user_is_superadmin()
  )
)
WITH CHECK (
  public.check_permission('conhecimento', 'edit')
  AND (
    organization_id = public.current_user_empresa_id()
    OR public.current_user_is_superadmin()
  )
);

CREATE POLICY knowledge_base_delete ON public.knowledge_base
FOR DELETE TO authenticated
USING (
  public.check_permission('conhecimento', 'delete')
  AND (
    organization_id = public.current_user_empresa_id()
    OR public.current_user_is_superadmin()
  )
);

DROP POLICY IF EXISTS knowledge_documents_select ON storage.objects;
DROP POLICY IF EXISTS knowledge_documents_insert ON storage.objects;
DROP POLICY IF EXISTS knowledge_documents_update ON storage.objects;
DROP POLICY IF EXISTS knowledge_documents_delete ON storage.objects;

CREATE POLICY knowledge_documents_select ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'knowledge_documents'
  AND public.check_permission('conhecimento', 'view')
  AND (
    (storage.foldername(name))[1] = public.current_user_empresa_id()::text
    OR public.current_user_is_superadmin()
  )
);

CREATE POLICY knowledge_documents_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'knowledge_documents'
  AND public.check_permission('conhecimento', 'create')
  AND (storage.foldername(name))[1] = public.current_user_empresa_id()::text
);

CREATE POLICY knowledge_documents_update ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'knowledge_documents'
  AND public.check_permission('conhecimento', 'edit')
  AND (storage.foldername(name))[1] = public.current_user_empresa_id()::text
)
WITH CHECK (
  bucket_id = 'knowledge_documents'
  AND public.check_permission('conhecimento', 'edit')
  AND (storage.foldername(name))[1] = public.current_user_empresa_id()::text
);

CREATE POLICY knowledge_documents_delete ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'knowledge_documents'
  AND public.check_permission('conhecimento', 'delete')
  AND (
    (storage.foldername(name))[1] = public.current_user_empresa_id()::text
    OR public.current_user_is_superadmin()
  )
);

REVOKE EXECUTE ON FUNCTION public.match_knowledge_base(vector, double precision, integer, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_knowledge_base(vector, double precision, integer, uuid)
  TO authenticated, service_role;
