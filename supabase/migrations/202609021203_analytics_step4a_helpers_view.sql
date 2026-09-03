-- Analytics BI — Step 4a: helpers + view (dev-safe)

CREATE OR REPLACE FUNCTION public.fn_analytics_resolve_empresa_id(p_empresa_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.fn_finance_resolve_empresa_id(p_empresa_id);
$$;

COMMENT ON FUNCTION public.fn_analytics_resolve_empresa_id(uuid) IS
  'Tenant ativo para RPCs de analytics; delega fn_finance_resolve_empresa_id.';

CREATE OR REPLACE FUNCTION public.fn_analytics_trend_pct(
  p_anterior numeric,
  p_atual numeric,
  p_lower_is_better boolean DEFAULT false
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_anterior IS NULL OR p_atual IS NULL THEN NULL
    WHEN p_anterior = 0 THEN CASE WHEN p_atual = 0 THEN 0 ELSE 100 END
    ELSE round(
      (CASE WHEN p_lower_is_better THEN (p_anterior - p_atual) ELSE (p_atual - p_anterior) END)
      / abs(p_anterior) * 100,
      1
    )
  END;
$$;

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
  SELECT
    c.atribuido_a_id,
    c.last_human_interaction,
    c.status AS conversa_status
  FROM public.crm_conversas c
  WHERE c.sessao_id = t.id
  ORDER BY c.created_at DESC
  LIMIT 1
) lc ON true;

COMMENT ON VIEW public.vw_analytics_threads IS
  'Thread omnichannel + último snapshot de crm_conversas; RLS via security_invoker.';

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
SET search_path = public
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
        AND (
          cardinality(p_canal_ids) = 0
          OR EXISTS (
            SELECT 1 FROM public.crm_chat_threads t
            WHERE t.id = i.conversa_id AND t.canal_id = ANY(p_canal_ids)
          )
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
        WHERE i.empresa_id = p_empresa_id
          AND i.conversa_id IS NOT NULL
          AND i.created_at >= p_inicio
          AND i.created_at <= p_fim
        GROUP BY i.conversa_id
      ) fr
      WHERE fr.first_in IS NOT NULL
        AND fr.first_out IS NOT NULL
        AND fr.first_out > fr.first_in
    ),
    'avg_wait_sec', (
      SELECT avg(extract(epoch FROM (nxt.created_at - cur.created_at)))
      FROM public.crm_interacoes cur
      JOIN LATERAL (
        SELECT min(i2.created_at) AS created_at
        FROM public.crm_interacoes i2
        WHERE i2.conversa_id = cur.conversa_id
          AND i2.created_at > cur.created_at
          AND i2.role IN ('assistant', 'system')
      ) nxt ON true
      WHERE cur.empresa_id = p_empresa_id
        AND cur.role = 'user'
        AND cur.created_at >= p_inicio
        AND cur.created_at <= p_fim
    ),
    'avg_resolution_sec', (
      SELECT avg(extract(epoch FROM (coalesce(t.resolved_at, t.closed_at) - coalesce(t.opened_at, t.created_at))))
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

GRANT EXECUTE ON FUNCTION public.fn_analytics_resolve_empresa_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_analytics_trend_pct(numeric, numeric, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_analytics_period_metrics(uuid, timestamptz, timestamptz, uuid[], uuid[]) TO authenticated;
GRANT SELECT ON public.vw_analytics_threads TO authenticated;
