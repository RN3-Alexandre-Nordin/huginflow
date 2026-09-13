-- ==============================================================================
-- Transferências por lote (multi-SKU, mesma origem → mesmo destino)
-- ==============================================================================

-- 1. Cabeçalho
CREATE TABLE IF NOT EXISTS public.est_transferencia_lotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas (id) ON DELETE CASCADE,
  numero text NOT NULL,
  local_origem_id uuid NOT NULL REFERENCES public.cad_locais_estoque (id) ON DELETE RESTRICT,
  local_destino_id uuid NOT NULL REFERENCES public.cad_locais_estoque (id) ON DELETE RESTRICT,
  documento text,
  observacao text,
  status text NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho', 'concluido', 'parcial', 'erro')),
  erro_resumo text,
  usuario_id uuid REFERENCES public.usuarios (id) ON DELETE SET NULL,
  movimento_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT est_transferencia_lotes_locais_diff_chk
    CHECK (local_origem_id <> local_destino_id),
  CONSTRAINT est_transferencia_lotes_empresa_numero_uq
    UNIQUE (empresa_id, numero)
);

COMMENT ON TABLE public.est_transferencia_lotes IS
  'Lote de transferência física entre locais (N SKUs, mesma origem e destino).';

CREATE INDEX IF NOT EXISTS idx_est_transferencia_lotes_empresa_status
  ON public.est_transferencia_lotes (empresa_id, status);
CREATE INDEX IF NOT EXISTS idx_est_transferencia_lotes_empresa_movimento
  ON public.est_transferencia_lotes (empresa_id, movimento_em DESC);

-- 2. Itens
CREATE TABLE IF NOT EXISTS public.est_transferencia_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas (id) ON DELETE CASCADE,
  lote_id uuid NOT NULL REFERENCES public.est_transferencia_lotes (id) ON DELETE CASCADE,
  linha int NOT NULL,
  sku_id uuid NOT NULL REFERENCES public.cad_skus (id) ON DELETE RESTRICT,
  quantidade numeric(18, 4) NOT NULL CHECK (quantidade > 0),
  observacao text,
  status text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'erro')),
  erro_codigo text,
  erro_mensagem text,
  movimento_id uuid REFERENCES public.est_movimentos (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT est_transferencia_itens_lote_linha_uq UNIQUE (lote_id, linha)
);

COMMENT ON TABLE public.est_transferencia_itens IS
  'Itens de um lote de transferência (SKU + qtd na UM de estoque).';

CREATE INDEX IF NOT EXISTS idx_est_transferencia_itens_lote
  ON public.est_transferencia_itens (lote_id);
CREATE INDEX IF NOT EXISTS idx_est_transferencia_itens_empresa_sku
  ON public.est_transferencia_itens (empresa_id, sku_id);

-- 3. FK no Cardex
ALTER TABLE public.est_movimentos
  ADD COLUMN IF NOT EXISTS lote_transferencia_id uuid
    REFERENCES public.est_transferencia_lotes (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_est_movimentos_lote_transferencia
  ON public.est_movimentos (lote_transferencia_id)
  WHERE lote_transferencia_id IS NOT NULL;

-- 4. RLS
ALTER TABLE public.est_transferencia_lotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.est_transferencia_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS est_transferencia_lotes_select ON public.est_transferencia_lotes;
CREATE POLICY est_transferencia_lotes_select ON public.est_transferencia_lotes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_user_id = auth.uid()
        AND COALESCE(u.ativo, true)
        AND (u.role_global = 'superadmin' OR u.empresa_id = est_transferencia_lotes.empresa_id)
    )
  );

DROP POLICY IF EXISTS est_transferencia_lotes_insert ON public.est_transferencia_lotes;
CREATE POLICY est_transferencia_lotes_insert ON public.est_transferencia_lotes
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_user_id = auth.uid()
        AND COALESCE(u.ativo, true)
        AND (u.role_global = 'superadmin' OR u.empresa_id = est_transferencia_lotes.empresa_id)
    )
    AND (
      public.check_permission('estoque_transferencias', 'create')
      OR public.check_permission('estoque', 'edit')
      OR public.check_permission('estoque', 'create')
    )
  );

DROP POLICY IF EXISTS est_transferencia_lotes_update ON public.est_transferencia_lotes;
CREATE POLICY est_transferencia_lotes_update ON public.est_transferencia_lotes
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_user_id = auth.uid()
        AND COALESCE(u.ativo, true)
        AND (u.role_global = 'superadmin' OR u.empresa_id = est_transferencia_lotes.empresa_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_user_id = auth.uid()
        AND COALESCE(u.ativo, true)
        AND (u.role_global = 'superadmin' OR u.empresa_id = est_transferencia_lotes.empresa_id)
    )
  );

