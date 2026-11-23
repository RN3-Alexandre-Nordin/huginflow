-- Pacote 1B + 2: conferência e fechamento do recebimento de importados na mesma transação.
-- Não altera est_registrar_movimento_atomico nem o processamento de Kardex do recebimento comum.
--
-- Numeração ENT-: trigger BEFORE INSERT em est_entrada_lotes. O número nasce no INSERT,
-- sem reserva antecipada e sem auth.uid(). Não há insert legítimo com número manual
-- (os únicos consumidores gravavam um número reservado antes do INSERT).
-- Qualquer numero enviado pelo cliente é substituído. Prefixo do dia em America/Sao_Paulo.
-- Sequência por empresa e dia, sob pg_advisory_xact_lock. Índice único (empresa_id, numero).
--
-- Conversão no fechamento: unidade do item do pedido → cad_skus.unidade_estoque.
-- Mesma unidade usa fator 1. Senão, a linha específica do SKU em cad_sku_unidade_conversao
-- prevalece sobre a genérica (sku_id nulo). Sem fator válido, o fechamento inteiro é cancelado.
-- O fator gravado em est_entrada_itens é o histórico; mudança posterior do cadastro não o altera.
-- A quantidade do pedido e da leitura permanece na unidade de compra. O Kardex recebe a convertida.

ALTER TABLE public.com_importado_leituras
  ADD COLUMN IF NOT EXISTS movimento_id uuid NULL
    REFERENCES public.est_movimentos (id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS lote_entrada_id uuid NULL
    REFERENCES public.est_entrada_lotes (id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS origem text;

ALTER TABLE public.com_importado_leituras
  DROP CONSTRAINT IF EXISTS com_importado_leituras_origem_chk;
ALTER TABLE public.com_importado_leituras
  ADD CONSTRAINT com_importado_leituras_origem_chk
  CHECK (origem IS NULL OR origem IN ('sku', 'alternativo', 'ocr', 'manual'));

COMMENT ON COLUMN public.com_importado_leituras.origem IS
  'Como a leitura foi identificada: sku, alternativo, ocr ou manual. A RPC grava o valor depois de validar o código.';

COMMENT ON COLUMN public.com_importado_leituras.movimento_id IS
  'Movimento de estoque efetivado no fechamento. Permanece nulo enquanto a leitura não entra no estoque.';
COMMENT ON COLUMN public.com_importado_leituras.lote_entrada_id IS
  'Cabeçalho ENT- criado no fechamento desta leitura.';

CREATE INDEX IF NOT EXISTS idx_com_importado_leituras_pendentes
  ON public.com_importado_leituras (empresa_id, pedido_id, id)
  WHERE alocado_em IS NULL AND movimento_id IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.est_entrada_lotes
    GROUP BY empresa_id, numero
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Não foi possível criar a unicidade de ENT-: já existem números duplicados em est_entrada_lotes.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS est_entrada_lotes_empresa_numero_uq
  ON public.est_entrada_lotes (empresa_id, numero);

COMMENT ON INDEX public.est_entrada_lotes_empresa_numero_uq IS
  'Um número ENT- por empresa. O trigger BEFORE INSERT atribui o número sob trava transacional.';

CREATE OR REPLACE FUNCTION public.hugin_normalizar_codigo_etiqueta(p_codigo text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT pg_catalog.upper(
    pg_catalog.regexp_replace(
      COALESCE(p_codigo, ''),
      '[' || chr(9) || chr(10) || chr(13) || chr(32) || chr(160) || '-]+',
      '',
      'g'
    )
  );
$$;

COMMENT ON FUNCTION public.hugin_normalizar_codigo_etiqueta(text) IS
  'Código de etiqueta como texto: maiúsculas, sem espaços nem hífens, com zeros à esquerda.';

CREATE OR REPLACE FUNCTION public.est_entrada_lotes_atribuir_numero()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  v_prefix text;
  v_seq integer;
BEGIN
  IF NEW.empresa_id IS NULL THEN
    RAISE EXCEPTION 'Entrada sem empresa.';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(NEW.empresa_id::text || ':ENT')
  );

  v_prefix := 'ENT-' || pg_catalog.to_char(
    pg_catalog.now() AT TIME ZONE 'America/Sao_Paulo',
    'YYYYMMDD'
  ) || '-';

  SELECT COALESCE(
    pg_catalog.max(pg_catalog.substr(numero, pg_catalog.length(v_prefix) + 1)::integer),
    0
  ) + 1
    INTO v_seq
  FROM public.est_entrada_lotes
  WHERE empresa_id = NEW.empresa_id
    AND numero LIKE v_prefix || '%'
    AND pg_catalog.substr(numero, pg_catalog.length(v_prefix) + 1) ~ '^[0-9]+$';

  NEW.numero := v_prefix || pg_catalog.lpad(v_seq::text, 4, '0');
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.est_entrada_lotes_atribuir_numero() IS
  'Atribui ENT-YYYYMMDD-NNNN no INSERT. Ignora número vindo do cliente. Não consulta auth.uid().';

DROP TRIGGER IF EXISTS est_entrada_lotes_atribuir_numero ON public.est_entrada_lotes;
CREATE TRIGGER est_entrada_lotes_atribuir_numero
  BEFORE INSERT ON public.est_entrada_lotes
  FOR EACH ROW
  EXECUTE FUNCTION public.est_entrada_lotes_atribuir_numero();

CREATE UNIQUE INDEX IF NOT EXISTS com_importado_leituras_movimento_uq
  ON public.com_importado_leituras (movimento_id)
  WHERE movimento_id IS NOT NULL;

COMMENT ON INDEX public.com_importado_leituras_movimento_uq IS
  'Cada movimento de estoque aloca no máximo uma leitura de importado.';

-- Contexto do usuário logado. Não recebe empresa nem usuário do cliente.
CREATE OR REPLACE FUNCTION public.com_importado_exigir_acesso()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_auth uuid := auth.uid();
  v_usuario_id uuid;
  v_empresa_id uuid;
  v_role text;
  v_ativo boolean;
  v_limpeza text;
  v_ligado boolean;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'Sessão sem empresa.';
  END IF;

  SELECT u.id, u.empresa_id, u.role_global, COALESCE(u.ativo, true)
    INTO STRICT v_usuario_id, v_empresa_id, v_role, v_ativo
  FROM public.usuarios u
  WHERE u.auth_user_id = v_auth;

  IF v_ativo IS NOT TRUE OR v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'Sessão sem empresa.';
  END IF;

  IF v_role IS DISTINCT FROM 'superadmin' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.empresa_addons ea
      JOIN public.addon_registry ar
        ON ar.codigo = ea.addon_codigo
       AND ar.ativo
      WHERE ea.empresa_id = v_empresa_id
        AND ea.addon_codigo = 'compras'
        AND ea.enabled
        AND ea.commercial_status IN ('active', 'trial', 'courtesy')
        AND (ea.starts_at IS NULL OR ea.starts_at <= pg_catalog.now())
        AND (ea.ends_at IS NULL OR ea.ends_at >= pg_catalog.now())
    ) THEN
      RAISE EXCEPTION 'Addon Compras não está ativo nesta empresa.';
    END IF;

    IF NOT (
      public.check_permission('compras_conferencia', 'create')
      OR public.check_permission('compras_conferencia', 'edit')
    ) THEN
      RAISE EXCEPTION 'Sem permissão para conferir recebimento.';
    END IF;
  END IF;

  SELECT c.recebimento_importados, c.importados_limpeza
    INTO v_ligado, v_limpeza
  FROM public.com_config c
  WHERE c.empresa_id = v_empresa_id;

  IF NOT FOUND OR v_ligado IS NOT TRUE THEN
    RAISE EXCEPTION 'O recebimento de importados está desligado.';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'usuario_id', v_usuario_id,
    'empresa_id', v_empresa_id,
    'limpeza', COALESCE(v_limpeza, 'baixa_manual')
  );
