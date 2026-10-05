-- Fase 8: série unitária no estoque.
-- Lote ou série, não os dois. Cada série é uma unidade num local ou em poder de terceiro.
-- Saldo antigo (sem série) não sai, não transfere e não vai a terceiro até o inventário.

ALTER TABLE public.cad_skus
  ADD COLUMN IF NOT EXISTS controla_serie boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.cad_skus.controla_serie IS
  'Se true, cada unidade é uma série. Não combina com controla_lote. Saldo sem série fica bloqueado.';

ALTER TABLE public.cad_skus
  DROP CONSTRAINT IF EXISTS cad_skus_lote_ou_serie_chk;

ALTER TABLE public.cad_skus
  ADD CONSTRAINT cad_skus_lote_ou_serie_chk
  CHECK (NOT (controla_lote AND controla_serie));

CREATE TABLE IF NOT EXISTS public.est_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas (id) ON DELETE CASCADE,
  sku_id uuid NOT NULL REFERENCES public.cad_skus (id) ON DELETE RESTRICT,
  numero text NOT NULL,
  situacao text NOT NULL DEFAULT 'em_estoque',
  local_id uuid NULL REFERENCES public.cad_locais_estoque (id) ON DELETE RESTRICT,
  pessoa_id uuid NULL REFERENCES public.crm_leads (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT est_series_numero_chk CHECK (length(trim(numero)) > 0),
  CONSTRAINT est_series_situacao_chk CHECK (situacao IN ('em_estoque', 'em_terceiro', 'baixada')),
  CONSTRAINT est_series_empresa_sku_numero_uq UNIQUE (empresa_id, sku_id, numero)
);

CREATE INDEX IF NOT EXISTS idx_est_series_empresa_sku_situacao
  ON public.est_series (empresa_id, sku_id, situacao);

COMMENT ON TABLE public.est_series IS
  'Peça identificada. Uma série é uma unidade, num local próprio ou em poder de terceiro.';

ALTER TABLE public.est_series ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS est_series_select ON public.est_series;
CREATE POLICY est_series_select ON public.est_series
FOR SELECT TO authenticated
USING (
  (
    public.check_permission('estoque', 'view')
    OR public.check_permission('estoque_entradas', 'view')
    OR public.check_permission('estoque_retiradas', 'view')
    OR public.check_permission('estoque_transferencias', 'view')
    OR public.check_permission('estoque_ajustes', 'view')
    OR public.check_permission('estoque_remessas', 'view')
    OR public.check_permission('estoque_requisicoes', 'view')
  )
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_series.empresa_id)
  )
);

GRANT SELECT ON public.est_series TO authenticated, service_role;

ALTER TABLE public.est_saldos
  ADD COLUMN IF NOT EXISTS serie_id uuid NULL REFERENCES public.est_series (id) ON DELETE RESTRICT;

ALTER TABLE public.est_saldos
  DROP CONSTRAINT IF EXISTS est_saldos_empresa_sku_local_lote_uq;

ALTER TABLE public.est_saldos
  DROP CONSTRAINT IF EXISTS est_saldos_empresa_sku_local_lote_serie_uq;

ALTER TABLE public.est_saldos
  ADD CONSTRAINT est_saldos_empresa_sku_local_lote_serie_uq
  UNIQUE NULLS NOT DISTINCT (empresa_id, sku_id, local_id, lote_produto_id, serie_id);

CREATE INDEX IF NOT EXISTS idx_est_saldos_empresa_serie
  ON public.est_saldos (empresa_id, serie_id)
  WHERE serie_id IS NOT NULL;

