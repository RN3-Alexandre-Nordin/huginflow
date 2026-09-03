-- Analytics BI — Step 4b: RPCs MVP + grants

CREATE OR REPLACE FUNCTION public.fn_analytics_overview(
  p_empresa_id uuid DEFAULT NULL,
  p_data_inicio timestamptz DEFAULT (now() - interval '7 days'),
  p_data_fim timestamptz DEFAULT now(),
  p_filtros jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa_id uuid;
  v_depto_ids uuid[];
  v_canal_ids uuid[];
  v_pipeline_ids uuid[];
BEGIN
  v_empresa_id := public.fn_analytics_resolve_empresa_id(p_empresa_id);

  SELECT coalesce(array_agg(x::uuid), ARRAY[]::uuid[])
  INTO v_depto_ids
  FROM jsonb_array_elements_text(coalesce(p_filtros->'departamento_ids', '[]'::jsonb)) AS t(x);

  SELECT coalesce(array_agg(x::uuid), ARRAY[]::uuid[])
  INTO v_canal_ids
  FROM jsonb_array_elements_text(coalesce(p_filtros->'canal_ids', '[]'::jsonb)) AS t(x);

  SELECT coalesce(array_agg(x::uuid), ARRAY[]::uuid[])
  INTO v_pipeline_ids
  FROM jsonb_array_elements_text(coalesce(p_filtros->'pipeline_ids', '[]'::jsonb)) AS t(x);

  RETURN (
    WITH threads AS (
      SELECT v.*
      FROM public.vw_analytics_threads v
      WHERE v.empresa_id = v_empresa_id
        AND (cardinality(v_depto_ids) = 0 OR v.departamento_id = ANY(v_depto_ids))
        AND (cardinality(v_canal_ids) = 0 OR v.canal_id = ANY(v_canal_ids))
        AND (cardinality(v_pipeline_ids) = 0 OR v.pipeline_id = ANY(v_pipeline_ids))
    ),
    open_threads AS (
      SELECT * FROM threads WHERE status IS DISTINCT FROM 'closed'
    )
    SELECT jsonb_build_object(
      'empresa_id', v_empresa_id,
      'periodo', jsonb_build_object('inicio', p_data_inicio, 'fim', p_data_fim),
      'conversas', jsonb_build_object(
        'abertas', (SELECT count(*)::int FROM open_threads),
        'nao_atribuidas', (
          SELECT count(*)::int FROM open_threads
          WHERE conversa_status = 'human' AND atribuido_a_id IS NULL
        ),
        'nao_atendidas', (
          SELECT count(*)::int FROM open_threads
          WHERE conversa_status = 'ai' OR status = 'ai'
        ),
        'em_ia', (
          SELECT count(*)::int FROM open_threads
          WHERE conversa_status = 'ai' OR status = 'ai'
        ),
        'em_humano', (
          SELECT count(*)::int FROM open_threads
          WHERE conversa_status = 'human' OR status = 'human'
        )
      ),
      'crm', jsonb_build_object(
        'cards_ativos', (
          SELECT count(*)::int FROM public.crm_cards c
          WHERE c.empresa_id = v_empresa_id
            AND coalesce(c.finalizado, false) = false
            AND (cardinality(v_pipeline_ids) = 0 OR c.pipeline_id = ANY(v_pipeline_ids))
        ),
        'cards_atrasados', (
          SELECT count(*)::int FROM public.crm_cards c
          WHERE c.empresa_id = v_empresa_id
            AND coalesce(c.finalizado, false) = false
            AND c.data_prazo IS NOT NULL
            AND c.data_prazo < CURRENT_DATE
            AND (cardinality(v_pipeline_ids) = 0 OR c.pipeline_id = ANY(v_pipeline_ids))
        ),
        'receita_fechada_periodo', coalesce((
          SELECT sum(c.valor) FROM public.crm_cards c
          WHERE c.empresa_id = v_empresa_id
            AND coalesce(c.finalizado, false) = true
            AND coalesce(c.finalizado_em, c.updated_at) >= p_data_inicio
            AND coalesce(c.finalizado_em, c.updated_at) <= p_data_fim
            AND (cardinality(v_pipeline_ids) = 0 OR c.pipeline_id = ANY(v_pipeline_ids))
        ), 0)
      ),
      'threads_novas_periodo', (
        SELECT count(*)::int FROM threads t
        WHERE t.opened_at >= p_data_inicio AND t.opened_at <= p_data_fim
      )
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_analytics_conversations_kpis(
  p_empresa_id uuid DEFAULT NULL,
  p_data_inicio timestamptz DEFAULT (now() - interval '7 days'),
  p_data_fim timestamptz DEFAULT now(),
  p_filtros jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa_id uuid;
  v_prev_inicio timestamptz;
  v_prev_fim timestamptz;
  v_span interval;
  v_depto_ids uuid[];
  v_canal_ids uuid[];
  v_cur jsonb;
  v_prev jsonb;
BEGIN
  v_empresa_id := public.fn_analytics_resolve_empresa_id(p_empresa_id);
  v_span := p_data_fim - p_data_inicio;
  v_prev_fim := p_data_inicio;
  v_prev_inicio := p_data_inicio - v_span;

  SELECT coalesce(array_agg(x::uuid), ARRAY[]::uuid[])
  INTO v_depto_ids
  FROM jsonb_array_elements_text(coalesce(p_filtros->'departamento_ids', '[]'::jsonb)) AS t(x);

  SELECT coalesce(array_agg(x::uuid), ARRAY[]::uuid[])
  INTO v_canal_ids
  FROM jsonb_array_elements_text(coalesce(p_filtros->'canal_ids', '[]'::jsonb)) AS t(x);

  v_cur := public.fn_analytics_period_metrics(
    v_empresa_id, p_data_inicio, p_data_fim, v_depto_ids, v_canal_ids
  );
  v_prev := public.fn_analytics_period_metrics(
    v_empresa_id, v_prev_inicio, v_prev_fim, v_depto_ids, v_canal_ids
  );

  RETURN jsonb_build_object(
    'empresa_id', v_empresa_id,
    'periodo', jsonb_build_object('inicio', p_data_inicio, 'fim', p_data_fim),
    'kpis', jsonb_build_object(
      'conversas', jsonb_build_object(
        'valor', (v_cur->>'conversas')::bigint,
        'anterior', (v_prev->>'conversas')::bigint,
        'tendencia_pct', public.fn_analytics_trend_pct((v_prev->>'conversas')::numeric, (v_cur->>'conversas')::numeric)
      ),
      'tempo_primeira_resposta_seg', jsonb_build_object(
        'valor', (v_cur->>'avg_first_response_sec')::numeric,
        'anterior', (v_prev->>'avg_first_response_sec')::numeric,
        'tendencia_pct', public.fn_analytics_trend_pct((v_prev->>'avg_first_response_sec')::numeric, (v_cur->>'avg_first_response_sec')::numeric, true)
      ),
      'tempo_espera_cliente_seg', jsonb_build_object(
        'valor', (v_cur->>'avg_wait_sec')::numeric,
        'anterior', (v_prev->>'avg_wait_sec')::numeric,
        'tendencia_pct', public.fn_analytics_trend_pct((v_prev->>'avg_wait_sec')::numeric, (v_cur->>'avg_wait_sec')::numeric, true)
      ),
      'tempo_resolucao_seg', jsonb_build_object(
        'valor', (v_cur->>'avg_resolution_sec')::numeric,
        'anterior', (v_prev->>'avg_resolution_sec')::numeric,
        'tendencia_pct', public.fn_analytics_trend_pct((v_prev->>'avg_resolution_sec')::numeric, (v_cur->>'avg_resolution_sec')::numeric, true)
      ),
      'contagem_resolucao', jsonb_build_object(
        'valor', (v_cur->>'resolucoes')::bigint,
        'anterior', (v_prev->>'resolucoes')::bigint,
        'tendencia_pct', public.fn_analytics_trend_pct((v_prev->>'resolucoes')::numeric, (v_cur->>'resolucoes')::numeric)
      ),
      'mensagens_recebidas', jsonb_build_object(
        'valor', (v_cur->>'mensagens_recebidas')::bigint,
        'anterior', (v_prev->>'mensagens_recebidas')::bigint,
        'tendencia_pct', public.fn_analytics_trend_pct((v_prev->>'mensagens_recebidas')::numeric, (v_cur->>'mensagens_recebidas')::numeric)
      )
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_analytics_conversations_daily(
  p_empresa_id uuid DEFAULT NULL,
  p_data_inicio timestamptz DEFAULT (now() - interval '7 days'),
  p_data_fim timestamptz DEFAULT now(),
  p_filtros jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa_id uuid;
  v_depto_ids uuid[];
  v_canal_ids uuid[];
BEGIN
  v_empresa_id := public.fn_analytics_resolve_empresa_id(p_empresa_id);

  SELECT coalesce(array_agg(x::uuid), ARRAY[]::uuid[])
  INTO v_depto_ids
  FROM jsonb_array_elements_text(coalesce(p_filtros->'departamento_ids', '[]'::jsonb)) AS t(x);

  SELECT coalesce(array_agg(x::uuid), ARRAY[]::uuid[])
  INTO v_canal_ids
  FROM jsonb_array_elements_text(coalesce(p_filtros->'canal_ids', '[]'::jsonb)) AS t(x);

  RETURN coalesce((
    SELECT jsonb_agg(
      jsonb_build_object(
        'dia', combined.dia,
        'conversas', combined.conversas,
        'mensagens_recebidas', combined.mensagens_recebidas,
        'resolucoes', combined.resolucoes
      )
      ORDER BY combined.dia
    )
    FROM (
      SELECT
        coalesce(t.dia, m.dia) AS dia,
        coalesce(t.conversas, 0) AS conversas,
        coalesce(m.mensagens_recebidas, 0) AS mensagens_recebidas,
        coalesce(t.resolucoes, 0) AS resolucoes
      FROM (
        SELECT
          date_trunc('day', coalesce(th.opened_at, th.created_at))::date AS dia,
          count(DISTINCT th.id)::int AS conversas,
          count(DISTINCT th.id) FILTER (WHERE th.status = 'closed')::int AS resolucoes
        FROM public.crm_chat_threads th
        WHERE th.empresa_id = v_empresa_id
          AND coalesce(th.opened_at, th.created_at) >= p_data_inicio
          AND coalesce(th.opened_at, th.created_at) <= p_data_fim
          AND (cardinality(v_depto_ids) = 0 OR th.departamento_id = ANY(v_depto_ids))
          AND (cardinality(v_canal_ids) = 0 OR th.canal_id = ANY(v_canal_ids))
        GROUP BY 1
      ) t
      FULL OUTER JOIN (
        SELECT
          date_trunc('day', i.created_at)::date AS dia,
          count(*)::int AS mensagens_recebidas
        FROM public.crm_interacoes i
        WHERE i.empresa_id = v_empresa_id
          AND i.role = 'user'
          AND i.created_at >= p_data_inicio
          AND i.created_at <= p_data_fim
        GROUP BY 1
      ) m ON m.dia = t.dia
    ) combined
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_analytics_traffic_heatmap(
  p_empresa_id uuid DEFAULT NULL,
  p_data_inicio timestamptz DEFAULT (now() - interval '7 days'),
  p_data_fim timestamptz DEFAULT now(),
  p_filtros jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa_id uuid;
  v_canal_ids uuid[];
BEGIN
  v_empresa_id := public.fn_analytics_resolve_empresa_id(p_empresa_id);

  SELECT coalesce(array_agg(x::uuid), ARRAY[]::uuid[])
  INTO v_canal_ids
  FROM jsonb_array_elements_text(coalesce(p_filtros->'canal_ids', '[]'::jsonb)) AS t(x);

  RETURN coalesce((
    SELECT jsonb_build_object(
      'max_count', max(c.cnt),
      'cells', jsonb_agg(
        jsonb_build_object(
          'dow', c.dow,
          'hour', c.hour,
          'count', c.cnt
        )
        ORDER BY c.dow, c.hour
      )
    )
    FROM (
      SELECT
        extract(dow FROM i.created_at)::int AS dow,
        extract(hour FROM i.created_at)::int AS hour,
        count(*)::int AS cnt
      FROM public.crm_interacoes i
      WHERE i.empresa_id = v_empresa_id
        AND i.role = 'user'
        AND i.created_at >= p_data_inicio
        AND i.created_at <= p_data_fim
        AND (
          cardinality(v_canal_ids) = 0
          OR EXISTS (
            SELECT 1 FROM public.crm_chat_threads t
            WHERE t.id = i.conversa_id AND t.canal_id = ANY(v_canal_ids)
          )
        )
      GROUP BY 1, 2
    ) c
  ), jsonb_build_object('max_count', 0, 'cells', '[]'::jsonb));
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_analytics_overview(uuid, timestamptz, timestamptz, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_analytics_conversations_kpis(uuid, timestamptz, timestamptz, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_analytics_conversations_daily(uuid, timestamptz, timestamptz, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_analytics_traffic_heatmap(uuid, timestamptz, timestamptz, jsonb) TO authenticated;

COMMENT ON FUNCTION public.fn_analytics_overview IS 'Analytics MVP: visão geral operacional (conversas + CRM).';
COMMENT ON FUNCTION public.fn_analytics_conversations_kpis IS 'Analytics MVP: 6 KPIs de conversas com tendência vs período anterior.';
COMMENT ON FUNCTION public.fn_analytics_traffic_heatmap IS 'Analytics MVP: heatmap mensagens inbound (dow × hour).';