EXCEPTION
  WHEN no_data_found THEN
    RAISE EXCEPTION 'Sessão sem empresa.';
  WHEN too_many_rows THEN
    RAISE EXCEPTION 'Sessão com mais de um usuário vinculado.';
END;
$$;

COMMENT ON FUNCTION public.com_importado_exigir_acesso() IS
  'Valida auth.uid(), usuário ativo, addon Compras, permissão de conferência e configuração do importado. Uso interno.';

CREATE OR REPLACE FUNCTION public.com_importado_skus_do_codigo(
  p_empresa uuid,
  p_fornecedor uuid,
  p_codigo text
)
RETURNS TABLE (sku_id uuid, oficial boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT s.id, true
  FROM public.cad_skus s
  WHERE s.empresa_id = p_empresa
    AND COALESCE(s.ativo, true)
    AND public.hugin_normalizar_codigo_etiqueta(s.codigo)
      = public.hugin_normalizar_codigo_etiqueta(p_codigo)
  UNION ALL
  SELECT s.id, true
  FROM public.cad_skus s
  WHERE s.empresa_id = p_empresa
    AND COALESCE(s.ativo, true)
    AND NULLIF(pg_catalog.btrim(s.codigo_barras), '') IS NOT NULL
    AND public.hugin_normalizar_codigo_etiqueta(s.codigo_barras)
      = public.hugin_normalizar_codigo_etiqueta(p_codigo)
  UNION ALL
  SELECT d.sku_id, false
  FROM public.cad_sku_depara d
  JOIN public.cad_skus s
    ON s.id = d.sku_id
   AND s.empresa_id = d.empresa_id
   AND COALESCE(s.ativo, true)
  WHERE d.empresa_id = p_empresa
    AND COALESCE(d.ativo, true)
    AND p_fornecedor IS NOT NULL
    AND d.pessoa_id = p_fornecedor
    AND public.hugin_normalizar_codigo_etiqueta(d.codigo_parceiro)
      = public.hugin_normalizar_codigo_etiqueta(p_codigo);
$$;

COMMENT ON FUNCTION public.com_importado_skus_do_codigo(uuid, uuid, text) IS
  'SKUs da empresa cujo código, código de barras ou de-para deste fornecedor normaliza para o código lido. Uso interno.';

CREATE OR REPLACE FUNCTION public.com_confirmar_leitura_importada(
  p_pedido_id uuid,
  p_pedido_item_id uuid,
  p_codigo_lido text,
  p_quantidade numeric,
  p_local_id uuid,
  p_local_temporario text,
  p_origem text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_ctx jsonb;
  v_empresa uuid;
  v_usuario uuid;
  v_limpeza text;
  v_status text;
  v_qtd_pedida numeric;
  v_sku uuid;
  v_descricao text;
  v_ja numeric;
  v_local text;
  v_temp text;
  v_rec uuid;
  v_leitura uuid;
  v_forn uuid;
  v_skus uuid[];
  v_norm text;
  v_oficial boolean;
  v_origem text;
BEGIN
  v_ctx := public.com_importado_exigir_acesso();
  v_empresa := (v_ctx->>'empresa_id')::uuid;
  v_usuario := (v_ctx->>'usuario_id')::uuid;
  v_limpeza := v_ctx->>'limpeza';

  IF p_quantidade IS NULL OR p_quantidade <= 0 THEN
    RAISE EXCEPTION 'Informe a quantidade.';
  END IF;
  v_norm := public.hugin_normalizar_codigo_etiqueta(p_codigo_lido);
  IF v_norm IS NULL OR v_norm = '' THEN
    RAISE EXCEPTION 'Não foi possível ler o número da etiqueta.';
  END IF;
  IF p_origem IS NULL OR p_origem NOT IN ('sku', 'alternativo', 'ocr', 'manual') THEN
    RAISE EXCEPTION 'Origem da identificação inválida.';
  END IF;

  v_local := NULLIF(pg_catalog.btrim(COALESCE(p_local_id::text, '')), '');
  v_temp := NULLIF(pg_catalog.btrim(COALESCE(p_local_temporario, '')), '');
  IF v_local IS NOT NULL AND v_temp IS NOT NULL THEN
    RAISE EXCEPTION 'Escolha o local de estoque ou o local temporário.';
  END IF;
  IF v_local IS NULL AND v_temp IS NULL THEN
    RAISE EXCEPTION 'Indique o local de estoque ou o local temporário antes de confirmar.';
  END IF;

  SELECT p.status, i.quantidade, i.sku_id, i.descricao, p.fornecedor_id
    INTO v_status, v_qtd_pedida, v_sku, v_descricao, v_forn
  FROM public.com_pedidos p
  JOIN public.com_pedido_itens i
    ON i.pedido_id = p.id
   AND i.empresa_id = p.empresa_id
   AND i.id = p_pedido_item_id
  WHERE p.id = p_pedido_id
    AND p.empresa_id = v_empresa
  FOR UPDATE OF p, i;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado.';
  END IF;
  IF v_status NOT IN ('aprovado', 'recebido_parcial') THEN
    RAISE EXCEPTION 'Este pedido não está para conferência.';
  END IF;

  IF v_sku IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.cad_skus s
    WHERE s.id = v_sku
      AND s.empresa_id = v_empresa
      AND COALESCE(s.ativo, true)
  ) THEN
    RAISE EXCEPTION 'O item não está vinculado a um SKU desta empresa.';
  END IF;

  SELECT COALESCE(pg_catalog.array_agg(m.sku_id), ARRAY[]::uuid[]),
         COALESCE(pg_catalog.bool_or(m.oficial), false)
    INTO v_skus, v_oficial
  FROM (
    SELECT f.sku_id, pg_catalog.bool_or(f.oficial) AS oficial
    FROM public.com_importado_skus_do_codigo(v_empresa, v_forn, v_norm) f
    GROUP BY f.sku_id
  ) m;

  IF COALESCE(pg_catalog.array_length(v_skus, 1), 0) = 1 THEN
    IF v_sku IS DISTINCT FROM v_skus[1] THEN
      RAISE EXCEPTION 'O código identifica outro SKU. A confirmação foi recusada.';
    END IF;
    IF p_origem = 'ocr' THEN
      v_origem := 'ocr';
    ELSE
      v_origem := CASE WHEN v_oficial THEN 'sku' ELSE 'alternativo' END;
    END IF;
  ELSIF COALESCE(pg_catalog.array_length(v_skus, 1), 0) > 1 THEN
    IF p_origem NOT IN ('manual', 'ocr') OR NOT (v_sku = ANY (v_skus)) THEN
      RAISE EXCEPTION 'O código corresponde a mais de um produto. Confirme o item manualmente.';
    END IF;
    v_origem := p_origem;
  ELSIF p_origem IS DISTINCT FROM 'manual' THEN
    RAISE EXCEPTION 'O código não identifica um SKU desta empresa. Confirme o item manualmente.';
  ELSE
    v_origem := 'manual';
  END IF;

  IF p_local_id IS NOT NULL AND v_temp IS NULL AND NOT EXISTS (
    SELECT 1
    FROM public.cad_locais_estoque l
    WHERE l.id = p_local_id
      AND l.empresa_id = v_empresa
  ) THEN
    RAISE EXCEPTION 'Local de estoque inválido para esta empresa.';
  END IF;

  SELECT COALESCE(pg_catalog.sum(ri.quantidade), 0)
    INTO v_ja
  FROM public.com_recebimento_itens ri
  WHERE ri.empresa_id = v_empresa
    AND ri.pedido_item_id = p_pedido_item_id;

  IF p_quantidade - (v_qtd_pedida - v_ja) > 0.0001 THEN
    RAISE EXCEPTION 'Quantidade passa do saldo deste item.';
  END IF;

  INSERT INTO public.com_recebimentos (
    empresa_id, pedido_id, usuario_id, observacao
  ) VALUES (
    v_empresa, p_pedido_id, v_usuario, 'Recebimento de importado'
  ) RETURNING id INTO v_rec;

  INSERT INTO public.com_recebimento_itens (
    empresa_id, recebimento_id, pedido_item_id, quantidade,
    divergencia_quantidade, divergencia_preco
  ) VALUES (
    v_empresa,
    v_rec,
    p_pedido_item_id,
    p_quantidade,
    pg_catalog.round((p_quantidade - v_qtd_pedida)::numeric, 4),
    NULL
  );

  INSERT INTO public.com_importado_leituras (
    empresa_id, pedido_id, pedido_item_id, recebimento_id,
    codigo_lido, codigo_normalizado, quantidade,
    local_id, local_temporario, limpeza, usuario_id, origem
  ) VALUES (
    v_empresa,
    p_pedido_id,
    p_pedido_item_id,
    v_rec,
    pg_catalog.btrim(p_codigo_lido),
    v_norm,
    p_quantidade,
    CASE WHEN v_temp IS NULL THEN p_local_id ELSE NULL END,
    v_temp,
    CASE WHEN v_temp IS NULL THEN NULL ELSE v_limpeza END,
    v_usuario,
    v_origem
  ) RETURNING id INTO v_leitura;

  RETURN pg_catalog.jsonb_build_object(
    'ok', true,
    'codigo', v_norm,
    'codigo_lido', pg_catalog.btrim(p_codigo_lido),
    'origem', v_origem,
    'descricao', v_descricao,
    'recebimento_id', v_rec,
    'leitura_id', v_leitura
  );
END;
$$;

COMMENT ON FUNCTION public.com_confirmar_leitura_importada(uuid, uuid, text, numeric, uuid, text, text) IS
  'Grava recebimento, item e leitura do importado na mesma transação. O código normalizado é calculado só a partir do código lido.';

CREATE OR REPLACE FUNCTION public.com_fechar_recebimento_importado(p_pedido_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_ctx jsonb;
  v_empresa uuid;
  v_usuario uuid;
  v_pedido public.com_pedidos%ROWTYPE;
  v_leitura public.com_importado_leituras%ROWTYPE;
  v_item record;
  v_sku record;
  v_lote uuid;
  v_local_id uuid;
  v_item_entrada uuid;
  v_numero text;
  v_linha integer;
  v_res jsonb;
  v_movimento uuid;
  v_entradas text[] := ARRAY[]::text[];
  v_avisos text[] := ARRAY[]::text[];
  v_temporarios integer := 0;
  v_moveu integer := 0;
  v_algum boolean := false;
  v_fechou boolean := true;
  v_qtd numeric;
  v_doc text;
  v_um_origem text;
  v_um_destino text;
  v_fator numeric;
  v_qtd_estoque numeric;
  v_nfat integer;
BEGIN
  v_ctx := public.com_importado_exigir_acesso();
  v_empresa := (v_ctx->>'empresa_id')::uuid;
  v_usuario := (v_ctx->>'usuario_id')::uuid;

  SELECT *
    INTO v_pedido
  FROM public.com_pedidos p
  WHERE p.id = p_pedido_id
    AND p.empresa_id = v_empresa
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado.';
  END IF;
  IF v_pedido.status NOT IN ('aprovado', 'recebido_parcial', 'recebido') THEN
    RAISE EXCEPTION 'Este pedido não está para conferência.';
  END IF;

  PERFORM 1
  FROM public.com_importado_leituras l
  WHERE l.empresa_id = v_empresa
    AND l.pedido_id = v_pedido.id
    AND l.alocado_em IS NULL
  ORDER BY l.id
  FOR UPDATE;

  -- Movimento já gravado só conta se a linha do estoque bater com leitura, pedido, SKU e empresa.
  FOR v_leitura IN
    SELECT l.*
    FROM public.com_importado_leituras l
    WHERE l.empresa_id = v_empresa
      AND l.pedido_id = v_pedido.id
      AND l.movimento_id IS NOT NULL
      AND l.alocado_em IS NULL
    ORDER BY l.id
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM public.est_movimentos m
      JOIN public.com_pedido_itens i
        ON i.id = v_leitura.pedido_item_id
       AND i.pedido_id = v_pedido.id
       AND i.empresa_id = v_empresa
      WHERE m.id = v_leitura.movimento_id
        AND m.empresa_id = v_empresa
        AND m.sku_id = i.sku_id
        AND m.tipo = 'entrada'
        AND m.lote_entrada_id IS NOT NULL
        AND m.lote_entrada_id IS NOT DISTINCT FROM v_leitura.lote_entrada_id
    ) THEN
      RAISE EXCEPTION 'Leitura com movimento incompatível com o pedido. O fechamento foi cancelado.';
    END IF;

    UPDATE public.com_importado_leituras
    SET alocado_em = pg_catalog.now()
    WHERE id = v_leitura.id
      AND empresa_id = v_empresa
      AND movimento_id = v_leitura.movimento_id
      AND alocado_em IS NULL;
  END LOOP;

  FOR v_leitura IN
    SELECT l.*
    FROM public.com_importado_leituras l
    WHERE l.empresa_id = v_empresa
      AND l.pedido_id = v_pedido.id
      AND l.alocado_em IS NULL
      AND l.movimento_id IS NULL
    ORDER BY l.local_id NULLS LAST, l.created_at, l.id
  LOOP
    IF v_leitura.local_temporario IS NOT NULL THEN
      v_temporarios := v_temporarios + 1;
      CONTINUE;
    END IF;
    IF v_leitura.local_id IS NULL THEN
      RAISE EXCEPTION 'Leitura sem local de estoque nem local temporário.';
    END IF;

    SELECT i.id, i.pedido_id, i.empresa_id, i.sku_id, i.unidade, i.quantidade
      INTO v_item
    FROM public.com_pedido_itens i
    WHERE i.id = v_leitura.pedido_item_id
      AND i.pedido_id = v_pedido.id
      AND i.empresa_id = v_empresa;
    IF NOT FOUND OR v_item.sku_id IS NULL THEN
      RAISE EXCEPTION 'Há item conferido sem SKU de estoque. O fechamento foi cancelado.';
    END IF;

    SELECT s.id, s.empresa_id, COALESCE(s.ativo, true) AS ativo,
           COALESCE(s.controla_lote, false) AS controla_lote,
           COALESCE(s.controla_serie, false) AS controla_serie
      INTO v_sku
    FROM public.cad_skus s
    WHERE s.id = v_item.sku_id
      AND s.empresa_id = v_empresa;
    IF NOT FOUND OR v_sku.ativo IS NOT TRUE THEN
      RAISE EXCEPTION 'SKU inválido para esta empresa. O fechamento foi cancelado.';
    END IF;
    IF v_sku.controla_lote OR v_sku.controla_serie THEN
      RAISE EXCEPTION 'SKU exige lote ou série, que esta conferência não informa. O fechamento foi cancelado.';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.cad_locais_estoque loc
      WHERE loc.id = v_leitura.local_id
        AND loc.empresa_id = v_empresa
    ) THEN
      RAISE EXCEPTION 'Local de estoque inválido para esta empresa.';
    END IF;
  END LOOP;

  IF v_pedido.fornecedor_id IS NULL AND EXISTS (
    SELECT 1
    FROM public.com_importado_leituras l
    WHERE l.empresa_id = v_empresa
      AND l.pedido_id = v_pedido.id
      AND l.alocado_em IS NULL
      AND l.movimento_id IS NULL
      AND l.local_id IS NOT NULL
      AND l.local_temporario IS NULL
  ) THEN
    RAISE EXCEPTION 'O pedido não tem fornecedor para a entrada de estoque.';
  END IF;

  v_doc := COALESCE(NULLIF(pg_catalog.btrim(v_pedido.codigo_fornecedor), ''), v_pedido.numero);

  FOR v_local_id IN
    SELECT DISTINCT l.local_id
    FROM public.com_importado_leituras l
    WHERE l.empresa_id = v_empresa
      AND l.pedido_id = v_pedido.id
      AND l.alocado_em IS NULL
      AND l.movimento_id IS NULL
      AND l.local_id IS NOT NULL
      AND l.local_temporario IS NULL
    ORDER BY 1
  LOOP
  v_lote := NULL;
  v_numero := NULL;
  INSERT INTO public.est_entrada_lotes (
    empresa_id, origem, status, pessoa_id, local_id,
    documento, observacao, usuario_id, movimento_em
  ) VALUES (
    v_empresa, 'lote_tela', 'processando', v_pedido.fornecedor_id, v_local_id,
    v_doc, 'Recebimento de importados', v_usuario, pg_catalog.now()
  ) RETURNING id, numero INTO v_lote, v_numero;

    v_linha := 0;
    FOR v_leitura IN
      SELECT l.*
      FROM public.com_importado_leituras l
      WHERE l.empresa_id = v_empresa
        AND l.pedido_id = v_pedido.id
        AND l.local_id = v_local_id
        AND l.local_temporario IS NULL
        AND l.alocado_em IS NULL
        AND l.movimento_id IS NULL
      ORDER BY l.created_at, l.id
    LOOP
      SELECT i.sku_id,
             COALESCE(NULLIF(pg_catalog.btrim(i.unidade), ''), '') AS unidade,
             s.codigo AS sku_codigo,
             COALESCE(NULLIF(pg_catalog.btrim(s.unidade_estoque), ''), '') AS unidade_estoque
        INTO v_item
      FROM public.com_pedido_itens i
      JOIN public.cad_skus s
        ON s.id = i.sku_id
       AND s.empresa_id = i.empresa_id
      WHERE i.id = v_leitura.pedido_item_id
        AND i.empresa_id = v_empresa
        AND i.pedido_id = v_pedido.id;

      IF NOT FOUND OR v_item.sku_id IS NULL THEN
        RAISE EXCEPTION 'Há item conferido sem SKU de estoque. O fechamento foi cancelado.';
      END IF;
      IF v_item.unidade = '' THEN
        RAISE EXCEPTION 'O item do pedido não tem unidade de compra. O fechamento foi cancelado.';
      END IF;
      IF v_item.unidade_estoque = '' THEN
        RAISE EXCEPTION 'O SKU % não tem unidade de estoque. O fechamento foi cancelado.', v_item.sku_codigo;
      END IF;

      v_um_origem := pg_catalog.upper(v_item.unidade);
      v_um_destino := pg_catalog.upper(v_item.unidade_estoque);
      IF v_um_origem = v_um_destino THEN
        v_fator := 1;
      ELSE
        SELECT pg_catalog.count(*)::integer, min(c.fator_conversao)
          INTO v_nfat, v_fator
        FROM public.cad_sku_unidade_conversao c
        WHERE c.empresa_id = v_empresa
          AND c.sku_id = v_item.sku_id
          AND pg_catalog.upper(pg_catalog.btrim(c.unidade_origem)) = v_um_origem
          AND pg_catalog.upper(pg_catalog.btrim(c.unidade_destino)) = v_um_destino;
        IF v_nfat > 1 THEN
          RAISE EXCEPTION
            'Há fatores de conversão conflitantes para o SKU %: % → %. O fechamento foi cancelado.',
            v_item.sku_codigo, v_um_origem, v_um_destino;
        END IF;
        IF v_nfat = 0 THEN
          SELECT pg_catalog.count(*)::integer, min(c.fator_conversao)
            INTO v_nfat, v_fator
          FROM public.cad_sku_unidade_conversao c
          WHERE c.empresa_id = v_empresa
            AND c.sku_id IS NULL
            AND pg_catalog.upper(pg_catalog.btrim(c.unidade_origem)) = v_um_origem
            AND pg_catalog.upper(pg_catalog.btrim(c.unidade_destino)) = v_um_destino;
          IF v_nfat > 1 THEN
            RAISE EXCEPTION
              'Há fatores de conversão conflitantes para o SKU %: % → %. O fechamento foi cancelado.',
              v_item.sku_codigo, v_um_origem, v_um_destino;
          END IF;
        END IF;
        IF COALESCE(v_nfat, 0) = 0 OR v_fator IS NULL THEN
          RAISE EXCEPTION
            'Não existe fator de conversão cadastrado para o SKU %: % → %. Cadastre a conversão antes de finalizar o recebimento.',
            v_item.sku_codigo, v_um_origem, v_um_destino;
        END IF;
      END IF;
      IF v_fator IS NULL OR v_fator <= 0 THEN
        RAISE EXCEPTION
          'Fator de conversão inválido para o SKU %: % → %. O fechamento foi cancelado.',
          v_item.sku_codigo, v_um_origem, v_um_destino;
      END IF;

      v_qtd_estoque := v_leitura.quantidade * v_fator;
      IF v_qtd_estoque <= 0
         OR v_leitura.quantidade IS DISTINCT FROM pg_catalog.round(v_leitura.quantidade, 4)
         OR v_fator IS DISTINCT FROM pg_catalog.round(v_fator, 6)
         OR v_qtd_estoque IS DISTINCT FROM pg_catalog.round(v_qtd_estoque, 4) THEN
        RAISE EXCEPTION
          'A quantidade convertida do SKU % não cabe na precisão do estoque sem arredondar. O fechamento foi cancelado.',
          v_item.sku_codigo;
      END IF;

      v_linha := v_linha + 1;
      INSERT INTO public.est_entrada_itens (
        empresa_id, lote_id, linha, sku_id, unidade_origem, quantidade_origem,
        unidade_estoque, quantidade_estoque, fator_conversao, status
      ) VALUES (
        v_empresa, v_lote, v_linha, v_item.sku_id, v_item.unidade, v_leitura.quantidade,
        v_item.unidade_estoque, v_qtd_estoque, v_fator, 'ok'
      ) RETURNING id INTO v_item_entrada;

      v_res := public.est_registrar_movimento_atomico(
        p_empresa_id => v_empresa,
        p_tipo => 'entrada',
        p_sku_id => v_item.sku_id,
        p_local_id => v_local_id,
        p_quantidade => v_qtd_estoque,
        p_documento => COALESCE(v_doc, v_numero),
        p_pessoa_id => v_pedido.fornecedor_id,
        p_origem => 'lote_tela',
        p_lote_entrada_id => v_lote,
        p_motivo => 'Recebimento de importados',
        p_usuario_id => v_usuario,
        p_permitir_saldo_negativo => false,
        p_lote_produto_id => NULL,
        p_numero_serie => NULL
      );

      v_movimento := NULLIF(v_res->>'movimento_id', '')::uuid;
      IF COALESCE(v_res->>'success', '') IS DISTINCT FROM 'true'
         OR v_movimento IS NULL
         OR NULLIF(v_res->>'empresa_id', '')::uuid IS DISTINCT FROM v_empresa
         OR NULLIF(v_res->>'sku_id', '')::uuid IS DISTINCT FROM v_item.sku_id
         OR NULLIF(v_res->>'lote_produto_id', '') IS NOT NULL
         OR NULLIF(v_res->>'serie_id', '') IS NOT NULL
         OR NOT EXISTS (
           SELECT 1
           FROM public.est_movimentos m
           WHERE m.id = v_movimento
             AND m.empresa_id = v_empresa
             AND m.sku_id = v_item.sku_id
             AND m.tipo = 'entrada'
             AND m.lote_entrada_id = v_lote
             AND m.quantidade = v_qtd_estoque
         ) THEN
        RAISE EXCEPTION 'Movimento de estoque não confirmado. O fechamento foi cancelado.';
      END IF;

      UPDATE public.est_entrada_itens
      SET movimento_id = v_movimento,
          updated_at = pg_catalog.now()
      WHERE id = v_item_entrada
        AND empresa_id = v_empresa;

      UPDATE public.com_importado_leituras
      SET alocado_em = pg_catalog.now(),
          movimento_id = v_movimento,
          lote_entrada_id = v_lote
      WHERE id = v_leitura.id
        AND empresa_id = v_empresa
        AND alocado_em IS NULL
        AND movimento_id IS NULL;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'A leitura mudou durante o fechamento. A operação foi cancelada.';
      END IF;

      v_moveu := v_moveu + 1;
    END LOOP;

    UPDATE public.est_entrada_lotes
    SET status = 'concluido',
        updated_at = pg_catalog.now()
    WHERE id = v_lote
      AND empresa_id = v_empresa;

    v_entradas := pg_catalog.array_append(v_entradas, v_numero);
  END LOOP;

  IF v_temporarios > 0 THEN
    v_avisos := pg_catalog.array_append(
      v_avisos,
      v_temporarios::text || ' leitura(s) ficaram no local temporário e não entraram no estoque.'
    );
  END IF;

  FOR v_item IN
    SELECT i.id, i.quantidade
    FROM public.com_pedido_itens i
    WHERE i.pedido_id = v_pedido.id
      AND i.empresa_id = v_empresa
  LOOP
    SELECT COALESCE(pg_catalog.sum(ri.quantidade), 0)
      INTO v_qtd
    FROM public.com_recebimento_itens ri
    WHERE ri.empresa_id = v_empresa
      AND ri.pedido_item_id = v_item.id;
    IF v_qtd > 0 THEN
      v_algum := true;
    END IF;
    IF v_item.quantidade - v_qtd > 0.0001 THEN
      v_fechou := false;
    END IF;
  END LOOP;

  IF NOT v_algum THEN
    RAISE EXCEPTION 'Confirme ao menos um item antes de fechar.';
  END IF;

  UPDATE public.com_pedidos
  SET status = CASE WHEN v_fechou THEN 'recebido' ELSE 'recebido_parcial' END
  WHERE id = v_pedido.id
    AND empresa_id = v_empresa;

  RETURN pg_catalog.jsonb_build_object(
    'ok', true,
    'entradas', pg_catalog.to_jsonb(v_entradas),
    'avisos', pg_catalog.to_jsonb(v_avisos),
    'fechou', v_fechou,
    'idempotente', v_moveu = 0
  );