ALTER TABLE public.est_movimentos
  ADD COLUMN IF NOT EXISTS serie_id uuid NULL REFERENCES public.est_series (id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_est_movimentos_empresa_serie
  ON public.est_movimentos (empresa_id, serie_id)
  WHERE serie_id IS NOT NULL;

ALTER TABLE public.est_saldos_poder_terceiros
  ADD COLUMN IF NOT EXISTS serie_id uuid NULL REFERENCES public.est_series (id) ON DELETE RESTRICT;

DROP INDEX IF EXISTS public.uq_est_saldos_poder_empresa_pessoa_sku_remessa_lote;

CREATE UNIQUE INDEX uq_est_saldos_poder_empresa_pessoa_sku_remessa_lote_serie
  ON public.est_saldos_poder_terceiros (
    empresa_id, pessoa_id, sku_id, remessa_id, lote_produto_id, serie_id
  ) NULLS NOT DISTINCT;

ALTER TABLE public.est_entrada_itens
  ADD COLUMN IF NOT EXISTS numero_serie text NULL,
  ADD COLUMN IF NOT EXISTS serie_id uuid NULL REFERENCES public.est_series (id) ON DELETE SET NULL;

ALTER TABLE public.est_retirada_itens
  ADD COLUMN IF NOT EXISTS serie_id uuid NULL REFERENCES public.est_series (id) ON DELETE SET NULL;

ALTER TABLE public.est_ajuste_itens
  ADD COLUMN IF NOT EXISTS numero_serie text NULL,
  ADD COLUMN IF NOT EXISTS serie_id uuid NULL REFERENCES public.est_series (id) ON DELETE SET NULL;

ALTER TABLE public.est_transferencia_itens
  ADD COLUMN IF NOT EXISTS serie_id uuid NULL REFERENCES public.est_series (id) ON DELETE SET NULL;

ALTER TABLE public.est_remessa_itens
  ADD COLUMN IF NOT EXISTS serie_id uuid NULL REFERENCES public.est_series (id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- Resolve a série do movimento. Entrada cria o número. Saída exige a peça.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.est_resolver_serie_movimento(
  p_empresa_id uuid,
  p_sku_id uuid,
  p_tipo text,
  p_local_id uuid,
  p_quantidade numeric,
  p_ajuste_sinal text,
  p_pessoa_id uuid,
  p_serie_id uuid,
  p_numero_serie text
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_controla boolean;
  v_id uuid;
  v_sit text;
  v_local uuid;
  v_pessoa uuid;
  v_sku uuid;
  v_emp uuid;
  v_numero text := NULLIF(btrim(COALESCE(p_numero_serie, '')), '');
  v_entrada boolean;
BEGIN
  SELECT COALESCE(s.controla_serie, false)
  INTO v_controla
  FROM public.cad_skus s
  WHERE s.id = p_sku_id AND s.empresa_id = p_empresa_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SKU_INVALIDO: SKU não encontrado no tenant.';
  END IF;

  IF NOT v_controla THEN
    IF p_serie_id IS NOT NULL OR v_numero IS NOT NULL THEN
      RAISE EXCEPTION 'SERIE_NAO_PERMITIDA: SKU não controla série.';
    END IF;
    RETURN NULL;
  END IF;

  IF p_quantidade IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'SERIE_UNIDADE: cada série é uma unidade. Informe quantidade 1.';
  END IF;

  v_entrada := p_tipo = 'entrada' OR (p_tipo = 'ajuste' AND p_ajuste_sinal = 'positivo');

  IF v_entrada THEN
    IF p_serie_id IS NULL AND v_numero IS NULL THEN
      RAISE EXCEPTION 'SERIE_OBRIGATORIA: informe o número de série desta unidade.';
    END IF;
    IF p_serie_id IS NOT NULL THEN
      SELECT id, situacao, sku_id, empresa_id
      INTO v_id, v_sit, v_sku, v_emp
      FROM public.est_series
      WHERE id = p_serie_id
      FOR UPDATE;
      IF NOT FOUND OR v_emp IS DISTINCT FROM p_empresa_id OR v_sku IS DISTINCT FROM p_sku_id THEN
        RAISE EXCEPTION 'SERIE_INVALIDA: série não pertence a este SKU.';
      END IF;
      IF v_sit <> 'baixada' THEN
        RAISE EXCEPTION 'SERIE_JA_EM_USO: esta série já está no estoque ou em terceiro.';
      END IF;
      RETURN v_id;
    END IF;

    SELECT id, situacao
    INTO v_id, v_sit
    FROM public.est_series
    WHERE empresa_id = p_empresa_id AND sku_id = p_sku_id AND numero = v_numero
    FOR UPDATE;
    IF FOUND THEN
      IF v_sit <> 'baixada' THEN
        RAISE EXCEPTION 'SERIE_JA_EM_USO: o número % já identifica uma peça em estoque ou em terceiro.', v_numero;
      END IF;
      RETURN v_id;
    END IF;

    BEGIN
      INSERT INTO public.est_series (empresa_id, sku_id, numero, situacao, local_id)
      VALUES (p_empresa_id, p_sku_id, v_numero, 'em_estoque', p_local_id)
      RETURNING id INTO v_id;
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'SERIE_JA_EM_USO: o número % já identifica uma peça deste SKU.', v_numero;
    END;
    RETURN v_id;
  END IF;

  IF p_serie_id IS NULL THEN
    RAISE EXCEPTION 'SERIE_OBRIGATORIA: o saldo sem série deste SKU está bloqueado. Identifique a peça ou faça o inventário das séries.';
  END IF;

  SELECT id, situacao, local_id, pessoa_id, sku_id, empresa_id
  INTO v_id, v_sit, v_local, v_pessoa, v_sku, v_emp
  FROM public.est_series
  WHERE id = p_serie_id
  FOR UPDATE;
  IF NOT FOUND OR v_emp IS DISTINCT FROM p_empresa_id OR v_sku IS DISTINCT FROM p_sku_id THEN
    RAISE EXCEPTION 'SERIE_INVALIDA: série não pertence a este SKU.';
  END IF;

  IF p_tipo IN ('saida', 'transferencia', 'remessa_saida')
     OR (p_tipo = 'ajuste' AND p_ajuste_sinal = 'negativo') THEN
    IF v_sit <> 'em_estoque' OR v_local IS DISTINCT FROM p_local_id THEN
      RAISE EXCEPTION 'SERIE_FORA_DO_LOCAL: esta série não está neste local.';
    END IF;
  ELSIF p_tipo IN ('remessa_retorno', 'remessa_baixa') THEN
    IF v_sit <> 'em_terceiro' THEN
      RAISE EXCEPTION 'SERIE_FORA_DE_TERCEIRO: esta série não está em poder de terceiro.';
    END IF;
    IF p_pessoa_id IS NOT NULL AND v_pessoa IS DISTINCT FROM p_pessoa_id THEN
      RAISE EXCEPTION 'SERIE_OUTRO_TERCEIRO: esta série está com outro destinatário.';
    END IF;
  ELSE
    RAISE EXCEPTION 'SERIE_TIPO_INVALIDO: o tipo % não identifica série.', p_tipo;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.est_resolver_serie_movimento(
  uuid, uuid, text, uuid, numeric, text, uuid, uuid, text
) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.est_aplicar_situacao_serie(
  p_serie_id uuid,
  p_tipo text,
  p_ajuste_sinal text,
  p_local_id uuid,
  p_local_destino_id uuid,
  p_pessoa_id uuid
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF p_serie_id IS NULL THEN
    RETURN;
  END IF;

  IF p_tipo = 'entrada' OR (p_tipo = 'ajuste' AND p_ajuste_sinal = 'positivo') OR p_tipo = 'remessa_retorno' THEN
    UPDATE public.est_series
    SET situacao = 'em_estoque', local_id = p_local_id, pessoa_id = NULL, updated_at = now()
    WHERE id = p_serie_id;
  ELSIF p_tipo = 'transferencia' THEN
    UPDATE public.est_series
    SET situacao = 'em_estoque', local_id = p_local_destino_id, pessoa_id = NULL, updated_at = now()
    WHERE id = p_serie_id;
  ELSIF p_tipo = 'remessa_saida' THEN
    UPDATE public.est_series
    SET situacao = 'em_terceiro', local_id = NULL, pessoa_id = p_pessoa_id, updated_at = now()
    WHERE id = p_serie_id;
  ELSIF p_tipo IN ('saida', 'remessa_baixa') OR (p_tipo = 'ajuste' AND p_ajuste_sinal = 'negativo') THEN
    UPDATE public.est_series
    SET situacao = 'baixada', local_id = NULL, pessoa_id = NULL, updated_at = now()
    WHERE id = p_serie_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.est_aplicar_situacao_serie(uuid, text, text, uuid, uuid, uuid) FROM PUBLIC;

DROP FUNCTION IF EXISTS public.est_registrar_movimento_atomico(
  uuid, text, uuid, uuid, numeric, uuid, text, uuid, text,
  uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, uuid, boolean,
  uuid, numeric, uuid
);

CREATE OR REPLACE FUNCTION public.est_registrar_movimento_atomico(
  p_empresa_id uuid,
  p_tipo text,
  p_sku_id uuid,
  p_local_id uuid,
  p_quantidade numeric,
  p_local_destino_id uuid DEFAULT NULL,
  p_documento text DEFAULT NULL,
  p_pessoa_id uuid DEFAULT NULL,
  p_origem text DEFAULT NULL,
  p_lote_entrada_id uuid DEFAULT NULL,
  p_lote_retirada_id uuid DEFAULT NULL,
  p_lote_ajuste_id uuid DEFAULT NULL,
  p_lote_remessa_id uuid DEFAULT NULL,
  p_remessa_item_id uuid DEFAULT NULL,
  p_requisicao_id uuid DEFAULT NULL,
  p_ajuste_sinal text DEFAULT NULL,
  p_motivo_codigo text DEFAULT NULL,
  p_motivo text DEFAULT NULL,
  p_usuario_id uuid DEFAULT NULL,
  p_permitir_saldo_negativo boolean DEFAULT FALSE,
  p_sku_poder_id uuid DEFAULT NULL,
  p_quantidade_poder numeric DEFAULT NULL,
  p_lote_produto_id uuid DEFAULT NULL,
  p_serie_id uuid DEFAULT NULL,
  p_numero_serie text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_auth_id uuid := auth.uid();
  v_usuario_resolved_id uuid := p_usuario_id;
  v_saldo_atual numeric := 0;
  v_saldo_terceiro numeric := 0;
  v_movimento_id uuid;
  v_movimento_par_id uuid;
  v_sku_poder uuid;
  v_qtd_poder numeric;
  v_local_terceiros uuid;
  v_locais jsonb;
  v_lote uuid := p_lote_produto_id;
  v_serie uuid;
BEGIN
  IF auth.role() = 'authenticated' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_user_id = v_user_auth_id
        AND (u.role_global = 'superadmin' OR u.empresa_id = p_empresa_id)
        AND COALESCE(u.ativo, true)
    ) THEN
      RAISE EXCEPTION 'ACESSO_NEGADO: Usuário não tem permissão para operar no tenant informado.';
    END IF;
    IF v_usuario_resolved_id IS NULL THEN
      SELECT u.id INTO v_usuario_resolved_id FROM public.usuarios u
      WHERE u.auth_user_id = v_user_auth_id LIMIT 1;
    END IF;
  END IF;

  IF p_empresa_id IS NULL OR p_sku_id IS NULL THEN
    RAISE EXCEPTION 'PARAMETROS_OBRIGATORIOS: empresa_id e sku_id são obrigatórios.';
  END IF;
  IF p_local_id IS NULL THEN
    RAISE EXCEPTION 'PARAMETROS_OBRIGATORIOS: local_id é obrigatório para o tipo %.', p_tipo;
  END IF;
  IF p_quantidade IS NULL OR p_quantidade <= 0 THEN
    RAISE EXCEPTION 'QUANTIDADE_INVALIDA: A quantidade movimentada deve ser maior que zero (% informado).', p_quantidade;
  END IF;
  IF p_tipo NOT IN (
    'entrada', 'saida', 'transferencia', 'ajuste',
    'remessa_saida', 'remessa_entrada_terceiros', 'remessa_saida_terceiros',
    'remessa_retorno', 'remessa_baixa'
  ) THEN
    RAISE EXCEPTION 'TIPO_INVALIDO: Tipo de movimentação "%" é inválido.', p_tipo;
  END IF;

  PERFORM public.est_validar_lote_produto(p_empresa_id, p_sku_id, v_lote);
  v_serie := public.est_resolver_serie_movimento(
    p_empresa_id, p_sku_id, p_tipo, p_local_id, p_quantidade,
    p_ajuste_sinal, p_pessoa_id, p_serie_id, p_numero_serie
  );

  IF p_tipo = 'transferencia' THEN
    IF p_local_destino_id IS NULL THEN
      RAISE EXCEPTION 'LOCAL_DESTINO_OBRIGATORIO: Transferência exige local_destino_id.';
    END IF;
    IF p_local_id = p_local_destino_id THEN
      RAISE EXCEPTION 'LOCAIS_IDENTICOS: Local de origem e destino da transferência devem ser diferentes.';
    END IF;
  END IF;
  IF p_tipo = 'ajuste' AND (p_ajuste_sinal IS NULL OR p_ajuste_sinal NOT IN ('positivo', 'negativo')) THEN
    RAISE EXCEPTION 'SINAL_AJUSTE_OBRIGATORIO: Ajuste de estoque exige sinal "positivo" ou "negativo".';
  END IF;
  IF p_tipo IN (
    'remessa_saida', 'remessa_entrada_terceiros', 'remessa_saida_terceiros',
    'remessa_retorno', 'remessa_baixa'
  ) AND p_pessoa_id IS NULL THEN
    RAISE EXCEPTION 'PESSOA_OBRIGATORIA: Remessa a terceiros exige pessoa_id.';
  END IF;
  IF p_tipo IN ('remessa_saida', 'remessa_retorno', 'remessa_baixa') AND p_lote_remessa_id IS NULL THEN
    RAISE EXCEPTION 'REMESSA_OBRIGATORIA: lote_remessa_id é obrigatório para %.', p_tipo;
  END IF;

  v_sku_poder := COALESCE(p_sku_poder_id, p_sku_id);
  v_qtd_poder := COALESCE(p_quantidade_poder, p_quantidade);
  IF p_tipo = 'remessa_retorno' AND (v_qtd_poder IS NULL OR v_qtd_poder <= 0) THEN
    RAISE EXCEPTION 'QUANTIDADE_INVALIDA: quantidade_poder do retorno deve ser maior que zero.';
  END IF;
  IF v_serie IS NOT NULL AND p_tipo = 'remessa_retorno' AND v_sku_poder IS DISTINCT FROM p_sku_id THEN
    RAISE EXCEPTION 'SERIE_MESMO_SKU: o retorno da série volta no mesmo SKU.';
  END IF;
  IF v_serie IS NOT NULL AND p_tipo = 'remessa_retorno' AND v_qtd_poder IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'SERIE_UNIDADE: cada série é uma unidade.';
  END IF;
  IF p_tipo IN ('remessa_saida', 'remessa_retorno', 'remessa_baixa') THEN
    v_locais := public.est_garantir_locais_padrao(p_empresa_id);
    v_local_terceiros := (v_locais->>'terceiros_id')::uuid;
    IF v_local_terceiros IS NULL THEN
      RAISE EXCEPTION 'LOCAL_TERCEIROS_AUSENTE: Não foi possível garantir o local TERCEIROS.';
    END IF;
  END IF;

  IF p_tipo IN ('remessa_retorno', 'remessa_baixa') AND v_sku_poder IS DISTINCT FROM p_sku_id THEN
    PERFORM public.est_validar_lote_produto(p_empresa_id, v_sku_poder, v_lote);
  END IF;

  CASE p_tipo
    WHEN 'entrada' THEN
      INSERT INTO public.est_saldos (empresa_id, sku_id, local_id, lote_produto_id, serie_id, quantidade, updated_at)
      VALUES (p_empresa_id, p_sku_id, p_local_id, v_lote, v_serie, p_quantidade, now())
      ON CONFLICT (empresa_id, sku_id, local_id, lote_produto_id, serie_id)
      DO UPDATE SET quantidade = est_saldos.quantidade + EXCLUDED.quantidade, updated_at = now();

    WHEN 'saida' THEN
      SELECT s.quantidade INTO v_saldo_atual FROM public.est_saldos s
      WHERE s.empresa_id = p_empresa_id AND s.sku_id = p_sku_id AND s.local_id = p_local_id
        AND s.lote_produto_id IS NOT DISTINCT FROM v_lote
        AND s.serie_id IS NOT DISTINCT FROM v_serie
      FOR UPDATE;
      v_saldo_atual := COALESCE(v_saldo_atual, 0);
      IF v_saldo_atual < p_quantidade AND NOT p_permitir_saldo_negativo THEN
        RAISE EXCEPTION 'SALDO_INSUFICIENTE: Saldo disponível (%) é insuficiente para saída de %.', v_saldo_atual, p_quantidade;
      END IF;
      UPDATE public.est_saldos SET quantidade = quantidade - p_quantidade, updated_at = now()
      WHERE empresa_id = p_empresa_id AND sku_id = p_sku_id AND local_id = p_local_id
        AND lote_produto_id IS NOT DISTINCT FROM v_lote
        AND serie_id IS NOT DISTINCT FROM v_serie;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'SALDO_INSUFICIENTE: Não há posição de saldo no local informado para saída de %.', p_quantidade;
      END IF;

    WHEN 'ajuste' THEN
      IF p_ajuste_sinal = 'positivo' THEN
        INSERT INTO public.est_saldos (empresa_id, sku_id, local_id, lote_produto_id, serie_id, quantidade, updated_at)
        VALUES (p_empresa_id, p_sku_id, p_local_id, v_lote, v_serie, p_quantidade, now())
        ON CONFLICT (empresa_id, sku_id, local_id, lote_produto_id, serie_id)
        DO UPDATE SET quantidade = est_saldos.quantidade + EXCLUDED.quantidade, updated_at = now();
      ELSE
        SELECT s.quantidade INTO v_saldo_atual FROM public.est_saldos s
        WHERE s.empresa_id = p_empresa_id AND s.sku_id = p_sku_id AND s.local_id = p_local_id
          AND s.lote_produto_id IS NOT DISTINCT FROM v_lote
          AND s.serie_id IS NOT DISTINCT FROM v_serie
        FOR UPDATE;
        v_saldo_atual := COALESCE(v_saldo_atual, 0);
        IF v_saldo_atual < p_quantidade AND NOT p_permitir_saldo_negativo THEN
          RAISE EXCEPTION 'SALDO_INSUFICIENTE: Saldo disponível (%) insuficiente para ajuste negativo de %.', v_saldo_atual, p_quantidade;
        END IF;
        UPDATE public.est_saldos SET quantidade = quantidade - p_quantidade, updated_at = now()
        WHERE empresa_id = p_empresa_id AND sku_id = p_sku_id AND local_id = p_local_id
          AND lote_produto_id IS NOT DISTINCT FROM v_lote
          AND serie_id IS NOT DISTINCT FROM v_serie;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'SALDO_INSUFICIENTE: Não há posição de saldo no local para ajuste negativo de %.', p_quantidade;
        END IF;
      END IF;

    WHEN 'transferencia' THEN
      SELECT s.quantidade INTO v_saldo_atual FROM public.est_saldos s
      WHERE s.empresa_id = p_empresa_id AND s.sku_id = p_sku_id AND s.local_id = p_local_id
        AND s.lote_produto_id IS NOT DISTINCT FROM v_lote
        AND s.serie_id IS NOT DISTINCT FROM v_serie
      FOR UPDATE;
      v_saldo_atual := COALESCE(v_saldo_atual, 0);
      IF v_saldo_atual < p_quantidade AND NOT p_permitir_saldo_negativo THEN
        RAISE EXCEPTION 'SALDO_INSUFICIENTE: Saldo de origem (%) insuficiente para transferir %.', v_saldo_atual, p_quantidade;
      END IF;
      UPDATE public.est_saldos SET quantidade = quantidade - p_quantidade, updated_at = now()
      WHERE empresa_id = p_empresa_id AND sku_id = p_sku_id AND local_id = p_local_id
        AND lote_produto_id IS NOT DISTINCT FROM v_lote
        AND serie_id IS NOT DISTINCT FROM v_serie;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'SALDO_INSUFICIENTE: Não há posição de saldo na origem para transferir %.', p_quantidade;
      END IF;
      INSERT INTO public.est_saldos (empresa_id, sku_id, local_id, lote_produto_id, serie_id, quantidade, updated_at)
      VALUES (p_empresa_id, p_sku_id, p_local_destino_id, v_lote, v_serie, p_quantidade, now())
      ON CONFLICT (empresa_id, sku_id, local_id, lote_produto_id, serie_id)
      DO UPDATE SET quantidade = est_saldos.quantidade + EXCLUDED.quantidade, updated_at = now();

    WHEN 'remessa_saida' THEN
      SELECT s.quantidade INTO v_saldo_atual FROM public.est_saldos s
      WHERE s.empresa_id = p_empresa_id AND s.sku_id = p_sku_id AND s.local_id = p_local_id
        AND s.lote_produto_id IS NOT DISTINCT FROM v_lote
        AND s.serie_id IS NOT DISTINCT FROM v_serie
      FOR UPDATE;
      v_saldo_atual := COALESCE(v_saldo_atual, 0);
      IF v_saldo_atual < p_quantidade AND NOT p_permitir_saldo_negativo THEN
        RAISE EXCEPTION 'SALDO_INSUFICIENTE: Saldo no local (%) insuficiente para remessa de %.', v_saldo_atual, p_quantidade;
      END IF;
      UPDATE public.est_saldos SET quantidade = quantidade - p_quantidade, updated_at = now()
      WHERE empresa_id = p_empresa_id AND sku_id = p_sku_id AND local_id = p_local_id
        AND lote_produto_id IS NOT DISTINCT FROM v_lote
        AND serie_id IS NOT DISTINCT FROM v_serie;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'SALDO_INSUFICIENTE: Sem posição no local para remessa de %.', p_quantidade;
      END IF;

      INSERT INTO public.est_saldos (empresa_id, sku_id, local_id, lote_produto_id, serie_id, quantidade, updated_at)
      VALUES (p_empresa_id, p_sku_id, v_local_terceiros, v_lote, v_serie, p_quantidade, now())
      ON CONFLICT (empresa_id, sku_id, local_id, lote_produto_id, serie_id)
      DO UPDATE SET quantidade = est_saldos.quantidade + EXCLUDED.quantidade, updated_at = now();

      INSERT INTO public.est_saldos_poder_terceiros (
        empresa_id, pessoa_id, sku_id, remessa_id, lote_produto_id, serie_id, quantidade, updated_at
      ) VALUES (
        p_empresa_id, p_pessoa_id, p_sku_id, p_lote_remessa_id, v_lote, v_serie, p_quantidade, now()
      )
      ON CONFLICT (empresa_id, pessoa_id, sku_id, remessa_id, lote_produto_id, serie_id)
      DO UPDATE SET
        quantidade = est_saldos_poder_terceiros.quantidade + EXCLUDED.quantidade,
        updated_at = now();

      PERFORM public.est_aplicar_situacao_serie(
        v_serie, p_tipo, p_ajuste_sinal, p_local_id, p_local_destino_id, p_pessoa_id
      );

      INSERT INTO public.est_movimentos (
        empresa_id, tipo, sku_id, local_id, quantidade, documento, pessoa_id, origem,
        lote_remessa_id, remessa_item_id, motivo_codigo, motivo, usuario_id, movimento_em,
        lote_produto_id, serie_id
      ) VALUES (
        p_empresa_id, 'remessa_saida', p_sku_id, p_local_id, p_quantidade, p_documento, p_pessoa_id, COALESCE(p_origem, 'remessa'),
        p_lote_remessa_id, p_remessa_item_id, p_motivo_codigo, p_motivo, v_usuario_resolved_id, now(),
        v_lote, v_serie
      ) RETURNING id INTO v_movimento_id;

      INSERT INTO public.est_movimentos (
        empresa_id, tipo, sku_id, local_id, quantidade, documento, pessoa_id, origem,
        lote_remessa_id, remessa_item_id, motivo_codigo, motivo, usuario_id, movimento_em,
        lote_produto_id, serie_id
      ) VALUES (
        p_empresa_id, 'remessa_entrada_terceiros', p_sku_id, v_local_terceiros, p_quantidade, p_documento, p_pessoa_id, COALESCE(p_origem, 'remessa'),
        p_lote_remessa_id, p_remessa_item_id, p_motivo_codigo,
        COALESCE(p_motivo, 'Entrada em poder de terceiros'), v_usuario_resolved_id, now(),
        v_lote, v_serie
      ) RETURNING id INTO v_movimento_par_id;

      RETURN jsonb_build_object(
        'success', true, 'movimento_id', v_movimento_id, 'movimento_par_id', v_movimento_par_id,
        'empresa_id', p_empresa_id, 'sku_id', p_sku_id, 'local_id', p_local_id,
        'local_terceiros_id', v_local_terceiros, 'quantidade', p_quantidade, 'tipo', p_tipo,
        'lote_produto_id', v_lote, 'serie_id', v_serie
      );

    WHEN 'remessa_retorno' THEN
      SELECT s.quantidade INTO v_saldo_atual FROM public.est_saldos s
      WHERE s.empresa_id = p_empresa_id AND s.sku_id = v_sku_poder AND s.local_id = v_local_terceiros
        AND s.lote_produto_id IS NOT DISTINCT FROM v_lote
        AND s.serie_id IS NOT DISTINCT FROM v_serie
      FOR UPDATE;
      v_saldo_atual := COALESCE(v_saldo_atual, 0);
      IF v_saldo_atual < v_qtd_poder AND NOT p_permitir_saldo_negativo THEN
        RAISE EXCEPTION 'SALDO_INSUFICIENTE: Saldo em TERCEIROS (%) insuficiente para retorno de %.', v_saldo_atual, v_qtd_poder;
      END IF;
      UPDATE public.est_saldos SET quantidade = quantidade - v_qtd_poder, updated_at = now()
      WHERE empresa_id = p_empresa_id AND sku_id = v_sku_poder AND local_id = v_local_terceiros
        AND lote_produto_id IS NOT DISTINCT FROM v_lote
        AND serie_id IS NOT DISTINCT FROM v_serie;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'SALDO_INSUFICIENTE: Sem posição em TERCEIROS para retorno de %.', v_qtd_poder;
      END IF;

      SELECT t.quantidade INTO v_saldo_terceiro FROM public.est_saldos_poder_terceiros t
      WHERE t.empresa_id = p_empresa_id AND t.pessoa_id = p_pessoa_id
        AND t.sku_id = v_sku_poder AND t.remessa_id = p_lote_remessa_id
        AND t.lote_produto_id IS NOT DISTINCT FROM v_lote
        AND t.serie_id IS NOT DISTINCT FROM v_serie
      FOR UPDATE;
      v_saldo_terceiro := COALESCE(v_saldo_terceiro, 0);
      IF v_saldo_terceiro < v_qtd_poder THEN
        RAISE EXCEPTION 'SALDO_TERCEIRO_INSUFICIENTE: Poder (%) < retorno %.', v_saldo_terceiro, v_qtd_poder;
      END IF;
      UPDATE public.est_saldos_poder_terceiros
      SET quantidade = quantidade - v_qtd_poder, updated_at = now()
      WHERE empresa_id = p_empresa_id AND pessoa_id = p_pessoa_id
        AND sku_id = v_sku_poder AND remessa_id = p_lote_remessa_id
        AND lote_produto_id IS NOT DISTINCT FROM v_lote
        AND serie_id IS NOT DISTINCT FROM v_serie;

      INSERT INTO public.est_saldos (empresa_id, sku_id, local_id, lote_produto_id, serie_id, quantidade, updated_at)
      VALUES (p_empresa_id, p_sku_id, p_local_id, v_lote, v_serie, p_quantidade, now())
      ON CONFLICT (empresa_id, sku_id, local_id, lote_produto_id, serie_id)
      DO UPDATE SET quantidade = est_saldos.quantidade + EXCLUDED.quantidade, updated_at = now();

      PERFORM public.est_aplicar_situacao_serie(
        v_serie, p_tipo, p_ajuste_sinal, p_local_id, p_local_destino_id, p_pessoa_id
      );

      INSERT INTO public.est_movimentos (
        empresa_id, tipo, sku_id, local_id, quantidade, documento, pessoa_id, origem,
        lote_remessa_id, remessa_item_id, motivo, usuario_id, movimento_em,
        sku_poder_id, quantidade_poder, lote_produto_id, serie_id
      ) VALUES (
        p_empresa_id, 'remessa_saida_terceiros', v_sku_poder, v_local_terceiros, v_qtd_poder,
        p_documento, p_pessoa_id, COALESCE(p_origem, 'remessa'),
        p_lote_remessa_id, p_remessa_item_id,
        'Saída de TERCEIROS (retorno remessa)', v_usuario_resolved_id, now(),
        CASE WHEN v_sku_poder IS DISTINCT FROM p_sku_id THEN v_sku_poder ELSE NULL END,
        CASE WHEN v_qtd_poder IS DISTINCT FROM p_quantidade THEN v_qtd_poder ELSE NULL END,
        v_lote, v_serie
      ) RETURNING id INTO v_movimento_par_id;

      INSERT INTO public.est_movimentos (
        empresa_id, tipo, sku_id, local_id, quantidade, documento, pessoa_id, origem,
        lote_remessa_id, remessa_item_id, motivo, usuario_id, movimento_em,
        sku_poder_id, quantidade_poder, lote_produto_id, serie_id
      ) VALUES (
        p_empresa_id, 'remessa_retorno', p_sku_id, p_local_id, p_quantidade,
        p_documento, p_pessoa_id, COALESCE(p_origem, 'remessa'),
        p_lote_remessa_id, p_remessa_item_id, p_motivo, v_usuario_resolved_id, now(),
        CASE WHEN v_sku_poder IS DISTINCT FROM p_sku_id OR v_qtd_poder IS DISTINCT FROM p_quantidade THEN v_sku_poder ELSE NULL END,
        CASE WHEN v_sku_poder IS DISTINCT FROM p_sku_id OR v_qtd_poder IS DISTINCT FROM p_quantidade THEN v_qtd_poder ELSE NULL END,
        v_lote, v_serie
      ) RETURNING id INTO v_movimento_id;

      RETURN jsonb_build_object(
        'success', true, 'movimento_id', v_movimento_id, 'movimento_par_id', v_movimento_par_id,
        'empresa_id', p_empresa_id, 'sku_id', p_sku_id, 'sku_poder_id', v_sku_poder,
        'local_id', p_local_id, 'local_terceiros_id', v_local_terceiros,
        'quantidade', p_quantidade, 'quantidade_poder', v_qtd_poder, 'tipo', p_tipo,
        'lote_produto_id', v_lote, 'serie_id', v_serie
      );

    WHEN 'remessa_baixa' THEN
      SELECT s.quantidade INTO v_saldo_atual FROM public.est_saldos s
      WHERE s.empresa_id = p_empresa_id AND s.sku_id = p_sku_id AND s.local_id = v_local_terceiros
        AND s.lote_produto_id IS NOT DISTINCT FROM v_lote
        AND s.serie_id IS NOT DISTINCT FROM v_serie
      FOR UPDATE;
      v_saldo_atual := COALESCE(v_saldo_atual, 0);
      IF v_saldo_atual < p_quantidade AND NOT p_permitir_saldo_negativo THEN
        RAISE EXCEPTION 'SALDO_INSUFICIENTE: Saldo em TERCEIROS (%) insuficiente para baixa de %.', v_saldo_atual, p_quantidade;
      END IF;
      UPDATE public.est_saldos SET quantidade = quantidade - p_quantidade, updated_at = now()
      WHERE empresa_id = p_empresa_id AND sku_id = p_sku_id AND local_id = v_local_terceiros
        AND lote_produto_id IS NOT DISTINCT FROM v_lote
        AND serie_id IS NOT DISTINCT FROM v_serie;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'SALDO_INSUFICIENTE: Sem posição em TERCEIROS para baixa de %.', p_quantidade;
      END IF;

      SELECT t.quantidade INTO v_saldo_terceiro FROM public.est_saldos_poder_terceiros t
      WHERE t.empresa_id = p_empresa_id AND t.pessoa_id = p_pessoa_id
        AND t.sku_id = p_sku_id AND t.remessa_id = p_lote_remessa_id
        AND t.lote_produto_id IS NOT DISTINCT FROM v_lote
        AND t.serie_id IS NOT DISTINCT FROM v_serie
      FOR UPDATE;
      v_saldo_terceiro := COALESCE(v_saldo_terceiro, 0);
      IF v_saldo_terceiro < p_quantidade THEN
        RAISE EXCEPTION 'SALDO_TERCEIRO_INSUFICIENTE: Poder (%) < baixa %.', v_saldo_terceiro, p_quantidade;
      END IF;
      UPDATE public.est_saldos_poder_terceiros
      SET quantidade = quantidade - p_quantidade, updated_at = now()
      WHERE empresa_id = p_empresa_id AND pessoa_id = p_pessoa_id
        AND sku_id = p_sku_id AND remessa_id = p_lote_remessa_id
        AND lote_produto_id IS NOT DISTINCT FROM v_lote
        AND serie_id IS NOT DISTINCT FROM v_serie;

      PERFORM public.est_aplicar_situacao_serie(
        v_serie, p_tipo, p_ajuste_sinal, p_local_id, p_local_destino_id, p_pessoa_id
      );

      INSERT INTO public.est_movimentos (
        empresa_id, tipo, sku_id, local_id, quantidade, documento, pessoa_id, origem,
        lote_remessa_id, remessa_item_id, motivo_codigo, motivo, usuario_id, movimento_em,
        lote_produto_id, serie_id
      ) VALUES (
        p_empresa_id, 'remessa_baixa', p_sku_id, v_local_terceiros, p_quantidade,
        p_documento, p_pessoa_id, COALESCE(p_origem, 'remessa'),
        p_lote_remessa_id, p_remessa_item_id, p_motivo_codigo, p_motivo, v_usuario_resolved_id, now(),
        v_lote, v_serie
      ) RETURNING id INTO v_movimento_id;

      RETURN jsonb_build_object(
        'success', true, 'movimento_id', v_movimento_id,
        'empresa_id', p_empresa_id, 'sku_id', p_sku_id,
        'local_id', v_local_terceiros, 'quantidade', p_quantidade, 'tipo', p_tipo,
        'lote_produto_id', v_lote, 'serie_id', v_serie
      );

    ELSE
      RAISE EXCEPTION 'TIPO_INVALIDO: %', p_tipo;
  END CASE;

  PERFORM public.est_aplicar_situacao_serie(
    v_serie, p_tipo, p_ajuste_sinal, p_local_id, p_local_destino_id, p_pessoa_id
  );

  INSERT INTO public.est_movimentos (
    empresa_id, tipo, sku_id, local_id, local_destino_id, quantidade, documento, pessoa_id, origem,
    lote_entrada_id, lote_retirada_id, lote_ajuste_id, lote_remessa_id, remessa_item_id, requisicao_id,
    ajuste_sinal, motivo_codigo, motivo, usuario_id, movimento_em, lote_produto_id, serie_id
  ) VALUES (
    p_empresa_id, p_tipo, p_sku_id, p_local_id, p_local_destino_id, p_quantidade, p_documento, p_pessoa_id, p_origem,
    p_lote_entrada_id, p_lote_retirada_id, p_lote_ajuste_id, p_lote_remessa_id, p_remessa_item_id, p_requisicao_id,
    p_ajuste_sinal, p_motivo_codigo, p_motivo, v_usuario_resolved_id, now(), v_lote, v_serie
  ) RETURNING id INTO v_movimento_id;

  RETURN jsonb_build_object(
    'success', true, 'movimento_id', v_movimento_id,
    'empresa_id', p_empresa_id, 'sku_id', p_sku_id,
    'local_id', p_local_id, 'local_destino_id', p_local_destino_id,
    'quantidade', p_quantidade, 'tipo', p_tipo, 'lote_produto_id', v_lote, 'serie_id', v_serie
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.est_registrar_movimento_atomico(
  uuid, text, uuid, uuid, numeric, uuid, text, uuid, text,
  uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, uuid, boolean,
  uuid, numeric, uuid, uuid, text
) TO authenticated, service_role;

-- Inventário: tira 1 do saldo sem série e dá um número à peça. A quantidade do local não muda.
CREATE OR REPLACE FUNCTION public.est_atribuir_serie_saldo(
  p_empresa_id uuid,
  p_sku_id uuid,
  p_local_id uuid,
  p_numero text,
  p_usuario_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_auth_id uuid := auth.uid();
  v_usuario_id uuid := p_usuario_id;
  v_controla boolean;
  v_lote boolean;
  v_qtd numeric;
  v_numero text := NULLIF(btrim(COALESCE(p_numero, '')), '');
  v_serie uuid;
  v_sit text;
BEGIN
  IF auth.role() = 'authenticated' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_user_id = v_user_auth_id
        AND (u.role_global = 'superadmin' OR u.empresa_id = p_empresa_id)
        AND COALESCE(u.ativo, true)
    ) THEN
      RAISE EXCEPTION 'ACESSO_NEGADO: Usuário não tem permissão para operar no tenant informado.';
    END IF;
    IF NOT (
      public.check_permission('estoque_ajustes', 'create')
      OR public.check_permission('estoque', 'edit')
    ) THEN
      RAISE EXCEPTION 'ACESSO_NEGADO: sem permissão para inventariar série.';
    END IF;
    IF v_usuario_id IS NULL THEN
      SELECT u.id INTO v_usuario_id FROM public.usuarios u
      WHERE u.auth_user_id = v_user_auth_id LIMIT 1;
    END IF;
  END IF;

  IF v_numero IS NULL THEN
    RAISE EXCEPTION 'SERIE_OBRIGATORIA: informe o número de série.';
  END IF;

  SELECT COALESCE(s.controla_serie, false), COALESCE(s.controla_lote, false)
  INTO v_controla, v_lote
  FROM public.cad_skus s
  WHERE s.id = p_sku_id AND s.empresa_id = p_empresa_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SKU_INVALIDO: SKU não encontrado no tenant.';
  END IF;
  IF NOT v_controla THEN
    RAISE EXCEPTION 'SERIE_NAO_PERMITIDA: este SKU não controla série.';
  END IF;
  IF v_lote THEN
    RAISE EXCEPTION 'SERIE_NAO_PERMITIDA: lote e série não convivem no mesmo SKU.';
  END IF;

  SELECT quantidade INTO v_qtd
  FROM public.est_saldos
  WHERE empresa_id = p_empresa_id AND sku_id = p_sku_id AND local_id = p_local_id
    AND lote_produto_id IS NULL AND serie_id IS NULL
  FOR UPDATE;
  IF NOT FOUND OR COALESCE(v_qtd, 0) < 1 THEN
    RAISE EXCEPTION 'SALDO_SEM_SERIE: não há unidade sem série deste SKU neste local.';
  END IF;

  SELECT id, situacao INTO v_serie, v_sit
  FROM public.est_series
  WHERE empresa_id = p_empresa_id AND sku_id = p_sku_id AND numero = v_numero
  FOR UPDATE;
  IF FOUND AND v_sit <> 'baixada' THEN
    RAISE EXCEPTION 'SERIE_JA_EM_USO: o número % já identifica uma peça em estoque ou em terceiro.', v_numero;
  END IF;
  IF NOT FOUND THEN
    INSERT INTO public.est_series (empresa_id, sku_id, numero, situacao, local_id)
    VALUES (p_empresa_id, p_sku_id, v_numero, 'em_estoque', p_local_id)
    RETURNING id INTO v_serie;
  ELSE
    UPDATE public.est_series
    SET situacao = 'em_estoque', local_id = p_local_id, pessoa_id = NULL, updated_at = now()
    WHERE id = v_serie;
  END IF;

  UPDATE public.est_saldos
  SET quantidade = quantidade - 1, updated_at = now()
  WHERE empresa_id = p_empresa_id AND sku_id = p_sku_id AND local_id = p_local_id
    AND lote_produto_id IS NULL AND serie_id IS NULL;

  INSERT INTO public.est_saldos (empresa_id, sku_id, local_id, lote_produto_id, serie_id, quantidade, updated_at)
  VALUES (p_empresa_id, p_sku_id, p_local_id, NULL, v_serie, 1, now())
  ON CONFLICT (empresa_id, sku_id, local_id, lote_produto_id, serie_id)
  DO UPDATE SET quantidade = est_saldos.quantidade + EXCLUDED.quantidade, updated_at = now();

  INSERT INTO public.est_movimentos (
    empresa_id, tipo, sku_id, local_id, quantidade, origem, motivo, usuario_id, movimento_em, serie_id
  ) VALUES (
    p_empresa_id, 'saida', p_sku_id, p_local_id, 1, 'inventario_serie',
    'Inventário de série — baixa da unidade sem identificação', v_usuario_id, now(), NULL
  );

  INSERT INTO public.est_movimentos (
    empresa_id, tipo, sku_id, local_id, quantidade, origem, motivo, usuario_id, movimento_em, serie_id
  ) VALUES (
    p_empresa_id, 'entrada', p_sku_id, p_local_id, 1, 'inventario_serie',
    'Inventário de série — ' || v_numero, v_usuario_id, now(), v_serie
  );

  RETURN jsonb_build_object(
    'success', true, 'serie_id', v_serie, 'numero', v_numero,
    'empresa_id', p_empresa_id, 'sku_id', p_sku_id, 'local_id', p_local_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.est_atribuir_serie_saldo(uuid, uuid, uuid, text, uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.est_reconstruir_saldos_from_cardex(
  p_empresa_id uuid,
  p_sku_id uuid DEFAULT NULL,
  p_local_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_auth_id uuid := auth.uid();
  v_movimentos_count int := 0;
  v_saldos_inseridos int := 0;
  v_terceiros_inseridos int := 0;
BEGIN
  IF auth.role() = 'authenticated' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_user_id = v_user_auth_id
        AND (u.role_global = 'superadmin' OR u.empresa_id = p_empresa_id)
        AND COALESCE(u.ativo, true)
    ) THEN
      RAISE EXCEPTION 'ACESSO_NEGADO: Usuário não tem permissão para operar no tenant informado.';
    END IF;
  END IF;

  IF p_empresa_id IS NULL THEN
    RAISE EXCEPTION 'PARAMETRO_OBRIGATORIO: empresa_id é obrigatório para reconstrução de saldos.';
  END IF;

  PERFORM public.est_garantir_locais_padrao(p_empresa_id);

  SELECT COUNT(*) INTO v_movimentos_count
  FROM public.est_movimentos
  WHERE empresa_id = p_empresa_id
    AND (p_sku_id IS NULL OR sku_id = p_sku_id OR sku_poder_id = p_sku_id)
    AND (p_local_id IS NULL OR local_id = p_local_id OR local_destino_id = p_local_id);

  DELETE FROM public.est_saldos
  WHERE empresa_id = p_empresa_id
    AND (p_sku_id IS NULL OR sku_id = p_sku_id)
    AND (p_local_id IS NULL OR local_id = p_local_id);

  IF p_local_id IS NULL THEN
    DELETE FROM public.est_saldos_poder_terceiros
    WHERE empresa_id = p_empresa_id
      AND (p_sku_id IS NULL OR sku_id = p_sku_id);
  END IF;

  WITH deltas AS (
    SELECT m.empresa_id, m.sku_id, m.local_id, m.lote_produto_id, m.serie_id,
      SUM(CASE
          WHEN m.tipo IN ('entrada', 'remessa_retorno', 'remessa_entrada_terceiros') THEN m.quantidade
          WHEN m.tipo = 'ajuste' AND m.ajuste_sinal = 'positivo' THEN m.quantidade
          WHEN m.tipo IN ('saida', 'remessa_saida', 'remessa_saida_terceiros', 'remessa_baixa') THEN -m.quantidade
          WHEN m.tipo = 'ajuste' AND m.ajuste_sinal = 'negativo' THEN -m.quantidade
          WHEN m.tipo = 'transferencia' THEN -m.quantidade
          ELSE 0 END) AS delta
    FROM public.est_movimentos m
    WHERE m.empresa_id = p_empresa_id
      AND (p_sku_id IS NULL OR m.sku_id = p_sku_id)
      AND (p_local_id IS NULL OR m.local_id = p_local_id)
    GROUP BY m.empresa_id, m.sku_id, m.local_id, m.lote_produto_id, m.serie_id
    UNION ALL
    SELECT m.empresa_id, m.sku_id, m.local_destino_id AS local_id, m.lote_produto_id, m.serie_id, SUM(m.quantidade) AS delta
    FROM public.est_movimentos m
    WHERE m.empresa_id = p_empresa_id AND m.tipo = 'transferencia' AND m.local_destino_id IS NOT NULL
      AND (p_sku_id IS NULL OR m.sku_id = p_sku_id)
      AND (p_local_id IS NULL OR m.local_destino_id = p_local_id)
    GROUP BY m.empresa_id, m.sku_id, m.local_destino_id, m.lote_produto_id, m.serie_id
  ),
  totais AS (
    SELECT d.empresa_id, d.sku_id, d.local_id, d.lote_produto_id, d.serie_id, SUM(d.delta) AS saldo_final
    FROM deltas d
    GROUP BY d.empresa_id, d.sku_id, d.local_id, d.lote_produto_id, d.serie_id
  )
  INSERT INTO public.est_saldos (empresa_id, sku_id, local_id, lote_produto_id, serie_id, quantidade, updated_at)
  SELECT t.empresa_id, t.sku_id, t.local_id, t.lote_produto_id, t.serie_id, t.saldo_final, now()
  FROM totais t
  WHERE t.saldo_final <> 0 AND t.local_id IS NOT NULL;

  GET DIAGNOSTICS v_saldos_inseridos = ROW_COUNT;

  IF p_local_id IS NULL THEN
    WITH deltas_terceiros AS (
      SELECT m.empresa_id, m.pessoa_id, m.sku_id, m.lote_remessa_id AS remessa_id, m.lote_produto_id, m.serie_id,
        SUM(CASE
            WHEN m.tipo = 'remessa_entrada_terceiros' THEN m.quantidade
            WHEN m.tipo IN ('remessa_saida_terceiros', 'remessa_baixa') THEN -m.quantidade
            WHEN m.tipo = 'remessa_saida' AND NOT EXISTS (
              SELECT 1 FROM public.est_movimentos x
              WHERE x.lote_remessa_id = m.lote_remessa_id AND x.remessa_item_id IS NOT DISTINCT FROM m.remessa_item_id
                AND x.tipo = 'remessa_entrada_terceiros'
            ) THEN m.quantidade
            WHEN m.tipo = 'remessa_retorno' AND NOT EXISTS (
              SELECT 1 FROM public.est_movimentos x
              WHERE x.lote_remessa_id = m.lote_remessa_id AND x.remessa_item_id IS NOT DISTINCT FROM m.remessa_item_id
                AND x.tipo = 'remessa_saida_terceiros'
            ) THEN -COALESCE(m.quantidade_poder, m.quantidade)
            ELSE 0 END) AS saldo_terceiro_final
      FROM public.est_movimentos m
      WHERE m.empresa_id = p_empresa_id AND m.pessoa_id IS NOT NULL AND m.lote_remessa_id IS NOT NULL
        AND (p_sku_id IS NULL OR m.sku_id = p_sku_id OR m.sku_poder_id = p_sku_id)
      GROUP BY m.empresa_id, m.pessoa_id, m.sku_id, m.lote_remessa_id, m.lote_produto_id, m.serie_id
    )
    INSERT INTO public.est_saldos_poder_terceiros (
      empresa_id, pessoa_id, sku_id, remessa_id, lote_produto_id, serie_id, quantidade, updated_at
    )
    SELECT dt.empresa_id, dt.pessoa_id, dt.sku_id, dt.remessa_id, dt.lote_produto_id, dt.serie_id, dt.saldo_terceiro_final, now()
    FROM deltas_terceiros dt
    WHERE dt.saldo_terceiro_final <> 0 AND dt.remessa_id IS NOT NULL;

    GET DIAGNOSTICS v_terceiros_inseridos = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'success', true, 'empresa_id', p_empresa_id,
    'movimentos', v_movimentos_count, 'saldos', v_saldos_inseridos, 'terceiros', v_terceiros_inseridos
  );
END;
$$;
