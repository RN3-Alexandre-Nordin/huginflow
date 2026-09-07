-- Fase 5: ownership dos runs, hardening dos RPCs e filtros analíticos consistentes.

ALTER TABLE public.test_runs
  ADD COLUMN organization_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE;

CREATE INDEX idx_test_runs_organization_started
  ON public.test_runs (organization_id, started_at DESC);

CREATE OR REPLACE VIEW public.vw_analytics_threads
WITH (security_invoker = true)
AS
SELECT
  t.id AS sessao_id,
  t.empresa_id,
  t.canal_id,
  t.lead_id,
  t.card_id,
  t.departamento_id,
  t.pipeline_id,
  t.status,
  coalesce(t.opened_at, t.created_at) AS opened_at,
  t.closed_at,
  t.first_response_at,
  t.first_response_role,
  t.resolved_at,
  t.handover_at,
  t.message_count_inbound,
  t.message_count_outbound,
  lc.atribuido_a_id,
  lc.last_human_interaction,
  lc.conversa_status
FROM public.crm_chat_threads t
LEFT JOIN LATERAL (
  SELECT c.atribuido_a_id, c.last_human_interaction, c.status AS conversa_status
  FROM public.crm_conversas c
  WHERE c.sessao_id = t.id
    AND c.empresa_id = t.empresa_id
  ORDER BY c.created_at DESC
  LIMIT 1
) lc ON true;

CREATE OR REPLACE FUNCTION public.fn_analytics_period_metrics(
  p_empresa_id uuid,
  p_inicio timestamptz,
  p_fim timestamptz,
  p_depto_ids uuid[],
  p_canal_ids uuid[]
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'conversas', (
      SELECT count(*)::bigint
      FROM public.crm_chat_threads t
      WHERE t.empresa_id = p_empresa_id
        AND coalesce(t.opened_at, t.created_at) >= p_inicio
        AND coalesce(t.opened_at, t.created_at) <= p_fim
        AND (cardinality(p_depto_ids) = 0 OR t.departamento_id = ANY(p_depto_ids))
        AND (cardinality(p_canal_ids) = 0 OR t.canal_id = ANY(p_canal_ids))
    ),
    'mensagens_recebidas', (
      SELECT count(*)::bigint
      FROM public.crm_interacoes i
      WHERE i.empresa_id = p_empresa_id
        AND i.role = 'user'
        AND i.created_at >= p_inicio
        AND i.created_at <= p_fim
        AND EXISTS (
          SELECT 1
          FROM public.crm_chat_threads t
          WHERE t.id = i.conversa_id
            AND t.empresa_id = i.empresa_id
            AND (cardinality(p_depto_ids) = 0 OR t.departamento_id = ANY(p_depto_ids))
            AND (cardinality(p_canal_ids) = 0 OR t.canal_id = ANY(p_canal_ids))
        )
    ),
    'resolucoes', (
      SELECT count(*)::bigint
      FROM public.crm_chat_threads t
      WHERE t.empresa_id = p_empresa_id
        AND t.status = 'closed'
        AND coalesce(t.closed_at, t.updated_at) >= p_inicio
        AND coalesce(t.closed_at, t.updated_at) <= p_fim
        AND (cardinality(p_depto_ids) = 0 OR t.departamento_id = ANY(p_depto_ids))
        AND (cardinality(p_canal_ids) = 0 OR t.canal_id = ANY(p_canal_ids))
    ),
    'avg_first_response_sec', (
      SELECT avg(extract(epoch FROM (fr.first_out - fr.first_in)))
      FROM (
        SELECT
          min(i.created_at) FILTER (WHERE i.role = 'user') AS first_in,
          min(i.created_at) FILTER (
            WHERE i.role IN ('assistant', 'system')
              AND coalesce(i.metadata->>'error', 'false') <> 'true'
          ) AS first_out
        FROM public.crm_interacoes i
        JOIN public.crm_chat_threads t
          ON t.id = i.conversa_id
         AND t.empresa_id = i.empresa_id
        WHERE i.empresa_id = p_empresa_id
          AND i.conversa_id IS NOT NULL
          AND i.created_at >= p_inicio
          AND i.created_at <= p_fim
          AND (cardinality(p_depto_ids) = 0 OR t.departamento_id = ANY(p_depto_ids))
          AND (cardinality(p_canal_ids) = 0 OR t.canal_id = ANY(p_canal_ids))
        GROUP BY i.conversa_id
      ) fr
      WHERE fr.first_in IS NOT NULL
        AND fr.first_out IS NOT NULL
        AND fr.first_out > fr.first_in
    ),
    'avg_wait_sec', (
      SELECT avg(extract(epoch FROM (nxt.created_at - cur.created_at)))
      FROM public.crm_interacoes cur
      JOIN public.crm_chat_threads t
        ON t.id = cur.conversa_id
       AND t.empresa_id = cur.empresa_id
      JOIN LATERAL (
        SELECT min(i2.created_at) AS created_at
        FROM public.crm_interacoes i2
        WHERE i2.conversa_id = cur.conversa_id
          AND i2.empresa_id = cur.empresa_id
          AND i2.created_at > cur.created_at
          AND i2.role IN ('assistant', 'system')
      ) nxt ON true
      WHERE cur.empresa_id = p_empresa_id
        AND cur.role = 'user'
        AND cur.created_at >= p_inicio
        AND cur.created_at <= p_fim
        AND (cardinality(p_depto_ids) = 0 OR t.departamento_id = ANY(p_depto_ids))
        AND (cardinality(p_canal_ids) = 0 OR t.canal_id = ANY(p_canal_ids))
    ),
    'avg_resolution_sec', (
      SELECT avg(extract(epoch FROM (
        coalesce(t.resolved_at, t.closed_at) - coalesce(t.opened_at, t.created_at)
      )))
      FROM public.crm_chat_threads t
      WHERE t.empresa_id = p_empresa_id
        AND t.status = 'closed'
        AND coalesce(t.closed_at, t.updated_at) >= p_inicio
        AND coalesce(t.closed_at, t.updated_at) <= p_fim
        AND coalesce(t.resolved_at, t.closed_at) IS NOT NULL
        AND (cardinality(p_depto_ids) = 0 OR t.departamento_id = ANY(p_depto_ids))
        AND (cardinality(p_canal_ids) = 0 OR t.canal_id = ANY(p_canal_ids))
    )
  );
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
SET search_path = ''
AS $$
DECLARE
  v_empresa_id uuid;
  v_depto_ids uuid[];
  v_canal_ids uuid[];