DROP POLICY IF EXISTS est_transferencia_lotes_delete ON public.est_transferencia_lotes;
CREATE POLICY est_transferencia_lotes_delete ON public.est_transferencia_lotes
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_user_id = auth.uid()
        AND COALESCE(u.ativo, true)
        AND (u.role_global = 'superadmin' OR u.empresa_id = est_transferencia_lotes.empresa_id)
    )
    AND (
      public.check_permission('estoque_transferencias', 'create')
      OR public.check_permission('estoque', 'edit')
    )
  );

DROP POLICY IF EXISTS est_transferencia_itens_select ON public.est_transferencia_itens;
CREATE POLICY est_transferencia_itens_select ON public.est_transferencia_itens
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_user_id = auth.uid()
        AND COALESCE(u.ativo, true)
        AND (u.role_global = 'superadmin' OR u.empresa_id = est_transferencia_itens.empresa_id)
    )
  );

DROP POLICY IF EXISTS est_transferencia_itens_insert ON public.est_transferencia_itens;
CREATE POLICY est_transferencia_itens_insert ON public.est_transferencia_itens
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_user_id = auth.uid()
        AND COALESCE(u.ativo, true)
        AND (u.role_global = 'superadmin' OR u.empresa_id = est_transferencia_itens.empresa_id)
    )
  );

DROP POLICY IF EXISTS est_transferencia_itens_update ON public.est_transferencia_itens;
CREATE POLICY est_transferencia_itens_update ON public.est_transferencia_itens
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_user_id = auth.uid()
        AND COALESCE(u.ativo, true)
        AND (u.role_global = 'superadmin' OR u.empresa_id = est_transferencia_itens.empresa_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_user_id = auth.uid()
        AND COALESCE(u.ativo, true)
        AND (u.role_global = 'superadmin' OR u.empresa_id = est_transferencia_itens.empresa_id)
    )
  );

DROP POLICY IF EXISTS est_transferencia_itens_delete ON public.est_transferencia_itens;
CREATE POLICY est_transferencia_itens_delete ON public.est_transferencia_itens
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_user_id = auth.uid()
        AND COALESCE(u.ativo, true)
        AND (u.role_global = 'superadmin' OR u.empresa_id = est_transferencia_itens.empresa_id)
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.est_transferencia_lotes TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.est_transferencia_itens TO authenticated, service_role;

-- 5. Backfill: movimentos órfãos de transferência → 1 lote por movimento
DO $$
DECLARE
  r record;
  v_lote_id uuid;
  v_numero text;
  v_seq int;
BEGIN
  FOR r IN
    SELECT m.*
    FROM public.est_movimentos m
    WHERE m.tipo = 'transferencia'
      AND m.lote_transferencia_id IS NULL
      AND m.local_destino_id IS NOT NULL
    ORDER BY m.movimento_em
  LOOP
    SELECT COALESCE(MAX(
      CASE
        WHEN numero ~ ('^TRF-' || to_char(r.movimento_em AT TIME ZONE 'UTC', 'YYYYMMDD') || '-[0-9]+$')
        THEN NULLIF(regexp_replace(numero, '.*-', ''), '')::int
        ELSE 0
      END
    ), 0) + 1
    INTO v_seq
    FROM public.est_transferencia_lotes
    WHERE empresa_id = r.empresa_id
      AND numero LIKE 'TRF-' || to_char(r.movimento_em AT TIME ZONE 'UTC', 'YYYYMMDD') || '-%';

    v_numero := 'TRF-' || to_char(r.movimento_em AT TIME ZONE 'UTC', 'YYYYMMDD') || '-' || lpad(v_seq::text, 4, '0');

    INSERT INTO public.est_transferencia_lotes (
      empresa_id, numero, local_origem_id, local_destino_id,
      documento, observacao, status, usuario_id, movimento_em, created_at, updated_at
    ) VALUES (
      r.empresa_id, v_numero, r.local_id, r.local_destino_id,
      r.documento, r.motivo, 'concluido', r.usuario_id, r.movimento_em, r.created_at, now()
    )
    RETURNING id INTO v_lote_id;

    INSERT INTO public.est_transferencia_itens (
      empresa_id, lote_id, linha, sku_id, quantidade, status, movimento_id, created_at, updated_at
    ) VALUES (
      r.empresa_id, v_lote_id, 1, r.sku_id, r.quantidade, 'ok', r.id, r.created_at, now()
    );

    UPDATE public.est_movimentos
    SET lote_transferencia_id = v_lote_id
    WHERE id = r.id;
  END LOOP;
END $$;
