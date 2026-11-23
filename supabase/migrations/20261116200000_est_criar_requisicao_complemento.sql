-- Complemento de 20261116195933 (202611161200_est_criar_requisicao).
-- A constraint uq_est_requisicoes_empresa_numero e o COMMENT ja foram o trecho registrado.
-- Este arquivo contem somente funcoes, triggers, grants e revogacoes ainda nao executados.

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
      AND COALESCE(l.papeis, '[]'::jsonb) ? 'funcionario'
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

    IF v_sku IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.cad_skus s
      WHERE s.id = v_sku
        AND s.empresa_id = p_empresa_id
        AND COALESCE(s.ativo, false)
        AND COALESCE(s.controla_estoque, false)
    ) THEN
      RETURN jsonb_build_object(
        'sucesso', false,
        'codigo', 'SKU_INVALIDO',
        'mensagem', format('SKU inválido ou não pertencente a esta empresa (item %s).', v_idx)
      );
    END IF;

    IF v_qtd IS NULL OR v_qtd <= 0 THEN
      RETURN jsonb_build_object(
        'sucesso', false,
        'codigo', 'QUANTIDADE_INVALIDA',
        'mensagem', 'A quantidade pedida deve ser maior que zero.'
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
  JOIN public.cad_skus s
    ON s.id = (item->>'sku_id')::uuid
   AND s.empresa_id = p_empresa_id;

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
      (item->>'sku_id')::uuid,
      (item->>'quantidade_pedida')::numeric,
      0,
      (item->>'quantidade_pedida')::numeric,
      NULLIF(item->>'local_id', '')::uuid,
      'pendente',
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

COMMENT ON FUNCTION public.est_criar_requisicao(
  uuid, uuid, uuid, uuid, text, text, text, text, text, text, jsonb
) IS
  'Cria cabeçalho e itens no mesmo COMMIT. Modos: rascunho, enviar (status calculado no servidor) e aprovada_origem (somente service_role, Atlas).';

REVOKE ALL ON FUNCTION public.est_criar_requisicao(
  uuid, uuid, uuid, uuid, text, text, text, text, text, text, jsonb
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.est_criar_requisicao(
  uuid, uuid, uuid, uuid, text, text, text, text, text, text, jsonb
) TO authenticated, service_role;

REVOKE INSERT ON TABLE public.est_requisicoes FROM authenticated;
REVOKE INSERT ON TABLE public.est_requisicao_itens FROM authenticated;

REVOKE UPDATE ON TABLE public.est_requisicoes FROM authenticated;
GRANT UPDATE (workflow_card_id, updated_at)
  ON TABLE public.est_requisicoes TO authenticated;

REVOKE UPDATE ON TABLE public.est_requisicao_itens FROM authenticated;
REVOKE UPDATE (
  quantidade_atendida,
  quantidade_pendente,
  status_item,
  local_id,
  updated_at
) ON TABLE public.est_requisicao_itens FROM authenticated;

CREATE OR REPLACE FUNCTION public.est_requisicoes_bloquear_status_direto()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND current_setting('hugin.req_transicao', true) IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'STATUS_REQUISICAO_PROTEGIDO'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS est_requisicoes_bloquear_status_direto ON public.est_requisicoes;
CREATE TRIGGER est_requisicoes_bloquear_status_direto
  BEFORE UPDATE OF status ON public.est_requisicoes
  FOR EACH ROW
  EXECUTE FUNCTION public.est_requisicoes_bloquear_status_direto();

CREATE OR REPLACE FUNCTION public.est_requisicoes_bloquear_auditoria_direta()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF current_setting('hugin.req_transicao', true) IS DISTINCT FROM '1'
     AND (
       NEW.aprovador_usuario_id IS DISTINCT FROM OLD.aprovador_usuario_id
       OR NEW.aprovado_em IS DISTINCT FROM OLD.aprovado_em
       OR NEW.aprovacao_resultado IS DISTINCT FROM OLD.aprovacao_resultado
     ) THEN
    RAISE EXCEPTION 'AUDITORIA_REQUISICAO_PROTEGIDA'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS est_requisicoes_bloquear_auditoria_direta ON public.est_requisicoes;
CREATE TRIGGER est_requisicoes_bloquear_auditoria_direta
  BEFORE UPDATE OF aprovador_usuario_id, aprovado_em, aprovacao_resultado
  ON public.est_requisicoes
  FOR EACH ROW
  EXECUTE FUNCTION public.est_requisicoes_bloquear_auditoria_direta();

CREATE OR REPLACE FUNCTION public.est_transicionar_requisicao(
  p_empresa_id uuid,
  p_requisicao_id uuid,
  p_intencao text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_usuario_id uuid;
  v_role text;
  v_status text;
  v_origem text;
  v_sistema text;
  v_valor numeric := 0;
  v_novo text;
  v_ativa boolean := false;
  v_minimo numeric := 0;
  v_aprovador uuid;
  v_motivo text;
  v_resultado text;
  v_auto boolean := false;
  v_idempotente boolean := false;
BEGIN
  IF p_intencao IS NULL OR p_intencao NOT IN (
    'enviar', 'aprovar', 'rejeitar', 'cancelar', 'liberar_para_baixa'
  ) THEN
    RETURN jsonb_build_object(
      'sucesso', false,
      'codigo', 'INTENCAO_INVALIDA',
      'mensagem', 'Intenção de transição inválida.'
    );
  END IF;

  IF v_uid IS NULL THEN
    RETURN jsonb_build_object(
      'sucesso', false,
      'codigo', 'ACESSO_NEGADO',
      'mensagem', 'Usuário não autenticado.'
    );
  END IF;

  SELECT u.id, u.role_global
    INTO v_usuario_id, v_role
  FROM public.usuarios u
  WHERE u.auth_user_id = v_uid
    AND COALESCE(u.ativo, true)
    AND (u.role_global = 'superadmin' OR u.empresa_id = p_empresa_id);

  IF v_usuario_id IS NULL THEN
    RETURN jsonb_build_object(
      'sucesso', false,
      'codigo', 'ACESSO_NEGADO',
      'mensagem', 'Usuário sem autorização para esta empresa.'
    );
  END IF;

  SELECT r.status, r.origem, r.sistema_origem, r.aprovacao_resultado
    INTO v_status, v_origem, v_sistema, v_resultado
  FROM public.est_requisicoes r
  WHERE r.id = p_requisicao_id
    AND r.empresa_id = p_empresa_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RETURN jsonb_build_object(
      'sucesso', false,
      'codigo', 'NAO_ENCONTRADA',
      'mensagem', 'Requisição não encontrada.'
    );
  END IF;

  IF p_intencao = 'enviar' THEN
    IF v_status IS DISTINCT FROM 'rascunho' THEN
      RETURN jsonb_build_object(
        'sucesso', false,
        'codigo', 'TRANSICAO_INVALIDA',
        'mensagem', 'Apenas requisições em rascunho podem ser enviadas para aprovação.'
      );
    END IF;
    IF NOT (
      public.check_permission('estoque_requisicoes', 'edit')
      OR public.check_permission('estoque_requisicoes', 'create')
      OR public.check_permission('estoque', 'edit')
    ) THEN
      RETURN jsonb_build_object(
        'sucesso', false,
        'codigo', 'ACESSO_NEGADO',
        'mensagem', 'Sem permissão para enviar requisição para aprovação.'
      );
    END IF;

    SELECT COALESCE(SUM(i.quantidade_pedida * COALESCE(s.preco_custo, 0)), 0)
      INTO v_valor
    FROM public.est_requisicao_itens i
    JOIN public.cad_skus s
      ON s.id = i.sku_id
     AND s.empresa_id = p_empresa_id
    WHERE i.requisicao_id = p_requisicao_id
      AND i.empresa_id = p_empresa_id;
    v_valor := round(COALESCE(v_valor, 0), 2);

    SELECT COALESCE(c.req_aprovacao_ativa, false), COALESCE(c.req_aprovacao_valor_minimo, 0)
      INTO v_ativa, v_minimo
    FROM public.est_config c
    WHERE c.empresa_id = p_empresa_id;
    v_ativa := COALESCE(v_ativa, false);
    v_minimo := COALESCE(v_minimo, 0);

    IF NOT v_ativa THEN
      v_novo := 'aprovada';
      v_motivo := 'aprovacao_desligada';
    ELSIF v_minimo > 0 AND v_valor < v_minimo THEN
      v_novo := 'aprovada';
      v_motivo := 'abaixo_minimo';
    ELSE
      v_novo := 'pendente_aprovacao';
    END IF;
  ELSIF p_intencao IN ('aprovar', 'rejeitar') THEN
    v_novo := CASE WHEN p_intencao = 'aprovar' THEN 'aprovada' ELSE 'rejeitada' END;
    v_idempotente := v_status = v_novo AND v_resultado = v_novo;

    IF NOT v_idempotente AND v_status IS DISTINCT FROM 'pendente_aprovacao' THEN
      RETURN jsonb_build_object(
        'sucesso', false,
        'codigo', 'TRANSICAO_INVALIDA',
        'mensagem', 'Apenas requisições pendentes de aprovação podem ser decididas.'
      );
    END IF;

    SELECT c.req_aprovador_usuario_id
      INTO v_aprovador
    FROM public.est_config c
    WHERE c.empresa_id = p_empresa_id;

    IF COALESCE(v_role, '') NOT IN ('superadmin', 'admin')
       AND v_aprovador IS DISTINCT FROM v_usuario_id
       AND NOT EXISTS (
         SELECT 1
         FROM public.usuarios u
         JOIN public.grupos_acesso g
           ON g.id = u.grupo_id
          AND g.empresa_id = p_empresa_id
         WHERE u.id = v_usuario_id
           AND COALESCE(g.is_admin, false)
       ) THEN
      RETURN jsonb_build_object(
        'sucesso', false,
        'codigo', 'ACESSO_NEGADO',
        'mensagem', 'Somente o aprovador configurado, o admin da empresa, o administrador de grupo ou superadmin podem decidir.'
      );
    END IF;
  ELSIF p_intencao = 'cancelar' THEN
    IF v_status = 'cancelada' THEN
      v_idempotente := true;
      v_novo := 'cancelada';
    ELSIF v_status = 'atendida_total' THEN
      RETURN jsonb_build_object(
        'sucesso', false,
        'codigo', 'TRANSICAO_INVALIDA',
        'mensagem', 'Esta requisição não pode ser cancelada no status atual.'
      );
    END IF;
    IF COALESCE(v_role, '') NOT IN ('superadmin', 'admin') AND NOT (
      public.check_permission('estoque_requisicoes', 'edit')
      OR public.check_permission('estoque', 'edit')
    ) THEN
      RETURN jsonb_build_object(
        'sucesso', false,
        'codigo', 'ACESSO_NEGADO',
        'mensagem', 'Sem permissão para cancelar esta requisição.'
      );
    END IF;
    IF NOT v_idempotente THEN
      v_novo := 'cancelada';
    END IF;
  ELSIF p_intencao = 'liberar_para_baixa' THEN
    SELECT COALESCE(c.req_planilha_auto_atender, false)
      INTO v_auto
    FROM public.est_config c
    WHERE c.empresa_id = p_empresa_id;
    v_auto := COALESCE(v_auto, false);

    IF v_origem IS DISTINCT FROM 'planilha'
       OR COALESCE(v_sistema, '') = 'atc_suprimentos'
       OR NOT v_auto
       OR v_status NOT IN ('rascunho', 'aprovada') THEN
      RETURN jsonb_build_object(
        'sucesso', false,
        'codigo', CASE
          WHEN NOT v_auto AND v_origem = 'planilha' AND COALESCE(v_sistema, '') <> 'atc_suprimentos'
            THEN 'AUTOATENDIMENTO_DESLIGADO'
          ELSE 'TRANSICAO_INVALIDA'
        END,
        'mensagem', CASE
          WHEN NOT v_auto AND v_origem = 'planilha' AND COALESCE(v_sistema, '') <> 'atc_suprimentos'
            THEN 'Autoatendimento da planilha está desligado.'
          ELSE 'Somente requisição Hugin padrão em rascunho pode ser liberada para baixa.'
        END
      );
    END IF;

    IF v_status = 'aprovada' THEN
      v_idempotente := true;
      v_novo := 'aprovada';
      v_motivo := 'liberada_para_baixa';
    END IF;
    IF NOT (
      public.check_permission('estoque_requisicoes', 'create')
      OR public.check_permission('estoque', 'edit')
    ) THEN
      RETURN jsonb_build_object(
        'sucesso', false,
        'codigo', 'ACESSO_NEGADO',
        'mensagem', 'Sem permissão para liberar a requisição para baixa.'
      );
    END IF;
    v_novo := 'aprovada';
    v_motivo := 'liberada_para_baixa';
  ELSE
    RETURN jsonb_build_object(
      'sucesso', false,
      'codigo', 'INTENCAO_INVALIDA',
      'mensagem', 'Atendimento só pode ser registrado pela baixa de estoque.'
    );
  END IF;

  IF v_idempotente THEN
    RETURN jsonb_build_object(
      'sucesso', true,
      'idempotente', true,
      'status', COALESCE(v_novo, v_status),
      'motivo_aprovacao', v_motivo
    );
  END IF;

  PERFORM set_config('hugin.req_transicao', '1', true);

  UPDATE public.est_requisicoes
  SET
    status = v_novo,
    valor_estimado = CASE WHEN p_intencao = 'enviar' THEN v_valor ELSE valor_estimado END,
    aprovador_usuario_id = CASE
      WHEN p_intencao IN ('aprovar', 'rejeitar') THEN v_usuario_id
      ELSE aprovador_usuario_id
    END,
    aprovado_em = CASE
      WHEN p_intencao IN ('aprovar', 'rejeitar') THEN pg_catalog.now()
      ELSE aprovado_em
    END,
    aprovacao_resultado = CASE
      WHEN p_intencao = 'aprovar' THEN 'aprovada'
      WHEN p_intencao = 'rejeitar' THEN 'rejeitada'
      ELSE aprovacao_resultado
    END,
    updated_at = pg_catalog.now()
  WHERE id = p_requisicao_id
    AND empresa_id = p_empresa_id;

  RETURN jsonb_build_object(
    'sucesso', true,
    'status', v_novo,
    'valor_estimado', CASE WHEN p_intencao = 'enviar' THEN v_valor ELSE NULL END,
    'motivo_aprovacao', v_motivo
  );
END;
$$;

COMMENT ON FUNCTION public.est_transicionar_requisicao(uuid, uuid, text) IS
  'Transições de requisição por intenção. Não aceita status arbitrário. Bloqueia UPDATE direto de status.';

REVOKE ALL ON FUNCTION public.est_transicionar_requisicao(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.est_transicionar_requisicao(uuid, uuid, text)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.est_requisicoes_validar_workflow_card()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.workflow_card_id IS NOT DISTINCT FROM OLD.workflow_card_id THEN
    RETURN NEW;
  END IF;

  IF OLD.workflow_card_id IS NOT NULL THEN
    RAISE EXCEPTION 'WORKFLOW_CARD_IMUTAVEL'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.workflow_card_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.crm_cards c
    WHERE c.id = NEW.workflow_card_id
      AND c.empresa_id = NEW.empresa_id
  ) THEN
    RAISE EXCEPTION 'WORKFLOW_CARD_INVALIDO'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.est_requisicoes_validar_workflow_card() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.est_requisicoes_validar_workflow_card() TO authenticated, service_role;

DROP TRIGGER IF EXISTS est_requisicoes_validar_workflow_card ON public.est_requisicoes;
CREATE TRIGGER est_requisicoes_validar_workflow_card
  BEFORE UPDATE OF workflow_card_id ON public.est_requisicoes
  FOR EACH ROW
  EXECUTE FUNCTION public.est_requisicoes_validar_workflow_card();

CREATE OR REPLACE FUNCTION public.est_atender_requisicao(
  p_empresa_id uuid,
  p_requisicao_id uuid,
  p_operacoes jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_usuario_id uuid;
  v_status text;
  v_numero text;
  v_pessoa uuid;
  v_op jsonb;
  v_item_id uuid;
  v_acao text;
  v_local uuid;
  v_mov jsonb;
  v_qtd numeric;
  v_soma numeric;
  v_pedida numeric;
  v_atendida numeric;
  v_pendente numeric;
  v_sku uuid;
  v_local_item uuid;
  v_lote uuid;
  v_serie uuid;
  v_motivo text;
  v_res jsonb;
  v_baixados integer := 0;
  v_pulados integer := 0;
  v_novo text;
  v_tem_pendencia boolean;
  v_tem_baixa boolean;
BEGIN
  IF p_empresa_id IS NULL OR p_requisicao_id IS NULL THEN
    RETURN jsonb_build_object(
      'sucesso', false,
      'codigo', 'PARAMETRO_OBRIGATORIO',
      'mensagem', 'Empresa e requisição são obrigatórios.'
    );
  END IF;

  IF p_operacoes IS NULL OR jsonb_typeof(p_operacoes) <> 'array' OR jsonb_array_length(p_operacoes) = 0 THEN
    RETURN jsonb_build_object(
      'sucesso', false,
      'codigo', 'SEM_OPERACAO',
      'mensagem', 'Nenhum item foi informado para atendimento.'
    );
  END IF;

  IF v_uid IS NULL THEN
    RETURN jsonb_build_object(
      'sucesso', false,
      'codigo', 'ACESSO_NEGADO',
      'mensagem', 'Usuário não autenticado.'
    );
  END IF;

  SELECT u.id
    INTO v_usuario_id
  FROM public.usuarios u
  WHERE u.auth_user_id = v_uid
    AND COALESCE(u.ativo, true)
    AND (u.role_global = 'superadmin' OR u.empresa_id = p_empresa_id)
  ORDER BY CASE WHEN u.empresa_id = p_empresa_id THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_usuario_id IS NULL THEN
    RETURN jsonb_build_object(
      'sucesso', false,
      'codigo', 'ACESSO_NEGADO',
      'mensagem', 'Usuário sem autorização para esta empresa.'
    );
  END IF;

  IF NOT (
    public.check_permission('estoque_atendimento', 'create')
    OR public.check_permission('estoque_atendimento', 'edit')
    OR public.check_permission('estoque', 'edit')
  ) THEN
    RETURN jsonb_build_object(
      'sucesso', false,
      'codigo', 'ACESSO_NEGADO',
      'mensagem', 'Sem permissão para atender requisições.'
    );
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_empresa_id::text), hashtext(p_requisicao_id::text));

  SELECT r.status, r.numero, r.requisitante_pessoa_id
    INTO v_status, v_numero, v_pessoa
  FROM public.est_requisicoes r
  WHERE r.id = p_requisicao_id
    AND r.empresa_id = p_empresa_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RETURN jsonb_build_object(
      'sucesso', false,
      'codigo', 'NAO_ENCONTRADA',
      'mensagem', 'Requisição não encontrada.'
    );
  END IF;

  IF v_status NOT IN ('aprovada', 'atendida_parcial') THEN
    RETURN jsonb_build_object(
      'sucesso', false,
      'codigo', 'TRANSICAO_INVALIDA',
      'mensagem', 'A requisição não está em atendimento.'
    );
  END IF;

  PERFORM 1
  FROM public.est_requisicao_itens i
  WHERE i.requisicao_id = p_requisicao_id
    AND i.empresa_id = p_empresa_id
    AND i.id IN (
      SELECT (op->>'item_id')::uuid
      FROM jsonb_array_elements(p_operacoes) op
      WHERE (op->>'item_id') ~* '^[0-9a-f-]{36}$'
    )
  ORDER BY i.id
  FOR UPDATE;

  FOR v_op IN
    SELECT op
    FROM jsonb_array_elements(p_operacoes) op
    ORDER BY (op->>'item_id')
  LOOP
    v_item_id := NULLIF(v_op->>'item_id', '')::uuid;
    v_acao := COALESCE(v_op->>'acao', '');

    SELECT i.quantidade_pedida, i.quantidade_atendida, i.quantidade_pendente, i.sku_id, i.local_id
      INTO v_pedida, v_atendida, v_pendente, v_sku, v_local_item
    FROM public.est_requisicao_itens i
    WHERE i.id = v_item_id
      AND i.requisicao_id = p_requisicao_id
      AND i.empresa_id = p_empresa_id
    FOR UPDATE;

    IF v_sku IS NULL THEN
      RAISE EXCEPTION 'ITEM_INVALIDO'
        USING ERRCODE = '42501';
    END IF;

    IF v_acao = 'pular' THEN
      UPDATE public.est_requisicao_itens
      SET status_item = 'pulado',
          updated_at = pg_catalog.now()
      WHERE id = v_item_id
        AND empresa_id = p_empresa_id;
      v_pulados := v_pulados + 1;
      CONTINUE;
    END IF;

    IF v_acao IS DISTINCT FROM 'atender' THEN
      RAISE EXCEPTION 'ACAO_INVALIDA'
        USING ERRCODE = '42501';
    END IF;

    IF v_op->'movimentos' IS NULL OR jsonb_typeof(v_op->'movimentos') <> 'array'
       OR jsonb_array_length(v_op->'movimentos') = 0 THEN
      RAISE EXCEPTION 'MOVIMENTO_OBRIGATORIO'
        USING ERRCODE = '42501';
    END IF;

    SELECT COALESCE(SUM((m->>'quantidade')::numeric), 0)
      INTO v_soma
    FROM jsonb_array_elements(v_op->'movimentos') m;

    IF v_soma <= 0 OR v_soma > v_pendente THEN
      RAISE EXCEPTION 'QUANTIDADE_ACIMA_PENDENTE'
        USING ERRCODE = '42501';
    END IF;

    v_local := NULLIF(v_op->>'local_id', '')::uuid;
    IF v_local IS NULL OR NOT EXISTS (
      SELECT 1
      FROM public.cad_locais_estoque l
      WHERE l.id = v_local
        AND l.empresa_id = p_empresa_id
        AND COALESCE(l.ativo, true)
    ) THEN
      RAISE EXCEPTION 'LOCAL_INVALIDO'
        USING ERRCODE = '42501';
    END IF;

    FOR v_mov IN
      SELECT m FROM jsonb_array_elements(v_op->'movimentos') m
    LOOP
      v_qtd := (v_mov->>'quantidade')::numeric;
      IF v_qtd IS NULL OR v_qtd <= 0 THEN
        RAISE EXCEPTION 'QUANTIDADE_INVALIDA'
          USING ERRCODE = '42501';
      END IF;
      v_lote := NULLIF(v_mov->>'lote_produto_id', '')::uuid;
      v_serie := NULLIF(v_mov->>'serie_id', '')::uuid;
      v_motivo := NULLIF(v_mov->>'motivo', '');

      v_res := public.est_registrar_movimento_atomico(
        p_empresa_id := p_empresa_id,
        p_tipo := 'saida',
        p_sku_id := v_sku,
        p_local_id := v_local,
        p_quantidade := v_qtd,
        p_documento := v_numero,
        p_pessoa_id := v_pessoa,
        p_origem := 'requisicao',
        p_requisicao_id := p_requisicao_id,
        p_motivo := COALESCE(v_motivo, format('Atendimento Requisição %s', v_numero)),
        p_usuario_id := v_usuario_id,
        p_permitir_saldo_negativo := false,
        p_lote_produto_id := v_lote,
        p_serie_id := v_serie
      );

      IF COALESCE(v_res->>'success', v_res->>'sucesso') IS DISTINCT FROM 'true' THEN
        RAISE EXCEPTION 'MOVIMENTO_NAO_CONFIRMADO'
          USING ERRCODE = 'P0001';
      END IF;
    END LOOP;

    v_atendida := v_atendida + v_soma;
    v_pendente := v_pedida - v_atendida;

    UPDATE public.est_requisicao_itens
    SET quantidade_atendida = quantidade_atendida + v_soma,
        quantidade_pendente = quantidade_pendente - v_soma,
        status_item = CASE
          WHEN quantidade_pendente - v_soma <= 0 THEN 'atendido'
          ELSE 'parcial'
        END,
        local_id = CASE WHEN quantidade_atendida = 0 THEN v_local ELSE local_id END,
        updated_at = pg_catalog.now()
    WHERE id = v_item_id
      AND empresa_id = p_empresa_id
      AND quantidade_pendente >= v_soma;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'QUANTIDADE_ACIMA_PENDENTE'
        USING ERRCODE = '42501';
    END IF;

    v_baixados := v_baixados + 1;
  END LOOP;

  IF v_baixados = 0 THEN
    RETURN jsonb_build_object(
      'sucesso', false,
      'codigo', 'SEM_BAIXA',
      'itens_pulados', v_pulados,
      'mensagem', 'Nenhum item foi baixado. Verifique o saldo no local selecionado e as quantidades informadas.'
    );
  END IF;

  SELECT
    EXISTS (
      SELECT 1 FROM public.est_requisicao_itens i
      WHERE i.requisicao_id = p_requisicao_id
        AND i.empresa_id = p_empresa_id
        AND COALESCE(i.quantidade_pendente, 0) > 0
    ),
    EXISTS (
      SELECT 1 FROM public.est_requisicao_itens i
      WHERE i.requisicao_id = p_requisicao_id
        AND i.empresa_id = p_empresa_id
        AND COALESCE(i.quantidade_atendida, 0) > 0
    )
    INTO v_tem_pendencia, v_tem_baixa;

  IF NOT v_tem_pendencia AND v_tem_baixa THEN
    v_novo := 'atendida_total';
  ELSIF v_tem_baixa THEN
    v_novo := 'atendida_parcial';
  ELSE
    RAISE EXCEPTION 'SEM_ATENDIMENTO'
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM set_config('hugin.req_transicao', '1', true);

  UPDATE public.est_requisicoes
  SET status = v_novo,
      updated_at = pg_catalog.now()
  WHERE id = p_requisicao_id
    AND empresa_id = p_empresa_id;

  RETURN jsonb_build_object(
    'sucesso', true,
    'status', v_novo,
    'itens_baixados', v_baixados,
    'itens_pulados', v_pulados,
    'mensagem', CASE
      WHEN v_novo = 'atendida_total' THEN format('Requisição %s atendida totalmente com sucesso!', v_numero)
      ELSE format(
        'Atendimento parcial registrado. Status "%s" (%s item(ns) baixado(s) neste ciclo).',
        v_novo, v_baixados
      )
    END
  );
END;
$$;

COMMENT ON FUNCTION public.est_atender_requisicao(uuid, uuid, jsonb) IS
  'Atende requisição e baixa estoque na mesma transação. Quantidade só muda depois de est_registrar_movimento_atomico confirmar.';

REVOKE ALL ON FUNCTION public.est_atender_requisicao(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.est_atender_requisicao(uuid, uuid, jsonb)
  TO authenticated, service_role;