BEGIN
  v_empresa_id := public.fn_analytics_resolve_empresa_id(p_empresa_id);
  SELECT coalesce(array_agg(x::uuid), ARRAY[]::uuid[]) INTO v_depto_ids
  FROM jsonb_array_elements_text(coalesce(p_filtros->'departamento_ids', '[]'::jsonb)) AS t(x);
  SELECT coalesce(array_agg(x::uuid), ARRAY[]::uuid[]) INTO v_canal_ids
  FROM jsonb_array_elements_text(coalesce(p_filtros->'canal_ids', '[]'::jsonb)) AS t(x);

  RETURN coalesce((
    SELECT jsonb_agg(
      jsonb_build_object(
        'dia', combined.dia,
        'conversas', combined.conversas,
        'mensagens_recebidas', combined.mensagens_recebidas,
        'resolucoes', combined.resolucoes
      ) ORDER BY combined.dia
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
        SELECT date_trunc('day', i.created_at)::date AS dia, count(*)::int AS mensagens_recebidas
        FROM public.crm_interacoes i
        JOIN public.crm_chat_threads th
          ON th.id = i.conversa_id
         AND th.empresa_id = i.empresa_id
        WHERE i.empresa_id = v_empresa_id
          AND i.role = 'user'
          AND i.created_at >= p_data_inicio
          AND i.created_at <= p_data_fim
          AND (cardinality(v_depto_ids) = 0 OR th.departamento_id = ANY(v_depto_ids))
          AND (cardinality(v_canal_ids) = 0 OR th.canal_id = ANY(v_canal_ids))
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
SET search_path = ''
AS $$
DECLARE
  v_empresa_id uuid;
  v_depto_ids uuid[];
  v_canal_ids uuid[];
BEGIN
  v_empresa_id := public.fn_analytics_resolve_empresa_id(p_empresa_id);
  SELECT coalesce(array_agg(x::uuid), ARRAY[]::uuid[]) INTO v_depto_ids
  FROM jsonb_array_elements_text(coalesce(p_filtros->'departamento_ids', '[]'::jsonb)) AS t(x);
  SELECT coalesce(array_agg(x::uuid), ARRAY[]::uuid[]) INTO v_canal_ids
  FROM jsonb_array_elements_text(coalesce(p_filtros->'canal_ids', '[]'::jsonb)) AS t(x);

  RETURN coalesce((
    SELECT jsonb_build_object(
      'max_count', max(c.cnt),
      'cells', jsonb_agg(
        jsonb_build_object('dow', c.dow, 'hour', c.hour_of_day, 'count', c.cnt)
        ORDER BY c.dow, c.hour_of_day
      )
    )
    FROM (
      SELECT
        extract(dow FROM i.created_at)::int AS dow,
        extract(hour FROM i.created_at)::int AS hour_of_day,
        count(*)::int AS cnt
      FROM public.crm_interacoes i
      JOIN public.crm_chat_threads t
        ON t.id = i.conversa_id
       AND t.empresa_id = i.empresa_id
      WHERE i.empresa_id = v_empresa_id
        AND i.role = 'user'
        AND i.created_at >= p_data_inicio
        AND i.created_at <= p_data_fim
        AND (cardinality(v_depto_ids) = 0 OR t.departamento_id = ANY(v_depto_ids))
        AND (cardinality(v_canal_ids) = 0 OR t.canal_id = ANY(v_canal_ids))
      GROUP BY 1, 2
    ) c
  ), jsonb_build_object('max_count', 0, 'cells', '[]'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_finance_valor_aberto(p_conta_id uuid)
RETURNS numeric(12, 2)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_empresa_id uuid;
  v_saldo numeric(12, 2);
BEGIN
  SELECT empresa_id, saldo INTO v_empresa_id, v_saldo
  FROM public.finance_contas_receber
  WHERE id = p_conta_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta a receber não encontrada' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.fn_finance_require_empresa_access(v_empresa_id);
  RETURN v_saldo;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_analytics_resolve_empresa_id(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_analytics_trend_pct(numeric, numeric, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_analytics_period_metrics(uuid, timestamptz, timestamptz, uuid[], uuid[]) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_analytics_overview(uuid, timestamptz, timestamptz, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_analytics_conversations_kpis(uuid, timestamptz, timestamptz, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_analytics_conversations_daily(uuid, timestamptz, timestamptz, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_analytics_traffic_heatmap(uuid, timestamptz, timestamptz, jsonb) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.fn_analytics_overview(uuid, timestamptz, timestamptz, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_analytics_conversations_kpis(uuid, timestamptz, timestamptz, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_analytics_conversations_daily(uuid, timestamptz, timestamptz, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_analytics_traffic_heatmap(uuid, timestamptz, timestamptz, jsonb) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_finance_valor_aberto(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_finance_valor_aberto(uuid) TO authenticated, service_role;
