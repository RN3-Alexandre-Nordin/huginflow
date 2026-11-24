-- Requisição de planilha grava item sem SKU (aguardando cadastro).
-- Saldo insuficiente não entra aqui: a baixa é que recusa a saída.

ALTER TABLE public.est_requisicao_itens
  ALTER COLUMN sku_id DROP NOT NULL;

ALTER TABLE public.est_requisicao_itens
  ADD COLUMN IF NOT EXISTS sku_codigo_informado text;

ALTER TABLE public.est_requisicao_itens
  DROP CONSTRAINT IF EXISTS est_requisicao_itens_status_item_check;

ALTER TABLE public.est_requisicao_itens
  ADD CONSTRAINT est_requisicao_itens_status_item_check
  CHECK (status_item IN (
    'pendente', 'atendido', 'parcial', 'nao_atendido', 'pulado', 'aguardando_sku'
  ));

COMMENT ON COLUMN public.est_requisicao_itens.sku_codigo_informado IS
  'Código vindo da planilha quando o SKU ainda não existe em cad_skus.';

CREATE OR REPLACE FUNCTION public.est_criar_requisicao(
  p_empresa_id uuid,
  p_requisitante_pessoa_id uuid,
  p_solicitante_usuario_id uuid,
  p_departamento_id uuid,
  p_observacao text,
  p_origem text,
  p_codigo_origem text,
  p_sistema_origem text,
  p_requisitante_nome_origem text,
  p_modo text,
  p_itens jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_item jsonb;
  v_sku uuid;
  v_local uuid;
  v_qtd numeric;
  v_idx integer := 0;
  v_dia date;
  v_numero text;
  v_seq integer;
  v_req_id uuid;
  v_codigo text;
  v_sistema text;
  v_existente_id uuid;
  v_existente_numero text;
  v_constraint text;
  v_modo text := COALESCE(p_modo, '');
  v_status text;
  v_valor numeric := 0;
  v_motivo text;
  v_aprovacao_ativa boolean := false;
  v_minimo numeric := 0;
  v_papel text;
  v_solicitante uuid;
  v_codigo_sku text;
BEGIN
  IF p_empresa_id IS NULL OR p_requisitante_pessoa_id IS NULL THEN
    RETURN jsonb_build_object(
      'sucesso', false,
      'codigo', 'PARAMETRO_OBRIGATORIO',
      'mensagem', 'Empresa e requisitante são obrigatórios.'
    );
  END IF;

  IF v_modo NOT IN ('rascunho', 'enviar', 'aprovada_origem') THEN
    RETURN jsonb_build_object(
      'sucesso', false,
      'codigo', 'MODO_INVALIDO',
      'mensagem', 'Modo de criação da requisição é inválido.'
    );
  END IF;

  v_papel := COALESCE(auth.role(), '');
  IF v_modo = 'aprovada_origem' AND v_papel IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object(
      'sucesso', false,
      'codigo', 'ACESSO_NEGADO',
      'mensagem', 'Aprovação de origem só pode ser executada pelo servidor.'
    );
  END IF;

  IF p_origem IS NULL OR p_origem NOT IN ('manual', 'planilha') THEN
    RETURN jsonb_build_object(
      'sucesso', false,
      'codigo', 'ORIGEM_INVALIDA',
      'mensagem', 'Origem da requisição é inválida.'
    );
  END IF;

  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) = 0 THEN
    RETURN jsonb_build_object(
      'sucesso', false,
      'codigo', 'ITENS_OBRIGATORIOS',
      'mensagem', 'A requisição deve conter ao menos um item.'
    );
  END IF;

  IF v_modo = 'aprovada_origem' THEN
    IF p_solicitante_usuario_id IS NULL OR NOT EXISTS (
      SELECT 1
      FROM public.usuarios u
      LEFT JOIN public.grupos_acesso g
        ON g.id = u.grupo_id
       AND g.empresa_id = u.empresa_id
      WHERE u.id = p_solicitante_usuario_id
        AND COALESCE(u.ativo, true)
        AND (u.role_global = 'superadmin' OR u.empresa_id = p_empresa_id)
        AND (
          u.role_global IN ('superadmin', 'admin')
          OR COALESCE(g.is_admin, false)
          OR COALESCE((g.permissoes -> 'estoque_requisicoes') ? 'create', false)
          OR COALESCE((g.permissoes -> 'estoque') ? 'edit', false)
        )
    ) THEN
      RETURN jsonb_build_object(
        'sucesso', false,
        'codigo', 'ACESSO_NEGADO',
        'mensagem', 'Responsável sem autorização para criar requisições nesta empresa.'
      );
    END IF;

    IF p_origem IS DISTINCT FROM 'planilha'
       OR NULLIF(btrim(COALESCE(p_sistema_origem, '')), '') IS DISTINCT FROM 'atc_suprimentos'
       OR NULLIF(btrim(COALESCE(p_codigo_origem, '')), '') IS NULL THEN
      RETURN jsonb_build_object(
        'sucesso', false,
        'codigo', 'ORIGEM_NAO_AUTORIZADA',
        'mensagem', 'Aprovação de origem exige requisição Atlas identificada.'
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.empresa_addons ea
      JOIN public.addon_registry ar
        ON ar.codigo = ea.addon_codigo
       AND ar.ativo
      WHERE ea.empresa_id = p_empresa_id
        AND ea.addon_codigo = 'estoque_req_adapter_atc'
        AND ea.enabled
        AND ea.commercial_status IN ('active', 'trial', 'courtesy')
        AND (ea.starts_at IS NULL OR ea.starts_at <= pg_catalog.now())
        AND (ea.ends_at IS NULL OR ea.ends_at >= pg_catalog.now())
    ) THEN
      RETURN jsonb_build_object(
        'sucesso', false,
        'codigo', 'ADDON_NAO_HABILITADO',
        'mensagem', 'A empresa não possui o adaptador Atlas habilitado.'
      );
    END IF;
  ELSE
    IF v_uid IS NULL THEN
      RETURN jsonb_build_object(
        'sucesso', false,
        'codigo', 'ACESSO_NEGADO',
        'mensagem', 'Usuário não autenticado.'
      );
    END IF;

    SELECT u.id
      INTO v_solicitante
    FROM public.usuarios u
    WHERE u.auth_user_id = v_uid
      AND COALESCE(u.ativo, true)
      AND (u.role_global = 'superadmin' OR u.empresa_id = p_empresa_id)
    ORDER BY CASE WHEN u.empresa_id = p_empresa_id THEN 0 ELSE 1 END
    LIMIT 1;

    IF v_solicitante IS NULL THEN
      RETURN jsonb_build_object(
        'sucesso', false,
        'codigo', 'ACESSO_NEGADO',
        'mensagem', 'Usuário sem autorização para esta empresa.'
      );
    END IF;

    IF NOT (
      public.check_permission('estoque_requisicoes', 'create')
      OR public.check_permission('estoque', 'edit')
    ) THEN
      RETURN jsonb_build_object(
        'sucesso', false,
        'codigo', 'ACESSO_NEGADO',
        'mensagem', 'Usuário sem permissão para criar requisições.'
      );
    END IF;

    IF p_solicitante_usuario_id IS NOT NULL
       AND p_solicitante_usuario_id IS DISTINCT FROM v_solicitante THEN
      RETURN jsonb_build_object(
        'sucesso', false,
        'codigo', 'SOLICITANTE_INVALIDO',
        'mensagem', 'O solicitante deve ser o usuário autenticado.'
      );
    END IF;

    p_solicitante_usuario_id := v_solicitante;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.crm_leads l
    WHERE l.id = p_requisitante_pessoa_id
      AND l.empresa_id = p_empresa_id
      AND COALESCE(l.ativo, false)
      AND 'funcionario' = ANY (COALESCE(l.papeis, ARRAY[]::text[]))
  ) THEN
    RETURN jsonb_build_object(
      'sucesso', false,
      'codigo', 'REQUISITANTE_INVALIDO',
      'mensagem', 'Requisitante deve ser funcionário ativo desta empresa.'
    );
  END IF;

  IF p_departamento_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.departamentos d
    WHERE d.id = p_departamento_id
      AND d.empresa_id = p_empresa_id
  ) THEN
    RETURN jsonb_build_object(
      'sucesso', false,
      'codigo', 'DEPARTAMENTO_INVALIDO',
      'mensagem', 'Departamento inválido para esta empresa.'
    );
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_itens)
  LOOP
    v_idx := v_idx + 1;
    BEGIN
      v_sku := NULLIF(v_item->>'sku_id', '')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      v_sku := NULL;
    END;
    BEGIN
      v_qtd := NULLIF(v_item->>'quantidade_pedida', '')::numeric;
    EXCEPTION WHEN invalid_text_representation THEN
      v_qtd := NULL;
    END;

    v_codigo_sku := NULLIF(btrim(COALESCE(v_item->>'sku_codigo_informado', '')), '');

    IF v_qtd IS NULL OR v_qtd <= 0 THEN
      RETURN jsonb_build_object(
        'sucesso', false,
        'codigo', 'QUANTIDADE_INVALIDA',
      'mensagem', 'A quantidade pedida deve ser maior que zero.'
    );
    END IF;

    IF v_sku IS NULL THEN
      IF v_codigo_sku IS NULL THEN
        RETURN jsonb_build_object(
          'sucesso', false,
          'codigo', 'SKU_INVALIDO',
          'mensagem', format('SKU inválido ou não pertencente a esta empresa (item %s).', v_idx)
        );
      END IF;
    ELSIF NOT EXISTS (
      SELECT 1 FROM public.cad_skus s
      WHERE s.id = v_sku
        AND s.empresa_id = p_empresa_id
        AND COALESCE(s.ativo, false)
    ) THEN
      RETURN jsonb_build_object(
        'sucesso', false,
        'codigo', 'SKU_INVALIDO',
        'mensagem', format('SKU inválido ou não pertencente a esta empresa (item %s).', v_idx)
      );
    END IF;

    IF NULLIF(v_item->>'local_id', '') IS NOT NULL THEN
      BEGIN
        v_local := (v_item->>'local_id')::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        v_local := NULL;
      END;
      IF v_local IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.cad_locais_estoque l
        WHERE l.id = v_local
          AND l.empresa_id = p_empresa_id
          AND COALESCE(l.ativo, false)
      ) THEN
        RETURN jsonb_build_object(
          'sucesso', false,
          'codigo', 'LOCAL_INVALIDO',
          'mensagem', format('Local de estoque inválido para esta empresa (item %s).', v_idx)
        );
      END IF;
    END IF;
  END LOOP;

  v_codigo := NULLIF(btrim(COALESCE(p_codigo_origem, '')), '');
  v_sistema := NULLIF(btrim(COALESCE(p_sistema_origem, '')), '');

  SELECT COALESCE(SUM(
    (item->>'quantidade_pedida')::numeric * COALESCE(s.preco_custo, 0)
  ), 0)
    INTO v_valor
  FROM jsonb_array_elements(p_itens) AS item
  LEFT JOIN public.cad_skus s
    ON s.id = NULLIF(item->>'sku_id', '')::uuid
   AND s.empresa_id = p_empresa_id
  WHERE NULLIF(item->>'sku_id', '') IS NOT NULL;

  v_valor := round(v_valor, 2);

  IF v_modo = 'rascunho' THEN
    v_status := 'rascunho';
  ELSIF v_modo = 'aprovada_origem' THEN
    v_status := 'aprovada';
    v_motivo := 'origem';
  ELSE
    SELECT
      COALESCE(c.req_aprovacao_ativa, false),
      COALESCE(c.req_aprovacao_valor_minimo, 0)
      INTO v_aprovacao_ativa, v_minimo
    FROM public.est_config c
    WHERE c.empresa_id = p_empresa_id;

    v_aprovacao_ativa := COALESCE(v_aprovacao_ativa, false);
    v_minimo := COALESCE(v_minimo, 0);

    IF NOT v_aprovacao_ativa THEN
      v_status := 'aprovada';
      v_motivo := 'aprovacao_desligada';
    ELSIF v_minimo > 0 AND v_valor < v_minimo THEN
      v_status := 'aprovada';
      v_motivo := 'abaixo_minimo';
    ELSE
      v_status := 'pendente_aprovacao';
    END IF;
  END IF;

  v_dia := (pg_catalog.now() AT TIME ZONE 'America/Sao_Paulo')::date;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('est_requisicao:' || p_empresa_id::text),
    pg_catalog.hashtext(v_dia::text)
  );

  SELECT COALESCE(MAX((substring(r.numero FROM '[0-9]+$'))::integer), 0) + 1
    INTO v_seq
  FROM public.est_requisicoes r
  WHERE r.empresa_id = p_empresa_id
    AND r.numero ~ ('^REQ-' || to_char(v_dia, 'YYYYMMDD') || '-[0-9]+$');

  v_numero := 'REQ-' || to_char(v_dia, 'YYYYMMDD') || '-' || lpad(v_seq::text, 4, '0');

  BEGIN
    INSERT INTO public.est_requisicoes (
      empresa_id,
      numero,
      requisitante_pessoa_id,
      solicitante_usuario_id,
      departamento_id,
      status,
      origem,
      codigo_origem,
      sistema_origem,
      requisitante_nome_origem,
      workflow_card_id,
      observacao,
      valor_estimado,
      created_at,
      updated_at
    ) VALUES (
      p_empresa_id,
      v_numero,
      p_requisitante_pessoa_id,
      p_solicitante_usuario_id,
      p_departamento_id,
      v_status,
      p_origem,
      v_codigo,
      v_sistema,
      NULLIF(btrim(COALESCE(p_requisitante_nome_origem, '')), ''),
      NULL,
      NULLIF(btrim(COALESCE(p_observacao, '')), ''),
      v_valor,
      pg_catalog.now(),
      pg_catalog.now()
    )
    RETURNING id INTO v_req_id;

    INSERT INTO public.est_requisicao_itens (
      empresa_id,
      requisicao_id,
      sku_id,
      sku_codigo_informado,
      quantidade_pedida,
      quantidade_atendida,
      quantidade_pendente,
      local_id,
      status_item,
      created_at,
      updated_at
    )
    SELECT
      p_empresa_id,
      v_req_id,
      NULLIF(item->>'sku_id', '')::uuid,
      NULLIF(btrim(COALESCE(item->>'sku_codigo_informado', '')), ''),
      (item->>'quantidade_pedida')::numeric,
      0,
      (item->>'quantidade_pedida')::numeric,
      NULLIF(item->>'local_id', '')::uuid,
      CASE
        WHEN NULLIF(item->>'sku_id', '') IS NULL THEN 'aguardando_sku'
        ELSE 'pendente'
      END,
      pg_catalog.now(),
      pg_catalog.now()
    FROM jsonb_array_elements(p_itens) AS item;
  EXCEPTION
    WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      IF COALESCE(v_constraint, '') = 'uq_est_requisicoes_empresa_sistema_codigo_origem'
         OR SQLERRM ILIKE '%uq_est_requisicoes_empresa_sistema_codigo_origem%' THEN
        SELECT r.id, r.numero
          INTO v_existente_id, v_existente_numero
        FROM public.est_requisicoes r
        WHERE r.empresa_id = p_empresa_id
          AND r.sistema_origem = v_sistema
          AND r.codigo_origem = v_codigo
        LIMIT 1;
        RETURN jsonb_build_object(
          'sucesso', false,
          'codigo', 'REQUISICAO_ORIGEM_DUPLICADA',
          'mensagem', format(
            'Requisição de origem %s/%s já existe no Hugin (%s).',
            COALESCE(v_sistema, ''),
            COALESCE(v_codigo, ''),
            COALESCE(v_existente_numero, '')
          ),
          'requisicao_id', v_existente_id,
          'numero', v_existente_numero
        );
      END IF;

      IF COALESCE(v_constraint, '') = 'uq_est_requisicoes_empresa_numero'
         OR SQLERRM ILIKE '%uq_est_requisicoes_empresa_numero%' THEN
        RETURN jsonb_build_object(
          'sucesso', false,
          'codigo', 'NUMERO_COLISAO',
          'mensagem', format('Número %s já existe nesta empresa.', v_numero)
        );
      END IF;

      RETURN jsonb_build_object(
        'sucesso', false,
        'codigo', 'CONFLITO_UNICIDADE',
        'mensagem', 'Conflito de unicidade ao gravar a requisição.'
      );
    WHEN foreign_key_violation THEN
      RETURN jsonb_build_object(
        'sucesso', false,
        'codigo', 'REFERENCIA_INVALIDA',
        'mensagem', 'Referência inválida ao gravar a requisição.'
      );
    WHEN check_violation THEN
      RETURN jsonb_build_object(
        'sucesso', false,
        'codigo', 'ITEM_INVALIDO',
        'mensagem', 'Item da requisição viola uma regra de integridade.'
      );
  END;

  RETURN jsonb_build_object(
    'sucesso', true,
    'requisicao_id', v_req_id,
    'numero', v_numero,
    'status', v_status,
    'valor_estimado', v_valor,
    'motivo_aprovacao', v_motivo
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.est_vincular_sku_item_requisicao(
  p_empresa_id uuid,
  p_item_id uuid,
  p_sku_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_codigo text;
  v_sku uuid := p_sku_id;
  v_req uuid;
BEGIN
  IF p_empresa_id IS NULL OR p_item_id IS NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Item da requisição não informado.');
  END IF;

  IF NOT (
    public.check_permission('estoque_requisicoes', 'edit')
    OR public.check_permission('estoque_requisicoes', 'create')
    OR public.check_permission('estoque', 'edit')
    OR public.check_permission('skus', 'create')
  ) THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Sem permissão para vincular o SKU.');
  END IF;

  SELECT i.sku_codigo_informado, i.requisicao_id
    INTO v_codigo, v_req
  FROM public.est_requisicao_itens i
  WHERE i.id = p_item_id
    AND i.empresa_id = p_empresa_id
    AND i.sku_id IS NULL
    AND i.status_item = 'aguardando_sku';

  IF v_req IS NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Item sem SKU pendente não encontrado.');
  END IF;

  IF v_sku IS NULL THEN
    SELECT s.id INTO v_sku
    FROM public.cad_skus s
    WHERE s.empresa_id = p_empresa_id
      AND COALESCE(s.ativo, false)
      AND upper(btrim(s.codigo)) = upper(btrim(COALESCE(v_codigo, '')))
    LIMIT 1;
  END IF;

  IF v_sku IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.cad_skus s
    WHERE s.id = v_sku
      AND s.empresa_id = p_empresa_id
      AND COALESCE(s.ativo, false)
  ) THEN
    RETURN jsonb_build_object(
      'sucesso', false,
      'mensagem', format('Cadastre o SKU %s e volte para vincular.', COALESCE(v_codigo, ''))
    );
  END IF;

  UPDATE public.est_requisicao_itens
     SET sku_id = v_sku,
         status_item = 'pendente',
         updated_at = pg_catalog.now()
   WHERE id = p_item_id
     AND empresa_id = p_empresa_id
     AND sku_id IS NULL;

  RETURN jsonb_build_object('sucesso', true, 'sku_id', v_sku, 'requisicao_id', v_req);
END;
$$;

REVOKE ALL ON FUNCTION public.est_vincular_sku_item_requisicao(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.est_vincular_sku_item_requisicao(uuid, uuid, uuid)
  TO authenticated, service_role;

