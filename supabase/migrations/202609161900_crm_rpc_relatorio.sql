-- BI Workflow + Omnichannel: crm_rpc_relatorio (padrão SaaS = est_rpc_relatorio)
-- Retorna { rows, resumo } com filtros/paginação no Postgres.

CREATE OR REPLACE FUNCTION public.crm_rpc_relatorio(
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
  v_depto uuid := NULLIF(p_filtros->>'departamento_id', '')::uuid;
  v_canal uuid := NULLIF(p_filtros->>'canal_id', '')::uuid;
  v_pipeline uuid := NULLIF(p_filtros->>'pipeline_id', '')::uuid;
  v_resp uuid := NULLIF(p_filtros->>'responsavel_id', '')::uuid;
  v_min_cards int := GREATEST(COALESCE((p_filtros->>'min_cards')::int, 3), 1);
  v_inicio timestamptz;
  v_fim timestamptz;
  v_ov jsonb;
  v_kpis jsonb;
  v_daily jsonb;
  v_heat jsonb;
  v_filt_analytics jsonb;
BEGIN
  IF p_empresa_id IS NULL THEN
    RAISE EXCEPTION 'empresa_id obrigatório';
  END IF;

  v_fim := COALESCE(NULLIF(p_filtros->>'data_fim', '')::timestamptz, now());
  IF NULLIF(p_filtros->>'data_fim', '') IS NOT NULL AND (p_filtros->>'data_fim') !~ 'T' THEN
    v_fim := ((p_filtros->>'data_fim')::date + 1) - interval '1 millisecond';
  END IF;

  v_inicio := COALESCE(NULLIF(p_filtros->>'data_inicio', '')::timestamptz, v_fim - interval '7 days');
  IF NULLIF(p_filtros->>'data_inicio', '') IS NOT NULL AND (p_filtros->>'data_inicio') !~ 'T' THEN
    v_inicio := (p_filtros->>'data_inicio')::date::timestamptz;
  END IF;

  v_filt_analytics := jsonb_build_object(
    'departamento_ids', CASE WHEN v_depto IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(v_depto::text) END,
    'canal_ids', CASE WHEN v_canal IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(v_canal::text) END
  );

  CASE p_slug

  --------------------------------------------------------------------------
  WHEN 'omni-fila' THEN
    v_ov := public.fn_analytics_overview(p_empresa_id, v_inicio, v_fim, v_filt_analytics);
    RETURN jsonb_build_object(
      'rows', jsonb_build_array(
        jsonb_build_object('metrica', 'Conversas abertas', 'valor', COALESCE((v_ov->'conversas'->>'abertas')::numeric, 0)),
        jsonb_build_object('metrica', 'Não atribuídas', 'valor', COALESCE((v_ov->'conversas'->>'nao_atribuidas')::numeric, 0)),
        jsonb_build_object('metrica', 'Não atendidas', 'valor', COALESCE((v_ov->'conversas'->>'nao_atendidas')::numeric, 0)),
        jsonb_build_object('metrica', 'Em IA', 'valor', COALESCE((v_ov->'conversas'->>'em_ia')::numeric, 0)),
        jsonb_build_object('metrica', 'Em humano', 'valor', COALESCE((v_ov->'conversas'->>'em_humano')::numeric, 0)),
        jsonb_build_object('metrica', 'Cards ativos', 'valor', COALESCE((v_ov->'crm'->>'cards_ativos')::numeric, 0)),
        jsonb_build_object('metrica', 'Cards atrasados', 'valor', COALESCE((v_ov->'crm'->>'cards_atrasados')::numeric, 0)),
        jsonb_build_object('metrica', 'Receita fechada (período)', 'valor', COALESCE((v_ov->'crm'->>'receita_fechada_periodo')::numeric, 0)),
        jsonb_build_object('metrica', 'Threads novas (período)', 'valor', COALESCE((v_ov->>'threads_novas_periodo')::numeric, 0))
      ),
      'resumo', jsonb_build_object(
        'total_count', 9,
        'abertas', COALESCE((v_ov->'conversas'->>'abertas')::int, 0),
        'em_ia', COALESCE((v_ov->'conversas'->>'em_ia')::int, 0),
        'em_humano', COALESCE((v_ov->'conversas'->>'em_humano')::int, 0)
      )
    );

  --------------------------------------------------------------------------
  WHEN 'omni-sla' THEN
    v_kpis := public.fn_analytics_conversations_kpis(p_empresa_id, v_inicio, v_fim, v_filt_analytics);
    RETURN (
      WITH k AS (
        SELECT * FROM jsonb_each(COALESCE(v_kpis->'kpis', '{}'::jsonb))
      ),
      base AS (
        SELECT
          CASE key
            WHEN 'conversas' THEN 'Conversas'
            WHEN 'tempo_primeira_resposta_seg' THEN '1ª resposta (s)'
            WHEN 'tempo_espera_cliente_seg' THEN 'Espera cliente (s)'
            WHEN 'tempo_resolucao_seg' THEN 'Resolução (s)'
            WHEN 'contagem_resolucao' THEN 'Resoluções'
            WHEN 'mensagens_recebidas' THEN 'Msgs recebidas'
            ELSE key
          END AS metrica,
          COALESCE(value->>'valor', '') AS valor,
          COALESCE(value->>'anterior', '') AS anterior,
          COALESCE((value->>'tendencia_pct')::numeric, 0) AS tendencia_pct
        FROM k
      )
      SELECT jsonb_build_object(
        'rows', COALESCE((SELECT jsonb_agg(to_jsonb(b)) FROM base b), '[]'::jsonb),
        'resumo', jsonb_build_object('total_count', (SELECT count(*)::int FROM base))
      )
    );

  --------------------------------------------------------------------------
  WHEN 'omni-volume' THEN
    v_daily := public.fn_analytics_conversations_daily(p_empresa_id, v_inicio, v_fim, v_filt_analytics);
    RETURN (
      WITH base AS (
        SELECT
          COALESCE(e->>'dia', '') AS dia,
          COALESCE((e->>'conversas')::int, 0) AS conversas,
          COALESCE((e->>'mensagens_recebidas')::int, 0) AS mensagens_recebidas,
          COALESCE((e->>'resolucoes')::int, 0) AS resolucoes
        FROM jsonb_array_elements(COALESCE(v_daily, '[]'::jsonb)) e
      ),
      agg AS (
        SELECT count(*)::int AS total_count,
          COALESCE(SUM(conversas), 0)::int AS conversas,
          COALESCE(SUM(mensagens_recebidas), 0)::int AS mensagens,
          COALESCE(SUM(resolucoes), 0)::int AS resolucoes
        FROM base
      ),
      page AS (
        SELECT * FROM base ORDER BY dia DESC LIMIT v_limit OFFSET v_offset
      )
      SELECT jsonb_build_object(
        'rows', COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.dia DESC) FROM page p), '[]'::jsonb),
        'resumo', (SELECT jsonb_build_object(
          'total_count', total_count,
          'conversas', conversas,
          'mensagens', mensagens,
          'resolucoes', resolucoes
        ) FROM agg)
      )
    );

  --------------------------------------------------------------------------
  WHEN 'omni-heatmap' THEN
    v_heat := public.fn_analytics_traffic_heatmap(p_empresa_id, v_inicio, v_fim, v_filt_analytics);
    RETURN (
      WITH base AS (
        SELECT
          CASE COALESCE((e->>'dow')::int, 0)
            WHEN 0 THEN 'Dom' WHEN 1 THEN 'Seg' WHEN 2 THEN 'Ter' WHEN 3 THEN 'Qua'
            WHEN 4 THEN 'Qui' WHEN 5 THEN 'Sex' WHEN 6 THEN 'Sáb' ELSE '?'
          END AS dia_semana,
          COALESCE((e->>'hour')::int, 0) AS hora,
          COALESCE((e->>'count')::int, 0) AS count
        FROM jsonb_array_elements(COALESCE(v_heat->'cells', '[]'::jsonb)) e
      ),
      agg AS (SELECT count(*)::int AS total_count, COALESCE(SUM(count), 0)::int AS msgs FROM base),
      page AS (
        SELECT * FROM base ORDER BY count DESC, dia_semana, hora LIMIT v_limit OFFSET v_offset
      )
      SELECT jsonb_build_object(
        'rows', COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.count DESC) FROM page p), '[]'::jsonb),
        'resumo', jsonb_build_object(
          'total_count', (SELECT total_count FROM agg),
          'mensagens', (SELECT msgs FROM agg),
          'max_count', COALESCE((v_heat->>'max_count')::int, 0)
        )
      )
    );

  --------------------------------------------------------------------------
  WHEN 'omni-handover' THEN
    RETURN (
      WITH threads AS (
        SELECT
          date_trunc('day', COALESCE(t.handover_at, t.updated_at, t.created_at))::date AS dia,
          t.id,
          (t.handover_at IS NOT NULL OR t.status = 'human') AS is_handover
        FROM public.crm_chat_threads t
        WHERE t.empresa_id = p_empresa_id
          AND COALESCE(t.opened_at, t.created_at) >= v_inicio
          AND COALESCE(t.opened_at, t.created_at) <= v_fim
          AND (v_depto IS NULL OR t.departamento_id = v_depto)
          AND (v_canal IS NULL OR t.canal_id = v_canal)
      ),
      base AS (
        SELECT
          dia::text AS dia,
          count(*) FILTER (WHERE is_handover)::int AS handovers,
          count(*)::int AS threads,
          CASE WHEN count(*) > 0
            THEN ROUND((count(*) FILTER (WHERE is_handover)::numeric / count(*)) * 100, 1)
            ELSE 0 END AS taxa_pct
        FROM threads
        GROUP BY dia
      ),
      agg AS (
        SELECT
          count(*)::int AS total_count,
          COALESCE(SUM(handovers), 0)::int AS handovers,
          COALESCE(SUM(threads), 0)::int AS threads
        FROM base
      ),
      page AS (
        SELECT * FROM base ORDER BY dia DESC LIMIT v_limit OFFSET v_offset
      )
      SELECT jsonb_build_object(
        'rows', COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.dia DESC) FROM page p), '[]'::jsonb),
        'resumo', jsonb_build_object(
          'total_count', (SELECT total_count FROM agg),
          'handovers', (SELECT handovers FROM agg),
          'threads', (SELECT threads FROM agg),
          'taxa_handover_pct', CASE WHEN (SELECT threads FROM agg) > 0
            THEN ROUND(((SELECT handovers FROM agg)::numeric / (SELECT threads FROM agg)) * 100, 1)
            ELSE 0 END
        )
      )
    );

  --------------------------------------------------------------------------
  WHEN 'omni-por-canal' THEN
    RETURN (
      WITH base AS (
        SELECT
          COALESCE(c.nome, 'Sem canal') AS canal,
          COALESCE(c.tipo, '') AS tipo,
          count(DISTINCT t.id)::int AS conversas,
          count(DISTINCT t.id) FILTER (WHERE t.status = 'closed')::int AS resolucoes,
          ROUND(AVG(
            EXTRACT(EPOCH FROM (
              COALESCE(t.first_response_at, (
                SELECT MIN(i.created_at) FROM public.crm_interacoes i
                WHERE i.conversa_id = t.id AND i.role IN ('assistant', 'system')
              )) - COALESCE(t.opened_at, t.created_at)
            ))
          ) FILTER (WHERE true)::numeric, 1) AS frt_seg
        FROM public.crm_chat_threads t
        LEFT JOIN public.crm_canais c ON c.id = t.canal_id
        WHERE t.empresa_id = p_empresa_id
          AND COALESCE(t.opened_at, t.created_at) >= v_inicio
          AND COALESCE(t.opened_at, t.created_at) <= v_fim
          AND (v_depto IS NULL OR t.departamento_id = v_depto)
        GROUP BY c.nome, c.tipo
      ),
      agg AS (SELECT count(*)::int AS total_count, COALESCE(SUM(conversas), 0)::int AS conversas FROM base),
      page AS (
        SELECT * FROM base ORDER BY conversas DESC LIMIT v_limit OFFSET v_offset
      )
      SELECT jsonb_build_object(
        'rows', COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.conversas DESC) FROM page p), '[]'::jsonb),
        'resumo', jsonb_build_object(
          'total_count', (SELECT total_count FROM agg),
          'conversas', (SELECT conversas FROM agg)
        )
      )
    );

  --------------------------------------------------------------------------
  WHEN 'wf-receita' THEN
    RETURN (
      WITH base AS (
        SELECT
          COALESCE(p.nome, 'Sem funil') AS pipeline,
          count(*)::int AS fechamentos,
          ROUND(COALESCE(SUM(c.valor), 0)::numeric, 2) AS receita,
          ROUND(COALESCE(AVG(c.valor), 0)::numeric, 2) AS ticket_medio
        FROM public.crm_cards c
        LEFT JOIN public.pipelines p ON p.id = c.pipeline_id
        WHERE c.empresa_id = p_empresa_id
          AND COALESCE(c.finalizado, false) = true
          AND COALESCE(c.finalizado_em, c.updated_at) >= v_inicio
          AND COALESCE(c.finalizado_em, c.updated_at) <= v_fim
          AND (v_pipeline IS NULL OR c.pipeline_id = v_pipeline)
          AND (v_depto IS NULL OR p.departamento_id = v_depto)
        GROUP BY p.nome
      ),
      agg AS (
        SELECT count(*)::int AS total_count,
          COALESCE(SUM(fechamentos), 0)::int AS fechamentos,
          COALESCE(SUM(receita), 0)::numeric AS receita
        FROM base
      ),
      page AS (SELECT * FROM base ORDER BY receita DESC LIMIT v_limit OFFSET v_offset)
      SELECT jsonb_build_object(
        'rows', COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.receita DESC) FROM page p), '[]'::jsonb),
        'resumo', jsonb_build_object(
          'total_count', (SELECT total_count FROM agg),
          'fechamentos', (SELECT fechamentos FROM agg),
          'total_valor', ROUND((SELECT receita FROM agg), 2)
        )
      )
    );

  --------------------------------------------------------------------------
  WHEN 'wf-carteira' THEN
    RETURN (
      WITH base AS (
        SELECT
          COALESCE(p.nome, 'Sem funil') AS pipeline,
          COALESCE(s.nome, 'Sem etapa') AS etapa,
          count(*)::int AS ativos,
          count(*) FILTER (WHERE c.data_prazo IS NOT NULL AND c.data_prazo < CURRENT_DATE)::int AS atrasados,
          ROUND(COALESCE(SUM(c.valor), 0)::numeric, 2) AS valor_aberto
        FROM public.crm_cards c
        LEFT JOIN public.pipelines p ON p.id = c.pipeline_id
        LEFT JOIN public.pipeline_stages s ON s.id = c.stage_id
        WHERE c.empresa_id = p_empresa_id
          AND COALESCE(c.finalizado, false) = false
          AND (v_pipeline IS NULL OR c.pipeline_id = v_pipeline)
          AND (v_depto IS NULL OR p.departamento_id = v_depto)
          AND (v_resp IS NULL OR c.responsavel_id = v_resp)
        GROUP BY p.nome, s.nome, s.ordem
      ),
      agg AS (
        SELECT count(*)::int AS total_count,
          COALESCE(SUM(ativos), 0)::int AS ativos,
          COALESCE(SUM(atrasados), 0)::int AS atrasados,
          COALESCE(SUM(valor_aberto), 0)::numeric AS valor_aberto
        FROM base
      ),
      page AS (SELECT pipeline, etapa, ativos, atrasados, valor_aberto FROM base ORDER BY valor_aberto DESC LIMIT v_limit OFFSET v_offset)
      SELECT jsonb_build_object(
        'rows', COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.valor_aberto DESC) FROM page p), '[]'::jsonb),
        'resumo', jsonb_build_object(
          'total_count', (SELECT total_count FROM agg),
          'ativos', (SELECT ativos FROM agg),
          'atrasados', (SELECT atrasados FROM agg),
          'valor_aberto', ROUND((SELECT valor_aberto FROM agg), 2)
        )
      )
    );

  --------------------------------------------------------------------------
  WHEN 'wf-velocidade' THEN
    RETURN (
      WITH base AS (
        SELECT
          COALESCE(p.nome, 'Sem funil') AS pipeline,
          count(*)::int AS fechamentos,
          ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE(c.finalizado_em, c.updated_at) - c.created_at)) / 86400.0)::numeric, 1) AS dias_medios,
          ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (
            ORDER BY EXTRACT(EPOCH FROM (COALESCE(c.finalizado_em, c.updated_at) - c.created_at)) / 86400.0
          )::numeric, 1) AS dias_mediana
        FROM public.crm_cards c
        LEFT JOIN public.pipelines p ON p.id = c.pipeline_id
        WHERE c.empresa_id = p_empresa_id
          AND COALESCE(c.finalizado, false) = true
          AND COALESCE(c.finalizado_em, c.updated_at) >= v_inicio
          AND COALESCE(c.finalizado_em, c.updated_at) <= v_fim
          AND (v_pipeline IS NULL OR c.pipeline_id = v_pipeline)
        GROUP BY p.nome
      ),
      agg AS (SELECT count(*)::int AS total_count FROM base),
      page AS (SELECT * FROM base ORDER BY dias_medios DESC LIMIT v_limit OFFSET v_offset)
      SELECT jsonb_build_object(
        'rows', COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.dias_medios DESC) FROM page p), '[]'::jsonb),
        'resumo', jsonb_build_object('total_count', (SELECT total_count FROM agg))
      )
    );

  --------------------------------------------------------------------------
  WHEN 'wf-conversao-etapas' THEN
    RETURN (
      WITH movs AS (
        SELECT
          COALESCE(ds.nome, '(início)') AS de_etapa,
          COALESCE(ps.nome, '(fim)') AS para_etapa,
          count(*)::int AS movimentacoes
        FROM public.crm_cards_history h
        LEFT JOIN public.pipeline_stages ds ON ds.id = h.de_stage_id
        LEFT JOIN public.pipeline_stages ps ON ps.id = h.para_stage_id
        LEFT JOIN public.crm_cards c ON c.id = h.card_id
        WHERE h.empresa_id = p_empresa_id
          AND h.acao = 'STATUS_CHANGED'
          AND h.created_at >= v_inicio
          AND h.created_at <= v_fim
          AND (v_pipeline IS NULL OR c.pipeline_id = v_pipeline OR ps.pipeline_id = v_pipeline)
        GROUP BY ds.nome, ps.nome
      ),
      tot AS (SELECT COALESCE(SUM(movimentacoes), 0)::numeric AS t FROM movs),
      base AS (
        SELECT
          de_etapa,
          para_etapa,
          movimentacoes,
          CASE WHEN (SELECT t FROM tot) > 0
            THEN ROUND((movimentacoes::numeric / (SELECT t FROM tot)) * 100, 1)
            ELSE 0 END AS pct_do_funil
        FROM movs
      ),
      agg AS (SELECT count(*)::int AS total_count, COALESCE(SUM(movimentacoes), 0)::int AS movs FROM base),
      page AS (SELECT * FROM base ORDER BY movimentacoes DESC LIMIT v_limit OFFSET v_offset)
      SELECT jsonb_build_object(
        'rows', COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.movimentacoes DESC) FROM page p), '[]'::jsonb),
        'resumo', jsonb_build_object(
          'total_count', (SELECT total_count FROM agg),
          'movimentacoes', (SELECT movs FROM agg)
        )
      )
    );

  --------------------------------------------------------------------------
  WHEN 'wf-dwell' THEN
    RETURN (
      WITH exits AS (
        SELECT
          h.de_stage_id AS stage_id,
          h.created_at AS exited_at,
          LAG(h.created_at) OVER (PARTITION BY h.card_id ORDER BY h.created_at) AS entered_at
        FROM public.crm_cards_history h
        WHERE h.empresa_id = p_empresa_id
          AND h.acao = 'STATUS_CHANGED'
          AND h.de_stage_id IS NOT NULL
          AND h.created_at >= v_inicio
          AND h.created_at <= v_fim
      ),
      base AS (
        SELECT
          COALESCE(s.nome, 'Sem etapa') AS etapa,
          count(*)::int AS saidas,
          ROUND(AVG(EXTRACT(EPOCH FROM (e.exited_at - COALESCE(e.entered_at, e.exited_at))) / 86400.0)::numeric, 1) AS dias_medios
        FROM exits e
        LEFT JOIN public.pipeline_stages s ON s.id = e.stage_id
        WHERE (v_pipeline IS NULL OR s.pipeline_id = v_pipeline)
        GROUP BY s.nome, s.ordem
      ),
      agg AS (SELECT count(*)::int AS total_count FROM base),
      page AS (SELECT etapa, saidas, dias_medios FROM base ORDER BY dias_medios DESC LIMIT v_limit OFFSET v_offset)
      SELECT jsonb_build_object(
        'rows', COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.dias_medios DESC) FROM page p), '[]'::jsonb),
        'resumo', jsonb_build_object('total_count', (SELECT total_count FROM agg))
      )
    );

  --------------------------------------------------------------------------
  WHEN 'wf-forecast' THEN
    RETURN (
      WITH base AS (
        SELECT
          COALESCE(p.nome, 'Sem funil') AS pipeline,
          COALESCE(s.nome, 'Sem etapa') AS etapa,
          count(*)::int AS cards,
          ROUND(COALESCE(SUM(c.valor), 0)::numeric, 2) AS valor_bruto,
          ROUND(COALESCE(AVG(s.probabilidade_fechamento), 0)::numeric, 1) AS probabilidade,
          ROUND(COALESCE(SUM(c.valor * COALESCE(s.probabilidade_fechamento, 0) / 100.0), 0)::numeric, 2) AS valor_ponderado
        FROM public.crm_cards c
        LEFT JOIN public.pipelines p ON p.id = c.pipeline_id
        LEFT JOIN public.pipeline_stages s ON s.id = c.stage_id
        WHERE c.empresa_id = p_empresa_id
          AND COALESCE(c.finalizado, false) = false
          AND (v_pipeline IS NULL OR c.pipeline_id = v_pipeline)
          AND (v_depto IS NULL OR p.departamento_id = v_depto)
        GROUP BY p.nome, s.nome, s.ordem
      ),
      agg AS (
        SELECT count(*)::int AS total_count,
          COALESCE(SUM(valor_bruto), 0)::numeric AS bruto,
          COALESCE(SUM(valor_ponderado), 0)::numeric AS ponderado
        FROM base
      ),
      page AS (SELECT * FROM base ORDER BY valor_ponderado DESC LIMIT v_limit OFFSET v_offset)
      SELECT jsonb_build_object(
        'rows', COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.valor_ponderado DESC) FROM page p), '[]'::jsonb),
        'resumo', jsonb_build_object(
          'total_count', (SELECT total_count FROM agg),
          'valor_aberto', ROUND((SELECT bruto FROM agg), 2),
          'valor_ponderado', ROUND((SELECT ponderado FROM agg), 2)
        )
      )
    );

  --------------------------------------------------------------------------
  WHEN 'wf-gargalos' THEN
    RETURN (
      WITH base AS (
        SELECT
          COALESCE(p.nome, 'Sem funil') AS pipeline,
          COALESCE(s.nome, 'Sem etapa') AS etapa,
          count(*)::int AS cards,
          ROUND(COALESCE(SUM(c.valor), 0)::numeric, 2) AS valor_aberto
        FROM public.crm_cards c
        LEFT JOIN public.pipelines p ON p.id = c.pipeline_id
        LEFT JOIN public.pipeline_stages s ON s.id = c.stage_id
        WHERE c.empresa_id = p_empresa_id
          AND COALESCE(c.finalizado, false) = false
          AND (v_pipeline IS NULL OR c.pipeline_id = v_pipeline)
        GROUP BY p.nome, s.nome, s.ordem
        HAVING count(*) >= v_min_cards
      ),
      agg AS (SELECT count(*)::int AS total_count, COALESCE(SUM(cards), 0)::int AS cards FROM base),
      page AS (SELECT * FROM base ORDER BY cards DESC LIMIT v_limit OFFSET v_offset)
      SELECT jsonb_build_object(
        'rows', COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.cards DESC) FROM page p), '[]'::jsonb),
        'resumo', jsonb_build_object(
          'total_count', (SELECT total_count FROM agg),
          'cards', (SELECT cards FROM agg),
          'min_cards', v_min_cards
        )
      )
    );

  --------------------------------------------------------------------------
  WHEN 'wf-produtividade' THEN
    RETURN (
      WITH movs AS (
        SELECT h.usuario_id, count(*)::int AS movimentacoes
        FROM public.crm_cards_history h
        LEFT JOIN public.crm_cards c ON c.id = h.card_id
        WHERE h.empresa_id = p_empresa_id
          AND h.acao = 'STATUS_CHANGED'
          AND h.created_at >= v_inicio
          AND h.created_at <= v_fim
          AND h.usuario_id IS NOT NULL
          AND (v_pipeline IS NULL OR c.pipeline_id = v_pipeline)
        GROUP BY h.usuario_id
      ),
      fech AS (
        SELECT c.responsavel_id AS usuario_id,
          count(*)::int AS fechamentos,
          ROUND(COALESCE(SUM(c.valor), 0)::numeric, 2) AS receita
        FROM public.crm_cards c
        WHERE c.empresa_id = p_empresa_id
          AND COALESCE(c.finalizado, false) = true
          AND COALESCE(c.finalizado_em, c.updated_at) >= v_inicio
          AND COALESCE(c.finalizado_em, c.updated_at) <= v_fim
          AND c.responsavel_id IS NOT NULL
          AND (v_pipeline IS NULL OR c.pipeline_id = v_pipeline)
        GROUP BY c.responsavel_id
      ),
      base AS (
        SELECT
          COALESCE(u.nome_completo, u.email, 'Sem nome') AS responsavel,
          COALESCE(m.movimentacoes, 0) AS movimentacoes,
          COALESCE(f.fechamentos, 0) AS fechamentos,
          COALESCE(f.receita, 0) AS receita
        FROM (
          SELECT usuario_id FROM movs
          UNION
          SELECT usuario_id FROM fech
        ) ids
        LEFT JOIN movs m ON m.usuario_id = ids.usuario_id
        LEFT JOIN fech f ON f.usuario_id = ids.usuario_id
        LEFT JOIN public.usuarios u ON u.id = ids.usuario_id
      ),
      agg AS (
        SELECT count(*)::int AS total_count,
          COALESCE(SUM(fechamentos), 0)::int AS fechamentos,
          COALESCE(SUM(receita), 0)::numeric AS receita
        FROM base
      ),
      page AS (SELECT * FROM base ORDER BY receita DESC, movimentacoes DESC LIMIT v_limit OFFSET v_offset)
      SELECT jsonb_build_object(
        'rows', COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.receita DESC) FROM page p), '[]'::jsonb),
        'resumo', jsonb_build_object(
          'total_count', (SELECT total_count FROM agg),
          'fechamentos', (SELECT fechamentos FROM agg),
          'total_valor', ROUND((SELECT receita FROM agg), 2)
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

COMMENT ON FUNCTION public.crm_rpc_relatorio(uuid, text, jsonb) IS
  'BI Workflow+Omnichannel: filtros/agregação/paginação no Postgres. Retorna {rows, resumo}.';

GRANT EXECUTE ON FUNCTION public.crm_rpc_relatorio(uuid, text, jsonb) TO authenticated, service_role;
