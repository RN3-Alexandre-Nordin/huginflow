-- Relatórios de estoque SaaS: agregação / filtros / paginação no Postgres.
-- UI/Node só chama est_rpc_relatorio e renderiza o JSON (sem Map/reduce em milhares de linhas).

CREATE OR REPLACE FUNCTION public.est_rpc_relatorio(
  p_empresa_id uuid,
  p_slug text,
  p_filtros jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_limit int := LEAST(GREATEST(COALESCE((p_filtros->>'limit')::int, 50), 1), 200);
  v_offset int := GREATEST(COALESCE((p_filtros->>'offset')::int, 0), 0);
  v_local_id uuid := NULLIF(p_filtros->>'local_id', '')::uuid;
  v_familia_id uuid := NULLIF(p_filtros->>'familia_id', '')::uuid;
  v_terceiro_id uuid := NULLIF(p_filtros->>'terceiro_id', '')::uuid;
  v_sku text := NULLIF(upper(trim(COALESCE(p_filtros->>'sku_codigo', ''))), '');
  v_so_saldo boolean := COALESCE((p_filtros->>'so_com_saldo')::boolean, true);
  v_criterio text := COALESCE(NULLIF(p_filtros->>'criterio_critico', ''), 'todos');
  v_status_req text := NULLIF(p_filtros->>'status_req', '');
  v_origem_req text := NULLIF(p_filtros->>'origem_req', '');
  v_origem_saida text := NULLIF(p_filtros->>'origem_saida', '');
  v_status_remessa text := NULLIF(p_filtros->>'status_remessa', '');
  v_sinal text := NULLIF(p_filtros->>'sinal_ajuste', '');
  v_dias_corte int := GREATEST(COALESCE((p_filtros->>'dias_sem_movimento')::int, 60), 1);
  v_inicio timestamptz;
  v_fim timestamptz;
  v_dias int;
BEGIN
  IF p_empresa_id IS NULL THEN
    RAISE EXCEPTION 'empresa_id obrigatório';
  END IF;

  v_fim := COALESCE(
    NULLIF(p_filtros->>'data_fim', '')::timestamptz,
    date_trunc('day', now()) + interval '1 day' - interval '1 millisecond'
  );
  IF p_filtros ? 'data_fim' AND NULLIF(p_filtros->>'data_fim', '') IS NOT NULL
     AND (p_filtros->>'data_fim') !~ 'T' THEN
    v_fim := ((p_filtros->>'data_fim')::date + 1) - interval '1 millisecond';
  END IF;

  v_inicio := COALESCE(
    NULLIF(p_filtros->>'data_inicio', '')::timestamptz,
    v_fim - interval '30 days'
  );
  IF p_filtros ? 'data_inicio' AND NULLIF(p_filtros->>'data_inicio', '') IS NOT NULL
     AND (p_filtros->>'data_inicio') !~ 'T' THEN
    v_inicio := (p_filtros->>'data_inicio')::date::timestamptz;
  END IF;

  v_dias := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_fim - v_inicio)) / 86400.0)::int);

  CASE p_slug

  --------------------------------------------------------------------------
  WHEN 'valor-estoque' THEN
    RETURN (
      WITH base AS (
        SELECT
          sk.codigo AS sku_codigo,
          sk.nome AS sku_nome,
          CASE WHEN f.id IS NULL THEN '' ELSE f.codigo || ' · ' || f.nome END AS familia,
          loc.codigo || ' · ' || loc.nome AS local,
          s.quantidade,
          COALESCE(sk.preco_custo, 0)::numeric AS preco_custo,
          ROUND((s.quantidade * COALESCE(sk.preco_custo, 0))::numeric, 2) AS valor
        FROM public.est_saldos s
        JOIN public.cad_skus sk ON sk.id = s.sku_id
        JOIN public.cad_locais_estoque loc ON loc.id = s.local_id
        LEFT JOIN public.cad_sku_familias f ON f.id = sk.familia_id
        WHERE s.empresa_id = p_empresa_id
          AND (v_local_id IS NULL OR s.local_id = v_local_id)
          AND (NOT v_so_saldo OR s.quantidade > 0)
          AND (v_sku IS NULL OR upper(sk.codigo) LIKE '%' || v_sku || '%')
          AND (v_familia_id IS NULL OR sk.familia_id = v_familia_id)
      ),
      agg AS (
        SELECT
          count(*)::int AS total_count,
          COALESCE(SUM(valor), 0)::numeric AS total_valor
        FROM base
      ),
      page AS (
        SELECT * FROM base
        ORDER BY valor DESC, sku_codigo, local
        LIMIT v_limit OFFSET v_offset
      )
      SELECT jsonb_build_object(
        'rows', COALESCE((
          SELECT jsonb_agg(to_jsonb(p) ORDER BY p.valor DESC, p.sku_codigo, p.local)
          FROM page p
        ), '[]'::jsonb),
        'resumo', jsonb_build_object(
          'total_valor', ROUND((SELECT total_valor FROM agg), 2),
          'total_count', (SELECT total_count FROM agg),
          'linhas', (SELECT count(*)::int FROM page)
        )
      )
    );

  --------------------------------------------------------------------------
  WHEN 'skus-criticos' THEN
    RETURN (
      WITH base AS (
        SELECT
          sk.codigo AS sku_codigo,
          sk.nome AS sku_nome,
          CASE WHEN f.id IS NULL THEN '' ELSE f.codigo || ' · ' || f.nome END AS familia,
          loc.codigo || ' · ' || loc.nome AS local,
          s.quantidade,
          sk.estoque_minimo,
          sk.ponto_reposicao,
          trim(BOTH ', ' FROM concat_ws(', ',
            CASE WHEN s.quantidade <= 0 THEN 'zerado' END,
            CASE WHEN sk.estoque_minimo IS NOT NULL AND s.quantidade < sk.estoque_minimo THEN 'abaixo_minimo' END,
            CASE WHEN sk.ponto_reposicao IS NOT NULL AND s.quantidade <= sk.ponto_reposicao THEN 'ponto_reposicao' END
          )) AS motivo
        FROM public.est_saldos s
        JOIN public.cad_skus sk ON sk.id = s.sku_id AND COALESCE(sk.controla_estoque, true)
        JOIN public.cad_locais_estoque loc ON loc.id = s.local_id
        LEFT JOIN public.cad_sku_familias f ON f.id = sk.familia_id
        WHERE s.empresa_id = p_empresa_id
          AND (v_local_id IS NULL OR s.local_id = v_local_id)
          AND (v_sku IS NULL OR upper(sk.codigo) LIKE '%' || v_sku || '%')
          AND (v_familia_id IS NULL OR sk.familia_id = v_familia_id)
          AND (
            s.quantidade <= 0
            OR (sk.estoque_minimo IS NOT NULL AND s.quantidade < sk.estoque_minimo)
            OR (sk.ponto_reposicao IS NOT NULL AND s.quantidade <= sk.ponto_reposicao)
          )
          AND (
            v_criterio = 'todos'
            OR (v_criterio = 'zerado' AND s.quantidade <= 0)
            OR (v_criterio = 'minimo' AND sk.estoque_minimo IS NOT NULL AND s.quantidade < sk.estoque_minimo)
            OR (v_criterio = 'ponto' AND sk.ponto_reposicao IS NOT NULL AND s.quantidade <= sk.ponto_reposicao)
          )
      ),
      agg AS (SELECT count(*)::int AS total_count FROM base),
      page AS (
        SELECT * FROM base
        ORDER BY quantidade ASC, sku_codigo
        LIMIT v_limit OFFSET v_offset
      )
      SELECT jsonb_build_object(
        'rows', COALESCE((
          SELECT jsonb_agg(to_jsonb(p) ORDER BY p.quantidade ASC, p.sku_codigo) FROM page p
        ), '[]'::jsonb),
        'resumo', jsonb_build_object(
          'criticos', (SELECT total_count FROM agg),
          'total_count', (SELECT total_count FROM agg)
        )
      )
    );

  --------------------------------------------------------------------------
  WHEN 'fill-rate-requisicoes' THEN
    RETURN (
      WITH reqs AS (
        SELECT r.id, r.numero, r.status
        FROM public.est_requisicoes r
        WHERE r.empresa_id = p_empresa_id
          AND r.created_at >= v_inicio
          AND r.created_at <= v_fim
          AND (v_status_req IS NULL OR r.status = v_status_req)
          AND (v_origem_req IS NULL OR r.origem = v_origem_req)
      ),
      base AS (
        SELECT
          rq.numero,
          sk.codigo AS sku_codigo,
          CASE WHEN f.id IS NULL THEN '' ELSE f.codigo || ' · ' || f.nome END AS familia,
          i.quantidade_pedida AS pedida,
          i.quantidade_atendida AS atendida,
          i.quantidade_pendente AS pendente,
          CASE WHEN i.quantidade_pedida > 0
            THEN ROUND((i.quantidade_atendida / i.quantidade_pedida) * 1000) / 10
            ELSE 0 END AS fill_rate,
          rq.status
        FROM public.est_requisicao_itens i
        JOIN reqs rq ON rq.id = i.requisicao_id
        JOIN public.cad_skus sk ON sk.id = i.sku_id
        LEFT JOIN public.cad_sku_familias f ON f.id = sk.familia_id
        WHERE i.empresa_id = p_empresa_id
          AND (v_sku IS NULL OR upper(sk.codigo) LIKE '%' || v_sku || '%')
          AND (v_familia_id IS NULL OR sk.familia_id = v_familia_id)
      ),
      agg AS (
        SELECT
          count(*)::int AS total_count,
          COALESCE(SUM(pedida), 0)::numeric AS pedida,
          COALESCE(SUM(atendida), 0)::numeric AS atendida
        FROM base
      ),
      page AS (
        SELECT * FROM base
        ORDER BY numero DESC, sku_codigo
        LIMIT v_limit OFFSET v_offset
      )
      SELECT jsonb_build_object(
        'rows', COALESCE((
          SELECT jsonb_agg(to_jsonb(p) ORDER BY p.numero DESC, p.sku_codigo) FROM page p
        ), '[]'::jsonb),
        'resumo', jsonb_build_object(
          'fill_rate', CASE WHEN (SELECT pedida FROM agg) > 0
            THEN ROUND(((SELECT atendida FROM agg) / (SELECT pedida FROM agg)) * 1000) / 10
            ELSE 0 END,
          'pedida', (SELECT pedida FROM agg),
          'atendida', (SELECT atendida FROM agg),
          'total_count', (SELECT total_count FROM agg)
        )
      )
    );

  --------------------------------------------------------------------------
  WHEN 'consumo-doh' THEN
    RETURN (
      WITH consumo AS (
        SELECT
          m.sku_id,
          sk.codigo AS sku_codigo,
          sk.nome AS sku_nome,
          sk.familia_id,
          CASE WHEN f.id IS NULL THEN '' ELSE f.codigo || ' · ' || f.nome END AS familia,
          COALESCE(sk.preco_custo, 0)::numeric AS preco_custo,
          SUM(m.quantidade)::numeric AS consumo
        FROM public.est_movimentos m
        JOIN public.cad_skus sk ON sk.id = m.sku_id
        LEFT JOIN public.cad_sku_familias f ON f.id = sk.familia_id
        WHERE m.empresa_id = p_empresa_id
          AND m.tipo = 'saida'
          AND m.movimento_em >= v_inicio
          AND m.movimento_em <= v_fim
          AND (v_local_id IS NULL OR m.local_id = v_local_id)
          AND (v_origem_saida IS NULL OR m.origem = v_origem_saida)
          AND (v_sku IS NULL OR upper(sk.codigo) LIKE '%' || v_sku || '%')
          AND (v_familia_id IS NULL OR sk.familia_id = v_familia_id)
        GROUP BY m.sku_id, sk.codigo, sk.nome, sk.familia_id, f.id, f.codigo, f.nome, sk.preco_custo
      ),
      saldos AS (
        SELECT s.sku_id, SUM(s.quantidade)::numeric AS saldo
        FROM public.est_saldos s
        WHERE s.empresa_id = p_empresa_id
          AND (v_local_id IS NULL OR s.local_id = v_local_id)
        GROUP BY s.sku_id
      ),
      base AS (
        SELECT
          c.sku_codigo,
          c.sku_nome,
          c.familia,
          COALESCE(s.saldo, 0) AS saldo,
          ROUND(c.consumo, 3) AS consumo,
          ROUND(c.consumo / v_dias, 3) AS consumo_dia,
          CASE WHEN c.consumo / v_dias > 0
            THEN ROUND((COALESCE(s.saldo, 0) / (c.consumo / v_dias))::numeric, 1)
            ELSE NULL END AS doh,
          ROUND(c.consumo * c.preco_custo, 2) AS valor_consumo
        FROM consumo c
        LEFT JOIN saldos s ON s.sku_id = c.sku_id
      ),
      agg AS (SELECT count(*)::int AS total_count FROM base),
      page AS (
        SELECT * FROM base
        ORDER BY consumo DESC, sku_codigo
        LIMIT v_limit OFFSET v_offset
      )
      SELECT jsonb_build_object(
        'rows', COALESCE((
          SELECT jsonb_agg(to_jsonb(p) ORDER BY p.consumo DESC, p.sku_codigo) FROM page p
        ), '[]'::jsonb),
        'resumo', jsonb_build_object(
          'dias', v_dias,
          'total_count', (SELECT total_count FROM agg)
        )
      )
    );

  --------------------------------------------------------------------------
  WHEN 'giro-estoque' THEN
    RETURN (
      WITH consumo AS (
        SELECT
          m.sku_id,
          sk.codigo AS sku_codigo,
          sk.nome AS sku_nome,
          CASE WHEN f.id IS NULL THEN '' ELSE f.codigo || ' · ' || f.nome END AS familia,
          COALESCE(sk.preco_custo, 0)::numeric AS preco_custo,
          SUM(m.quantidade)::numeric AS consumo_qtd
        FROM public.est_movimentos m
        JOIN public.cad_skus sk ON sk.id = m.sku_id
        LEFT JOIN public.cad_sku_familias f ON f.id = sk.familia_id
        WHERE m.empresa_id = p_empresa_id
          AND m.tipo = 'saida'
          AND m.movimento_em >= v_inicio
          AND m.movimento_em <= v_fim
          AND (v_local_id IS NULL OR m.local_id = v_local_id)
          AND (v_familia_id IS NULL OR sk.familia_id = v_familia_id)
        GROUP BY m.sku_id, sk.codigo, sk.nome, f.id, f.codigo, f.nome, sk.preco_custo
      ),
      saldos AS (
        SELECT s.sku_id, SUM(s.quantidade)::numeric AS saldo
        FROM public.est_saldos s
        WHERE s.empresa_id = p_empresa_id
          AND (v_local_id IS NULL OR s.local_id = v_local_id)
        GROUP BY s.sku_id
      ),
      base AS (
        SELECT
          c.sku_codigo,
          c.sku_nome,
          c.familia,
          ROUND(c.consumo_qtd * c.preco_custo, 2) AS consumo_custo,
          ROUND(COALESCE(s.saldo, 0) * c.preco_custo, 2) AS estoque_valor,
          CASE WHEN COALESCE(s.saldo, 0) * c.preco_custo > 0
            THEN ROUND(((c.consumo_qtd * c.preco_custo) / (COALESCE(s.saldo, 0) * c.preco_custo))::numeric, 2)
            ELSE NULL END AS turns
        FROM consumo c
        LEFT JOIN saldos s ON s.sku_id = c.sku_id
      ),
      agg AS (SELECT count(*)::int AS total_count FROM base),
      page AS (
        SELECT * FROM base
        ORDER BY consumo_custo DESC, sku_codigo
        LIMIT v_limit OFFSET v_offset
      )
      SELECT jsonb_build_object(
        'rows', COALESCE((
          SELECT jsonb_agg(to_jsonb(p) ORDER BY p.consumo_custo DESC, p.sku_codigo) FROM page p
        ), '[]'::jsonb),
        'resumo', jsonb_build_object(
          'dias', v_dias,
          'total_count', (SELECT total_count FROM agg)
        )
      )
    );

  --------------------------------------------------------------------------
  WHEN 'estoque-sem-movimento' THEN
    RETURN (
      WITH ultima_saida AS (
        SELECT m.sku_id, m.local_id, MAX(m.movimento_em) AS ultima
        FROM public.est_movimentos m
        WHERE m.empresa_id = p_empresa_id
          AND m.tipo = 'saida'
        GROUP BY m.sku_id, m.local_id
      ),
      base AS (
        SELECT
          sk.codigo AS sku_codigo,
          sk.nome AS sku_nome,
          CASE WHEN f.id IS NULL THEN '' ELSE f.codigo || ' · ' || f.nome END AS familia,
          loc.codigo || ' · ' || loc.nome AS local,
          s.quantidade,
          ROUND((s.quantidade * COALESCE(sk.preco_custo, 0))::numeric, 2) AS valor,
          CASE WHEN u.ultima IS NULL THEN 'nunca' ELSE to_char(u.ultima AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') END AS ultima_saida,
          CASE WHEN u.ultima IS NULL THEN NULL
            ELSE FLOOR(EXTRACT(EPOCH FROM (now() - u.ultima)) / 86400)::int END AS dias
        FROM public.est_saldos s
        JOIN public.cad_skus sk ON sk.id = s.sku_id
        JOIN public.cad_locais_estoque loc ON loc.id = s.local_id
        LEFT JOIN public.cad_sku_familias f ON f.id = sk.familia_id
        LEFT JOIN ultima_saida u ON u.sku_id = s.sku_id AND u.local_id = s.local_id
        WHERE s.empresa_id = p_empresa_id
          AND s.quantidade > 0
          AND (v_local_id IS NULL OR s.local_id = v_local_id)
          AND (v_sku IS NULL OR upper(sk.codigo) LIKE '%' || v_sku || '%')
          AND (v_familia_id IS NULL OR sk.familia_id = v_familia_id)
          AND (u.ultima IS NULL OR u.ultima < (now() - (v_dias_corte || ' days')::interval))
      ),
      agg AS (SELECT count(*)::int AS total_count FROM base),
      page AS (
        SELECT
          sku_codigo, sku_nome, familia, local, quantidade, valor, ultima_saida,
          COALESCE(dias::text, '∞') AS dias
        FROM base
        ORDER BY valor DESC, sku_codigo
        LIMIT v_limit OFFSET v_offset
      )
      SELECT jsonb_build_object(
        'rows', COALESCE((
          SELECT jsonb_agg(to_jsonb(p) ORDER BY p.valor DESC, p.sku_codigo) FROM page p
        ), '[]'::jsonb),
        'resumo', jsonb_build_object(
          'dias_corte', v_dias_corte,
          'total_count', (SELECT total_count FROM agg)
        )
      )
    );

  --------------------------------------------------------------------------
  WHEN 'excesso-maximo' THEN
    RETURN (
      WITH base AS (
        SELECT
          sk.codigo AS sku_codigo,
          sk.nome AS sku_nome,
          CASE WHEN f.id IS NULL THEN '' ELSE f.codigo || ' · ' || f.nome END AS familia,
          loc.codigo || ' · ' || loc.nome AS local,
          s.quantidade,
          sk.estoque_maximo,
          (s.quantidade - sk.estoque_maximo) AS excesso,
          ROUND(((s.quantidade - sk.estoque_maximo) * COALESCE(sk.preco_custo, 0))::numeric, 2) AS valor_excesso
        FROM public.est_saldos s
        JOIN public.cad_skus sk ON sk.id = s.sku_id
        JOIN public.cad_locais_estoque loc ON loc.id = s.local_id
        LEFT JOIN public.cad_sku_familias f ON f.id = sk.familia_id
        WHERE s.empresa_id = p_empresa_id
          AND sk.estoque_maximo IS NOT NULL
          AND s.quantidade > sk.estoque_maximo
          AND (v_local_id IS NULL OR s.local_id = v_local_id)
          AND (v_sku IS NULL OR upper(sk.codigo) LIKE '%' || v_sku || '%')
          AND (v_familia_id IS NULL OR sk.familia_id = v_familia_id)
      ),
      agg AS (SELECT count(*)::int AS total_count FROM base),
      page AS (
        SELECT * FROM base
        ORDER BY valor_excesso DESC, sku_codigo
        LIMIT v_limit OFFSET v_offset
      )
      SELECT jsonb_build_object(
        'rows', COALESCE((
          SELECT jsonb_agg(to_jsonb(p) ORDER BY p.valor_excesso DESC, p.sku_codigo) FROM page p
        ), '[]'::jsonb),
        'resumo', jsonb_build_object('total_count', (SELECT total_count FROM agg))
      )
    );

  --------------------------------------------------------------------------
  WHEN 'poder-terceiros' THEN
    RETURN (
      WITH base AS (
        SELECT
          COALESCE(p.nome, '') AS terceiro,
          sk.codigo AS sku_codigo,
          sk.nome AS sku_nome,
          CASE WHEN f.id IS NULL THEN '' ELSE f.codigo || ' · ' || f.nome END AS familia,
          s.quantidade,
          ROUND((s.quantidade * COALESCE(sk.preco_custo, 0))::numeric, 2) AS valor
        FROM public.est_saldos_poder_terceiros s
        JOIN public.cad_skus sk ON sk.id = s.sku_id
        LEFT JOIN public.crm_leads p ON p.id = s.pessoa_id
        LEFT JOIN public.cad_sku_familias f ON f.id = sk.familia_id
        WHERE s.empresa_id = p_empresa_id
          AND s.quantidade > 0
          AND (v_terceiro_id IS NULL OR s.pessoa_id = v_terceiro_id)
          AND (v_sku IS NULL OR upper(sk.codigo) LIKE '%' || v_sku || '%')
          AND (v_familia_id IS NULL OR sk.familia_id = v_familia_id)
      ),
      agg AS (
        SELECT count(*)::int AS total_count, COALESCE(SUM(valor), 0)::numeric AS total_valor
        FROM base
      ),
      page AS (
        SELECT * FROM base
        ORDER BY valor DESC, terceiro, sku_codigo
        LIMIT v_limit OFFSET v_offset
      )
      SELECT jsonb_build_object(
        'rows', COALESCE((
          SELECT jsonb_agg(to_jsonb(p) ORDER BY p.valor DESC, p.terceiro, p.sku_codigo) FROM page p
        ), '[]'::jsonb),
        'resumo', jsonb_build_object(
          'total_valor', ROUND((SELECT total_valor FROM agg), 2),
          'total_count', (SELECT total_count FROM agg)
        )
      )
    );

  --------------------------------------------------------------------------
  WHEN 'remessa-retorno-baixa' THEN
    RETURN (
      WITH base AS (
        SELECT
          r.numero,
          COALESCE(p.nome, '') AS terceiro,
          r.status,
          COALESCE(SUM(i.quantidade_enviada), 0)::numeric AS enviada,
          COALESCE(SUM(i.quantidade_retornada), 0)::numeric AS retornada,
          COALESCE(SUM(i.quantidade_baixada), 0)::numeric AS baixada,
          CASE WHEN COALESCE(SUM(i.quantidade_enviada), 0) > 0
            THEN ROUND((COALESCE(SUM(i.quantidade_retornada), 0) / SUM(i.quantidade_enviada)) * 1000) / 10
            ELSE 0 END AS taxa_retorno,
          CASE WHEN COALESCE(SUM(i.quantidade_enviada), 0) > 0
            THEN ROUND((COALESCE(SUM(i.quantidade_baixada), 0) / SUM(i.quantidade_enviada)) * 1000) / 10
            ELSE 0 END AS taxa_baixa
        FROM public.est_remessa_lotes r
        LEFT JOIN public.est_remessa_itens i ON i.remessa_id = r.id
        LEFT JOIN public.crm_leads p ON p.id = r.destinatario_pessoa_id
        WHERE r.empresa_id = p_empresa_id
          AND r.created_at >= v_inicio
          AND r.created_at <= v_fim
          AND (v_status_remessa IS NULL OR r.status = v_status_remessa)
          AND (v_terceiro_id IS NULL OR r.destinatario_pessoa_id = v_terceiro_id)
        GROUP BY r.id, r.numero, r.status, p.nome
      ),
      agg AS (SELECT count(*)::int AS total_count FROM base),
      page AS (
        SELECT * FROM base
        ORDER BY numero DESC
        LIMIT v_limit OFFSET v_offset
      )
      SELECT jsonb_build_object(
        'rows', COALESCE((
          SELECT jsonb_agg(to_jsonb(p) ORDER BY p.numero DESC) FROM page p
        ), '[]'::jsonb),
        'resumo', jsonb_build_object('total_count', (SELECT total_count FROM agg))
      )
    );

  --------------------------------------------------------------------------
  WHEN 'lead-time-req' THEN
    RETURN (
      WITH primeira_baixa AS (
        SELECT m.requisicao_id, MIN(m.movimento_em) AS primeira
        FROM public.est_movimentos m
        WHERE m.empresa_id = p_empresa_id
          AND m.origem = 'requisicao'
          AND m.requisicao_id IS NOT NULL
        GROUP BY m.requisicao_id
      ),
      base AS (
        SELECT
          r.numero,
          r.status,
          r.origem,
          to_char(r.created_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI') AS created_at,
          COALESCE(to_char(r.aprovado_em AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI'), '') AS aprovado_em,
          CASE WHEN r.aprovado_em IS NULL THEN NULL
            ELSE ROUND((EXTRACT(EPOCH FROM (r.aprovado_em - r.created_at)) / 3600.0)::numeric, 1) END AS horas_aprovacao,
          CASE WHEN pb.primeira IS NULL THEN NULL
            ELSE ROUND((EXTRACT(EPOCH FROM (pb.primeira - r.created_at)) / 3600.0)::numeric, 1) END AS horas_primeira_baixa
        FROM public.est_requisicoes r
        LEFT JOIN primeira_baixa pb ON pb.requisicao_id = r.id
        WHERE r.empresa_id = p_empresa_id
          AND r.created_at >= v_inicio
          AND r.created_at <= v_fim
          AND (v_status_req IS NULL OR r.status = v_status_req)
          AND (v_origem_req IS NULL OR r.origem = v_origem_req)
      ),
      agg AS (SELECT count(*)::int AS total_count FROM base),
      page AS (
        SELECT * FROM base
        ORDER BY created_at DESC
        LIMIT v_limit OFFSET v_offset
      )
      SELECT jsonb_build_object(
        'rows', COALESCE((
          SELECT jsonb_agg(to_jsonb(p) ORDER BY p.created_at DESC) FROM page p
        ), '[]'::jsonb),
        'resumo', jsonb_build_object('total_count', (SELECT total_count FROM agg))
      )
    );

  --------------------------------------------------------------------------
  WHEN 'ajustes-shrinkage' THEN
    RETURN (
      WITH base AS (
        SELECT
          to_char(m.movimento_em AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI') AS movimento_em,
          sk.codigo AS sku_codigo,
          CASE WHEN f.id IS NULL THEN '' ELSE f.codigo || ' · ' || f.nome END AS familia,
          loc.codigo || ' · ' || loc.nome AS local,
          COALESCE(m.ajuste_sinal, '') AS sinal,
          m.quantidade,
          ROUND((m.quantidade * COALESCE(sk.preco_custo, 0))::numeric, 2) AS valor,
          COALESCE(m.motivo, '') AS motivo
        FROM public.est_movimentos m
        JOIN public.cad_skus sk ON sk.id = m.sku_id
        JOIN public.cad_locais_estoque loc ON loc.id = m.local_id
        LEFT JOIN public.cad_sku_familias f ON f.id = sk.familia_id
        WHERE m.empresa_id = p_empresa_id
          AND m.tipo = 'ajuste'
          AND m.movimento_em >= v_inicio
          AND m.movimento_em <= v_fim
          AND (v_local_id IS NULL OR m.local_id = v_local_id)
          AND (v_sinal IS NULL OR m.ajuste_sinal = v_sinal)
          AND (v_sku IS NULL OR upper(sk.codigo) LIKE '%' || v_sku || '%')
          AND (v_familia_id IS NULL OR sk.familia_id = v_familia_id)
      ),
      agg AS (
        SELECT
          count(*)::int AS total_count,
          COALESCE(SUM(valor), 0)::numeric AS total_valor
        FROM base
      ),
      page AS (
        SELECT * FROM base
        ORDER BY movimento_em DESC
        LIMIT v_limit OFFSET v_offset
      )
      SELECT jsonb_build_object(
        'rows', COALESCE((
          SELECT jsonb_agg(to_jsonb(p) ORDER BY p.movimento_em DESC) FROM page p
        ), '[]'::jsonb),
        'resumo', jsonb_build_object(
          'total_valor', ROUND((SELECT total_valor FROM agg), 2),
          'total_count', (SELECT total_count FROM agg)
        )
      )
    );

  ELSE
    RETURN jsonb_build_object(
      'rows', '[]'::jsonb,
      'resumo', jsonb_build_object(),
      'error', 'Relatório não encontrado.'
    );
  END CASE;
END;
$$;

COMMENT ON FUNCTION public.est_rpc_relatorio(uuid, text, jsonb) IS
  'Relatórios de estoque: GROUP BY/filtros/paginação no Postgres. Retorna {rows, resumo}.';

GRANT EXECUTE ON FUNCTION public.est_rpc_relatorio(uuid, text, jsonb) TO authenticated, service_role;