END;
$$;

COMMENT ON FUNCTION public.com_fechar_recebimento_importado(uuid) IS
  'Fecha o recebimento de importados: converte para a unidade de estoque, grava entradas e movimentos e o status na mesma transação.';

-- Aprendizado do código do importador. Transação própria, separada da leitura.
-- Reutiliza cad_sku_depara: um código por SKU e fornecedor, um SKU por código e fornecedor.
-- Não grava usuário: a tabela só tem created_at e updated_at.
CREATE OR REPLACE FUNCTION public.com_aprender_codigo_importado(
  p_pedido_id uuid,
  p_pedido_item_id uuid,
  p_codigo_lido text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_ctx jsonb;
  v_empresa uuid;
  v_sku uuid;
  v_forn uuid;
  v_norm text;
  v_lido text;
  v_existente public.cad_sku_depara%ROWTYPE;
  v_outro uuid;
BEGIN
  v_ctx := public.com_importado_exigir_acesso();
  v_empresa := (v_ctx->>'empresa_id')::uuid;

  IF NOT (
    public.check_permission('skus', 'create')
    OR public.check_permission('skus', 'edit')
  ) THEN
    RAISE EXCEPTION 'O cadastro deste código exige autorização de manutenção do de-para.';
  END IF;

  v_lido := pg_catalog.btrim(COALESCE(p_codigo_lido, ''));
  v_norm := public.hugin_normalizar_codigo_etiqueta(v_lido);
  IF v_norm IS NULL OR v_norm = '' THEN
    RAISE EXCEPTION 'Não foi possível ler o número da etiqueta.';
  END IF;

  SELECT i.sku_id, p.fornecedor_id
    INTO v_sku, v_forn
  FROM public.com_pedidos p
  JOIN public.com_pedido_itens i
    ON i.pedido_id = p.id
   AND i.empresa_id = p.empresa_id
   AND i.id = p_pedido_item_id
  WHERE p.id = p_pedido_id
    AND p.empresa_id = v_empresa
  FOR UPDATE OF p;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado.';
  END IF;
  IF v_forn IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.crm_leads l
    WHERE l.id = v_forn
      AND l.empresa_id = v_empresa
  ) THEN
    RAISE EXCEPTION 'Fornecedor inválido para esta empresa.';
  END IF;
  IF v_sku IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.cad_skus s
    WHERE s.id = v_sku
      AND s.empresa_id = v_empresa
      AND COALESCE(s.ativo, true)
  ) THEN
    RAISE EXCEPTION 'O item não está vinculado a um SKU desta empresa.';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(v_empresa::text || ':' || v_forn::text || ':' || v_norm)
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(v_empresa::text || ':' || v_forn::text || ':' || v_sku::text)
  );

  SELECT d.*
    INTO v_existente
  FROM public.cad_sku_depara d
  WHERE d.empresa_id = v_empresa
    AND d.pessoa_id = v_forn
    AND public.hugin_normalizar_codigo_etiqueta(d.codigo_parceiro) = v_norm
  FOR UPDATE;

  IF FOUND THEN
    IF v_existente.sku_id IS DISTINCT FROM v_sku THEN
      RAISE EXCEPTION 'Este código já está associado a outro SKU deste fornecedor.';
    END IF;
    IF v_existente.ativo IS NOT TRUE THEN
      UPDATE public.cad_sku_depara
      SET ativo = true, updated_at = pg_catalog.now()
      WHERE id = v_existente.id
        AND empresa_id = v_empresa;
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'ok', true,
      'status', 'existente',
      'codigo', v_norm,
      'codigo_lido', v_lido,
      'sku_id', v_sku,
      'pessoa_id', v_forn
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.cad_sku_depara d
    WHERE d.empresa_id = v_empresa
      AND d.pessoa_id = v_forn
      AND d.sku_id = v_sku
  ) THEN
    RAISE EXCEPTION 'Este SKU já possui um código deste fornecedor.';
  END IF;

  SELECT s.id
    INTO v_outro
  FROM public.cad_skus s
  WHERE s.empresa_id = v_empresa
    AND COALESCE(s.ativo, true)
    AND s.id IS DISTINCT FROM v_sku
    AND (
      public.hugin_normalizar_codigo_etiqueta(s.codigo) = v_norm
      OR (
        NULLIF(pg_catalog.btrim(s.codigo_barras), '') IS NOT NULL
        AND public.hugin_normalizar_codigo_etiqueta(s.codigo_barras) = v_norm
      )
    )
  LIMIT 1;
  IF v_outro IS NOT NULL THEN
    RAISE EXCEPTION 'Este código já identifica outro SKU da empresa.';
  END IF;

  INSERT INTO public.cad_sku_depara (
    empresa_id, sku_id, pessoa_id, codigo_parceiro, observacao, ativo, updated_at
  ) VALUES (
    v_empresa, v_sku, v_forn, v_norm, NULL, true, pg_catalog.now()
  );

  IF (
    SELECT pg_catalog.count(*)
    FROM public.cad_sku_depara d
    WHERE d.empresa_id = v_empresa
      AND d.pessoa_id = v_forn
      AND public.hugin_normalizar_codigo_etiqueta(d.codigo_parceiro) = v_norm
  ) <> 1 THEN
    RAISE EXCEPTION 'Este código já está associado a outro SKU deste fornecedor.';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'ok', true,
    'status', 'criado',
    'codigo', v_norm,
    'codigo_lido', v_lido,
    'sku_id', v_sku,
    'pessoa_id', v_forn
  );
