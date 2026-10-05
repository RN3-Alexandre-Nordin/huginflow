-- Fase 9: relatórios de compras, só leitura. Nenhuma regra nova.
-- Agregação e paginação no Postgres. A UI só renderiza { rows, resumo }.

CREATE INDEX IF NOT EXISTS idx_com_nota_itens_empresa_aviso
  ON public.com_nota_itens (empresa_id)
  WHERE aviso_preco;

CREATE OR REPLACE FUNCTION public.com_rpc_relatorio(
  p_empresa_id uuid,
  p_slug text,
  p_filtros jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit int := LEAST(GREATEST(COALESCE((p_filtros->>'limit')::int, 50), 1), 200);
  v_offset int := GREATEST(COALESCE((p_filtros->>'offset')::int, 0), 0);
  v_inicio date := NULLIF(p_filtros->>'data_inicio', '')::date;
  v_fim date := NULLIF(p_filtros->>'data_fim', '')::date;
  v_tipo text := NULLIF(p_filtros->>'tipo', '');
  v_status text := NULLIF(p_filtros->>'status', '');
  v_situacao text := COALESCE(NULLIF(p_filtros->>'situacao', ''), 'em_uso');
  v_sku text := NULLIF(replace(replace(trim(COALESCE(p_filtros->>'sku_codigo', '')), '%', ''), '_', ''), '');
BEGIN
  IF p_empresa_id IS NULL THEN
    RAISE EXCEPTION 'PARAMETRO_OBRIGATORIO: empresa_id é obrigatório.';
  END IF;

  IF auth.role() = 'authenticated' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_user_id = auth.uid()
        AND COALESCE(u.ativo, true)
        AND (u.role_global = 'superadmin' OR u.empresa_id = p_empresa_id)
    ) THEN
      RAISE EXCEPTION 'ACESSO_NEGADO: usuário fora do tenant.';
    END IF;
    IF NOT public.check_permission('compras_relatorios', 'view') THEN
      RAISE EXCEPTION 'ACESSO_NEGADO: sem permissão para relatórios de compras.';
    END IF;
  END IF;

  IF v_tipo IS NOT NULL AND v_tipo NOT IN ('produtivo', 'consumo', 'servico') THEN
    v_tipo := NULL;
  END IF;
  IF v_status IS NOT NULL AND v_status NOT IN ('rascunho', 'confirmada', 'cancelada') THEN
    v_status := NULL;
  END IF;
  IF v_situacao NOT IN ('em_uso', 'em_estoque', 'em_terceiro', 'baixada', 'todos') THEN
    v_situacao := 'em_uso';
  END IF;

  CASE p_slug

  WHEN 'compras-por-tipo' THEN
    RETURN (
      WITH base AS (
        SELECT
          to_char(p.created_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY') AS data,
          p.numero,
          f.nome AS fornecedor,
          CASE p.tipo
            WHEN 'produtivo' THEN 'Material produtivo'
            WHEN 'consumo' THEN 'Consumo'
            WHEN 'servico' THEN 'Serviço'
            ELSE p.tipo
          END AS tipo,
          CASE p.status
            WHEN 'aguardando_aprovacao' THEN 'Aguardando aprovação'
            WHEN 'aprovado' THEN 'Aprovado'
            WHEN 'recusado' THEN 'Recusado'
            WHEN 'cancelado' THEN 'Cancelado'
            WHEN 'recebido_parcial' THEN 'Recebido parcial'
            WHEN 'recebido' THEN 'Recebido'
            WHEN 'rascunho' THEN 'Rascunho'
            ELSE p.status
          END AS status,
          p.valor_total AS valor,
          p.created_at AS ordem
        FROM public.com_pedidos p
        JOIN public.crm_leads f ON f.id = p.fornecedor_id AND f.empresa_id = p.empresa_id
        WHERE p.empresa_id = p_empresa_id
          AND (v_tipo IS NULL OR p.tipo = v_tipo)
          AND (v_inicio IS NULL OR (p.created_at AT TIME ZONE 'America/Sao_Paulo')::date >= v_inicio)
          AND (v_fim IS NULL OR (p.created_at AT TIME ZONE 'America/Sao_Paulo')::date <= v_fim)
      ),
      agg AS (
        SELECT count(*)::int AS total_count, COALESCE(SUM(valor), 0)::numeric AS total_valor
        FROM base
      ),
      page AS (
        SELECT data, numero, fornecedor, tipo, status, valor,
               row_number() OVER (ORDER BY ordem DESC, numero DESC) AS seq
        FROM base
        ORDER BY ordem DESC, numero DESC
        LIMIT v_limit OFFSET v_offset
      )
      SELECT jsonb_build_object(
        'rows', COALESCE((SELECT jsonb_agg((to_jsonb(page) - 'seq') ORDER BY page.seq) FROM page), '[]'::jsonb),
        'resumo', jsonb_build_object(
          'total_count', (SELECT total_count FROM agg),
          'total_valor', ROUND((SELECT total_valor FROM agg), 2)
        )
      )
    );

  WHEN 'quem-liberou' THEN
    RETURN (
      WITH base AS (
        SELECT
          p.numero AS pedido,
          f.nome AS fornecedor,
          a.nivel,
          COALESCE(u.nome_completo, u.email, '') AS quem,
          CASE a.decisao WHEN 'aprovado' THEN 'Aprovado' ELSE 'Recusado' END AS decisao,
          COALESCE(a.motivo, '') AS motivo,
          to_char(a.decidido_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') AS quando,
          a.decidido_em AS ordem,
          a.decisao AS decisao_codigo
        FROM public.com_pedido_aprovacoes a
        JOIN public.com_pedidos p ON p.id = a.pedido_id AND p.empresa_id = a.empresa_id
        JOIN public.crm_leads f ON f.id = p.fornecedor_id AND f.empresa_id = p.empresa_id
        JOIN public.usuarios u ON u.id = a.usuario_id
        WHERE a.empresa_id = p_empresa_id
          AND (v_inicio IS NULL OR (a.decidido_em AT TIME ZONE 'America/Sao_Paulo')::date >= v_inicio)
          AND (v_fim IS NULL OR (a.decidido_em AT TIME ZONE 'America/Sao_Paulo')::date <= v_fim)
      ),
      agg AS (
        SELECT
          count(*)::int AS total_count,
          count(*) FILTER (WHERE decisao_codigo = 'aprovado')::int AS aprovados,
          count(*) FILTER (WHERE decisao_codigo = 'recusado')::int AS recusados
        FROM base
      ),
      page AS (
        SELECT pedido, fornecedor, nivel, quem, decisao, motivo, quando,
               row_number() OVER (ORDER BY ordem DESC) AS seq
        FROM base
        ORDER BY ordem DESC
        LIMIT v_limit OFFSET v_offset
      )
      SELECT jsonb_build_object(
        'rows', COALESCE((SELECT jsonb_agg((to_jsonb(page) - 'seq') ORDER BY page.seq) FROM page), '[]'::jsonb),
        'resumo', jsonb_build_object(
          'total_count', (SELECT total_count FROM agg),
          'aprovados', (SELECT aprovados FROM agg),
          'recusados', (SELECT recusados FROM agg)
        )
      )
    );

  WHEN 'a-chegar' THEN
    RETURN (
      WITH base AS (
        SELECT
          p.numero,
          f.nome AS fornecedor,
          COALESCE(to_char(p.previsao_chegada, 'DD/MM/YYYY'), '') AS previsao,
          p.valor_total AS valor,
          p.previsao_chegada AS ordem_prev,
          p.created_at AS ordem
        FROM public.com_pedidos p
        JOIN public.crm_leads f ON f.id = p.fornecedor_id AND f.empresa_id = p.empresa_id
        WHERE p.empresa_id = p_empresa_id
          AND p.status = 'aprovado'
          AND p.tipo = 'produtivo'
      ),
      agg AS (
        SELECT count(*)::int AS total_count, COALESCE(SUM(valor), 0)::numeric AS total_valor
        FROM base
      ),
      page AS (
        SELECT numero, fornecedor, previsao, valor,
               row_number() OVER (ORDER BY ordem_prev NULLS LAST, ordem) AS seq
        FROM base
        ORDER BY ordem_prev NULLS LAST, ordem
        LIMIT v_limit OFFSET v_offset
      )
      SELECT jsonb_build_object(
        'rows', COALESCE((SELECT jsonb_agg((to_jsonb(page) - 'seq') ORDER BY page.seq) FROM page), '[]'::jsonb),
        'resumo', jsonb_build_object(
          'total_count', (SELECT total_count FROM agg),
          'total_valor', ROUND((SELECT total_valor FROM agg), 2)
        )
      )
    );

  WHEN 'divergencias' THEN
    RETURN (
      WITH base AS (
        SELECT
          p.numero AS pedido,
          COALESCE(sk.codigo || ' · ', '') || pi.descricao AS item,
          pi.quantidade AS qtd_pedido,
          ri.divergencia_quantidade AS divergencia,
          to_char(r.created_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY') AS data,
          r.created_at AS ordem,
          ri.divergencia_quantidade AS qtd_div
        FROM public.com_recebimento_itens ri
        JOIN public.com_recebimentos r ON r.id = ri.recebimento_id AND r.empresa_id = ri.empresa_id
        JOIN public.com_pedido_itens pi ON pi.id = ri.pedido_item_id AND pi.empresa_id = ri.empresa_id
        JOIN public.com_pedidos p ON p.id = pi.pedido_id AND p.empresa_id = ri.empresa_id
        LEFT JOIN public.cad_skus sk ON sk.id = pi.sku_id AND sk.empresa_id = ri.empresa_id
        WHERE ri.empresa_id = p_empresa_id
          AND COALESCE(ri.divergencia_quantidade, 0) <> 0
          AND (v_inicio IS NULL OR (r.created_at AT TIME ZONE 'America/Sao_Paulo')::date >= v_inicio)
          AND (v_fim IS NULL OR (r.created_at AT TIME ZONE 'America/Sao_Paulo')::date <= v_fim)
          AND (v_sku IS NULL OR sk.codigo ILIKE '%' || v_sku || '%')
      ),
      agg AS (
        SELECT
          count(*)::int AS total_count,
          count(*) FILTER (WHERE qtd_div < 0)::int AS faltas,
          count(*) FILTER (WHERE qtd_div > 0)::int AS sobras
        FROM base
      ),
      page AS (
        SELECT pedido, item, qtd_pedido, divergencia, data,
               row_number() OVER (ORDER BY ordem DESC) AS seq
        FROM base
        ORDER BY ordem DESC
        LIMIT v_limit OFFSET v_offset
      )
      SELECT jsonb_build_object(
        'rows', COALESCE((SELECT jsonb_agg((to_jsonb(page) - 'seq') ORDER BY page.seq) FROM page), '[]'::jsonb),
        'resumo', jsonb_build_object(
          'total_count', (SELECT total_count FROM agg),
          'faltas', (SELECT faltas FROM agg),
          'sobras', (SELECT sobras FROM agg)
        )
      )
    );

  WHEN 'preco-divergente' THEN
    RETURN (
      WITH base AS (
        SELECT
          n.numero || ' / ' || n.serie AS nota,
          p.numero AS pedido,
          COALESCE(sk.codigo || ' · ', '') || i.descricao AS item,
          COALESCE(i.preco_pedido, 0) AS preco_pedido,
          i.preco_unitario AS preco_nota,
          (i.preco_unitario - COALESCE(i.preco_pedido, 0)) AS diferenca,
          n.data_emissao AS ordem
        FROM public.com_nota_itens i
        JOIN public.com_notas n ON n.id = i.nota_id AND n.empresa_id = i.empresa_id
        JOIN public.com_pedidos p ON p.id = n.pedido_id AND p.empresa_id = i.empresa_id
        LEFT JOIN public.cad_skus sk ON sk.id = i.sku_id AND sk.empresa_id = i.empresa_id
        WHERE i.empresa_id = p_empresa_id
          AND i.aviso_preco
          AND n.status <> 'cancelada'
          AND (v_inicio IS NULL OR n.data_emissao >= v_inicio)
          AND (v_fim IS NULL OR n.data_emissao <= v_fim)
          AND (v_sku IS NULL OR sk.codigo ILIKE '%' || v_sku || '%')
      ),
      agg AS (
        SELECT count(*)::int AS total_count
        FROM base
      ),
      page AS (
        SELECT nota, pedido, item, preco_pedido, preco_nota, diferenca,
               row_number() OVER (ORDER BY ordem DESC, nota) AS seq
        FROM base
        ORDER BY ordem DESC, nota
        LIMIT v_limit OFFSET v_offset
      )
      SELECT jsonb_build_object(
        'rows', COALESCE((SELECT jsonb_agg((to_jsonb(page) - 'seq') ORDER BY page.seq) FROM page), '[]'::jsonb),
        'resumo', jsonb_build_object('total_count', (SELECT total_count FROM agg))
      )
    );

  WHEN 'devolucoes' THEN
    RETURN (
      WITH base AS (
        SELECT
          d.numero,
          to_char(d.created_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY') AS data,
          f.nome AS fornecedor,
          COALESCE(sk.codigo || ' · ', '') || i.descricao AS item,
          i.quantidade,
          CASE i.motivo
            WHEN 'trocado' THEN 'SKU trocado'
            WHEN 'avaria' THEN 'Avaria'
            WHEN 'outro' THEN 'Outro'
            ELSE i.motivo
          END AS motivo,
          CASE d.status
            WHEN 'rascunho' THEN 'Rascunho'
            WHEN 'confirmada' THEN 'Confirmada'
            WHEN 'cancelada' THEN 'Cancelada'
            ELSE d.status
          END AS status,
          d.created_at AS ordem
        FROM public.com_devolucao_itens i
        JOIN public.com_devolucoes d ON d.id = i.devolucao_id AND d.empresa_id = i.empresa_id
        JOIN public.crm_leads f ON f.id = d.fornecedor_id AND f.empresa_id = d.empresa_id
        LEFT JOIN public.cad_skus sk ON sk.id = i.sku_id AND sk.empresa_id = i.empresa_id
        WHERE i.empresa_id = p_empresa_id
          AND (v_status IS NULL OR d.status = v_status)
          AND (v_inicio IS NULL OR (d.created_at AT TIME ZONE 'America/Sao_Paulo')::date >= v_inicio)
          AND (v_fim IS NULL OR (d.created_at AT TIME ZONE 'America/Sao_Paulo')::date <= v_fim)
      ),
      agg AS (
        SELECT count(*)::int AS total_count, COALESCE(SUM(quantidade), 0)::numeric AS total_quantidade
        FROM base
      ),
      page AS (
        SELECT numero, data, fornecedor, item, quantidade, motivo, status,
               row_number() OVER (ORDER BY ordem DESC, numero) AS seq
        FROM base
        ORDER BY ordem DESC, numero
        LIMIT v_limit OFFSET v_offset
      )
      SELECT jsonb_build_object(
        'rows', COALESCE((SELECT jsonb_agg((to_jsonb(page) - 'seq') ORDER BY page.seq) FROM page), '[]'::jsonb),
        'resumo', jsonb_build_object(
          'total_count', (SELECT total_count FROM agg),
          'total_quantidade', (SELECT total_quantidade FROM agg)
        )
      )
    );

  WHEN 'custo-ultima-compra' THEN
    RETURN (
      WITH base AS (
        SELECT
          sk.codigo AS sku,
          sk.nome,
          c.valor,
          COALESCE(n.numero || ' / ' || n.serie, '') AS nota,
          to_char(c.atualizado_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY') AS atualizado,
          c.atualizado_em AS ordem
        FROM public.com_sku_custo_ultima c
        JOIN public.cad_skus sk ON sk.id = c.sku_id AND sk.empresa_id = c.empresa_id
        LEFT JOIN public.com_notas n ON n.id = c.nota_id AND n.empresa_id = c.empresa_id
        WHERE c.empresa_id = p_empresa_id
          AND (v_sku IS NULL OR sk.codigo ILIKE '%' || v_sku || '%')
      ),
      agg AS (
        SELECT count(*)::int AS total_count
        FROM base
      ),
      page AS (
        SELECT sku, nome, valor, nota, atualizado,
               row_number() OVER (ORDER BY ordem DESC, sku) AS seq
        FROM base
        ORDER BY ordem DESC, sku
        LIMIT v_limit OFFSET v_offset
      )
      SELECT jsonb_build_object(
        'rows', COALESCE((SELECT jsonb_agg((to_jsonb(page) - 'seq') ORDER BY page.seq) FROM page), '[]'::jsonb),
        'resumo', jsonb_build_object('total_count', (SELECT total_count FROM agg))
      )
    );

  WHEN 'pre-titulos-parados' THEN
    RETURN (
      WITH base AS (
        SELECT
          t.numero,
          f.nome AS fornecedor,
          n.numero || ' / ' || n.serie AS nota,
          t.valor,
          COALESCE(to_char(t.vencimento, 'DD/MM/YYYY'), '') AS vencimento,
          ((now() AT TIME ZONE 'America/Sao_Paulo')::date - (t.created_at AT TIME ZONE 'America/Sao_Paulo')::date) AS dias,
          t.created_at AS ordem
        FROM public.com_pre_titulos t
        JOIN public.crm_leads f ON f.id = t.fornecedor_id AND f.empresa_id = t.empresa_id
        JOIN public.com_notas n ON n.id = t.nota_id AND n.empresa_id = t.empresa_id
        WHERE t.empresa_id = p_empresa_id
          AND t.status = 'aguardando_ap'
      ),
      agg AS (
        SELECT count(*)::int AS total_count, COALESCE(SUM(valor), 0)::numeric AS total_valor
        FROM base
      ),
      page AS (
        SELECT numero, fornecedor, nota, valor, vencimento, dias,
               row_number() OVER (ORDER BY ordem) AS seq
        FROM base
        ORDER BY ordem
        LIMIT v_limit OFFSET v_offset
      )
      SELECT jsonb_build_object(
        'rows', COALESCE((SELECT jsonb_agg((to_jsonb(page) - 'seq') ORDER BY page.seq) FROM page), '[]'::jsonb),
        'resumo', jsonb_build_object(
          'total_count', (SELECT total_count FROM agg),
          'total_valor', ROUND((SELECT total_valor FROM agg), 2)
        )
      )
    );

  WHEN 'onde-esta-serie' THEN
    RETURN (
      WITH base AS (
        SELECT
          sk.codigo AS sku,
          sk.nome,
          s.numero,
          CASE s.situacao
            WHEN 'em_estoque' THEN 'Em estoque'
            WHEN 'em_terceiro' THEN 'Em terceiro'
            WHEN 'baixada' THEN 'Baixada'
            ELSE s.situacao
          END AS situacao,
          CASE
            WHEN s.situacao = 'em_estoque' AND loc.id IS NOT NULL THEN loc.codigo || ' · ' || loc.nome
            WHEN s.situacao = 'em_terceiro' THEN COALESCE(pe.nome, '')
            ELSE ''
          END AS onde,
          s.numero AS ordem
        FROM public.est_series s
        JOIN public.cad_skus sk ON sk.id = s.sku_id AND sk.empresa_id = s.empresa_id
        LEFT JOIN public.cad_locais_estoque loc ON loc.id = s.local_id AND loc.empresa_id = s.empresa_id
        LEFT JOIN public.crm_leads pe ON pe.id = s.pessoa_id AND pe.empresa_id = s.empresa_id
        WHERE s.empresa_id = p_empresa_id
          AND (
            v_situacao = 'todos'
            OR (v_situacao = 'em_uso' AND s.situacao <> 'baixada')
            OR s.situacao = v_situacao
          )
          AND (v_sku IS NULL OR sk.codigo ILIKE '%' || v_sku || '%')
      ),
      agg AS (
        SELECT count(*)::int AS total_count FROM base
      ),
      page AS (
        SELECT sku, nome, numero, situacao, onde
        FROM base
        ORDER BY sku, ordem
        LIMIT v_limit OFFSET v_offset
      )
      SELECT jsonb_build_object(
        'rows', COALESCE((SELECT jsonb_agg(to_jsonb(page) ORDER BY page.sku, page.numero) FROM page), '[]'::jsonb),
        'resumo', jsonb_build_object('total_count', (SELECT total_count FROM agg))
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

COMMENT ON FUNCTION public.com_rpc_relatorio(uuid, text, jsonb) IS
  'Relatórios de compras, só leitura. Filtro, agregação e página no Postgres.';

REVOKE ALL ON FUNCTION public.com_rpc_relatorio(uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.com_rpc_relatorio(uuid, text, jsonb) TO authenticated, service_role;