END;
$$;

COMMENT ON FUNCTION public.com_aprender_codigo_importado(uuid, uuid, text) IS
  'Grava o código normalizado em cad_sku_depara. O texto lido fica em com_importado_leituras. Idempotente para o mesmo SKU. Não substitui vínculo existente.';

CREATE OR REPLACE FUNCTION public.com_prever_etiquetas_importado(
  p_pedido_id uuid,
  p_codigos text[]
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_ctx jsonb;
  v_empresa uuid;
  v_forn uuid;
  v_status text;
  v_candidatos jsonb;
BEGIN
  v_ctx := public.com_importado_exigir_acesso();
  v_empresa := (v_ctx->>'empresa_id')::uuid;

  SELECT p.fornecedor_id
    INTO v_forn
  FROM public.com_pedidos p
  WHERE p.id = p_pedido_id
    AND p.empresa_id = v_empresa;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado.';
  END IF;

  WITH entradas AS (
    SELECT pg_catalog.btrim(c.codigo) AS lido,
           public.hugin_normalizar_codigo_etiqueta(c.codigo) AS norm
    FROM pg_catalog.unnest(COALESCE(p_codigos, ARRAY[]::text[])) AS c(codigo)
  ),
  validas AS (
    SELECT lido, norm FROM entradas WHERE norm <> ''
  ),
  achados AS (
    SELECT f.sku_id, pg_catalog.bool_or(f.oficial) AS oficial, min(v.lido) AS lido, v.norm
    FROM validas v
    JOIN public.com_importado_skus_do_codigo(v_empresa, v_forn, v.norm) f ON true
    GROUP BY f.sku_id, v.norm
  ),
  linhas AS (
    SELECT i.id AS pedido_item_id, i.sku_id, i.descricao,
           i.quantidade - COALESCE((
             SELECT pg_catalog.sum(ri.quantidade)
             FROM public.com_recebimento_itens ri
             WHERE ri.empresa_id = v_empresa
               AND ri.pedido_item_id = i.id
           ), 0) AS saldo
    FROM public.com_pedido_itens i
    WHERE i.pedido_id = p_pedido_id
      AND i.empresa_id = v_empresa
      AND i.sku_id IS NOT NULL
  ),
  candidatos AS (
    SELECT a.sku_id, l.pedido_item_id, l.descricao, a.lido, a.norm,
           CASE WHEN a.oficial THEN 'sku' ELSE 'alternativo' END AS origem,
           l.saldo
    FROM achados a
    JOIN linhas l ON l.sku_id = a.sku_id AND l.saldo > 0
  )
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
           'sku_id', c.sku_id,
           'pedido_item_id', c.pedido_item_id,
           'descricao', c.descricao,
           'codigo_lido', c.lido,
           'codigo', c.norm,
           'origem', c.origem,
           'saldo', c.saldo
         )), '[]'::jsonb)
    INTO v_candidatos
  FROM candidatos c;

  IF NOT EXISTS (SELECT 1 FROM pg_catalog.unnest(COALESCE(p_codigos, ARRAY[]::text[])) AS c(codigo)
                 WHERE public.hugin_normalizar_codigo_etiqueta(c.codigo) <> '') THEN
    RETURN pg_catalog.jsonb_build_object('status', 'nenhum', 'candidatos', '[]'::jsonb);
  END IF;

  IF pg_catalog.jsonb_array_length(v_candidatos) = 0 THEN
    IF EXISTS (
      SELECT 1
      FROM pg_catalog.unnest(COALESCE(p_codigos, ARRAY[]::text[])) AS c(codigo)
      JOIN public.com_importado_skus_do_codigo(
        v_empresa, v_forn, public.hugin_normalizar_codigo_etiqueta(c.codigo)
      ) f ON public.hugin_normalizar_codigo_etiqueta(c.codigo) <> ''
    ) THEN
      v_status := 'fora_do_pedido';
    ELSE
      v_status := 'nenhum';
    END IF;
    RETURN pg_catalog.jsonb_build_object('status', v_status, 'candidatos', '[]'::jsonb);
  END IF;

  IF (
    SELECT pg_catalog.count(DISTINCT (item->>'sku_id'))
    FROM pg_catalog.jsonb_array_elements(v_candidatos) item
  ) = 1
     AND (
       SELECT pg_catalog.count(DISTINCT (item->>'pedido_item_id'))
       FROM pg_catalog.jsonb_array_elements(v_candidatos) item
     ) = 1
     AND (
       SELECT pg_catalog.count(DISTINCT f.sku_id)
       FROM pg_catalog.unnest(COALESCE(p_codigos, ARRAY[]::text[])) AS c(codigo)
       JOIN public.com_importado_skus_do_codigo(
         v_empresa, v_forn, public.hugin_normalizar_codigo_etiqueta(c.codigo)
       ) f ON public.hugin_normalizar_codigo_etiqueta(c.codigo) <> ''
     ) = 1
  THEN
    RETURN pg_catalog.jsonb_build_object(
      'status', 'unico',
      'candidatos', v_candidatos
    ) || (v_candidatos->0);
  END IF;

  RETURN pg_catalog.jsonb_build_object('status', 'ambiguo', 'candidatos', v_candidatos);
END;
$$;

COMMENT ON FUNCTION public.com_prever_etiquetas_importado(uuid, text[]) IS
  'Prévia da identificação sem limite de linhas. Único só quando todo o cadastro da empresa aponta um SKU do pedido.';

REVOKE ALL ON FUNCTION public.com_importado_exigir_acesso() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.com_importado_skus_do_codigo(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.com_confirmar_leitura_importada(uuid, uuid, text, numeric, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.com_prever_etiquetas_importado(uuid, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.com_fechar_recebimento_importado(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.com_aprender_codigo_importado(uuid, uuid, text) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.com_importado_exigir_acesso() FROM anon';
    EXECUTE 'REVOKE ALL ON FUNCTION public.com_importado_skus_do_codigo(uuid, uuid, text) FROM anon';
    EXECUTE 'REVOKE ALL ON FUNCTION public.com_confirmar_leitura_importada(uuid, uuid, text, numeric, uuid, text, text) FROM anon';
    EXECUTE 'REVOKE ALL ON FUNCTION public.com_prever_etiquetas_importado(uuid, text[]) FROM anon';
    EXECUTE 'REVOKE ALL ON FUNCTION public.com_fechar_recebimento_importado(uuid) FROM anon';
    EXECUTE 'REVOKE ALL ON FUNCTION public.com_aprender_codigo_importado(uuid, uuid, text) FROM anon';
    EXECUTE 'REVOKE ALL ON FUNCTION public.est_entrada_lotes_atribuir_numero() FROM anon';
    EXECUTE 'REVOKE ALL ON FUNCTION public.hugin_normalizar_codigo_etiqueta(text) FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.com_importado_exigir_acesso() FROM authenticated';
    EXECUTE 'REVOKE ALL ON FUNCTION public.com_importado_skus_do_codigo(uuid, uuid, text) FROM authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.com_confirmar_leitura_importada(uuid, uuid, text, numeric, uuid, text, text) TO authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.com_prever_etiquetas_importado(uuid, text[]) TO authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.com_fechar_recebimento_importado(uuid) TO authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.com_aprender_codigo_importado(uuid, uuid, text) TO authenticated';
    EXECUTE 'REVOKE ALL ON FUNCTION public.est_entrada_lotes_atribuir_numero() FROM authenticated';
    EXECUTE 'REVOKE ALL ON FUNCTION public.hugin_normalizar_codigo_etiqueta(text) FROM authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.com_importado_exigir_acesso() FROM service_role';
    EXECUTE 'REVOKE ALL ON FUNCTION public.com_importado_skus_do_codigo(uuid, uuid, text) FROM service_role';
    EXECUTE 'REVOKE ALL ON FUNCTION public.com_confirmar_leitura_importada(uuid, uuid, text, numeric, uuid, text, text) FROM service_role';
    EXECUTE 'REVOKE ALL ON FUNCTION public.com_prever_etiquetas_importado(uuid, text[]) FROM service_role';
    EXECUTE 'REVOKE ALL ON FUNCTION public.com_fechar_recebimento_importado(uuid) FROM service_role';
    EXECUTE 'REVOKE ALL ON FUNCTION public.com_aprender_codigo_importado(uuid, uuid, text) FROM service_role';
    EXECUTE 'REVOKE ALL ON FUNCTION public.est_entrada_lotes_atribuir_numero() FROM service_role';
    EXECUTE 'REVOKE ALL ON FUNCTION public.hugin_normalizar_codigo_etiqueta(text) FROM service_role';
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.est_entrada_lotes_atribuir_numero() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hugin_normalizar_codigo_etiqueta(text) FROM PUBLIC;
