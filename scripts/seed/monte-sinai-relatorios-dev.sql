-- =============================================================================
-- Seed DEV-only: Monte Sinai Atacado — popular dados para validar relatórios
-- Empresa: 415854c0-84a4-489f-a357-2cc0142b6b65
-- Marcador: documento/sistema_origem/observacao/metadata = seed_relatorios_ms
-- NÃO executar em produção.
-- Idempotente: reexecutar não duplica movimentos/reqs/threads marcados.
-- =============================================================================

DO $$
DECLARE
  v_empresa uuid := '415854c0-84a4-489f-a357-2cc0142b6b65';
  v_nome text;
BEGIN
  SELECT nome INTO v_nome FROM public.empresas WHERE id = v_empresa;
  IF v_nome IS NULL OR lower(v_nome) NOT LIKE '%monte%sinai%' THEN
    RAISE EXCEPTION 'SEED_ABORT: empresa % não é Monte Sinai (encontrado: %)', v_empresa, v_nome;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- A1–A4: parâmetros de SKU (custo, min/max, ponto)
-- -----------------------------------------------------------------------------
UPDATE public.cad_skus
SET preco_custo = 8.50,
    updated_at = now()
WHERE empresa_id = '415854c0-84a4-489f-a357-2cc0142b6b65'
  AND id = '2afbfb45-7c31-475c-8e86-0e5f859d5df0'
  AND COALESCE(preco_custo, 0) <= 0;

-- Críticos: mínimo acima saldo atual (top ALM com saldo alto → min acima qty)
WITH ranked AS (
  SELECT s.id AS sku_id, sal.quantidade,
         ROW_NUMBER() OVER (ORDER BY sal.quantidade DESC) AS rn
  FROM public.est_saldos sal
  JOIN public.cad_skus s ON s.id = sal.sku_id
  WHERE sal.empresa_id = '415854c0-84a4-489f-a357-2cc0142b6b65'
    AND sal.local_id = '2b16eb1e-38c8-40d9-81d1-f2122980aea4'
    AND sal.quantidade > 0
)
UPDATE public.cad_skus sk
SET estoque_minimo = GREATEST(ROUND(r.quantidade * 1.15, 0), r.quantidade + 20),
    ponto_reposicao = GREATEST(ROUND(r.quantidade * 1.05, 0), r.quantidade + 10),
    updated_at = now()
FROM ranked r
WHERE sk.id = r.sku_id
  AND r.rn BETWEEN 1 AND 10;

-- Excesso: máximo bem abaixo do saldo em 5 SKUs com alto estoque
WITH ranked AS (
  SELECT s.id AS sku_id, sal.quantidade,
         ROW_NUMBER() OVER (ORDER BY sal.quantidade DESC) AS rn
  FROM public.est_saldos sal
  JOIN public.cad_skus s ON s.id = sal.sku_id
  WHERE sal.empresa_id = '415854c0-84a4-489f-a357-2cc0142b6b65'
    AND sal.local_id = '2b16eb1e-38c8-40d9-81d1-f2122980aea4'
    AND sal.quantidade > 100
)
UPDATE public.cad_skus sk
SET estoque_maximo = GREATEST(ROUND(r.quantidade * 0.25, 0), 50),
    updated_at = now()
FROM ranked r
WHERE sk.id = r.sku_id
  AND r.rn BETWEEN 1 AND 5;

-- -----------------------------------------------------------------------------
-- A5–A7: movimentos via Regra de Ouro (RPC) + backdate
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_empresa uuid := '415854c0-84a4-489f-a357-2cc0142b6b65';
  v_alm uuid := '2b16eb1e-38c8-40d9-81d1-f2122980aea4';
  v_branco uuid := 'f8c4edc3-eb55-4aa7-a372-5671e6ca9460';
  v_user uuid := 'ccaa213a-f85d-4df7-aa79-79cefa80edb4'; -- admin MS
  v_exist int;
  r record;
  i int;
  v_res jsonb;
  v_sku uuid;
  v_local uuid;
  v_qtd numeric;
  v_doc text;
  v_skus uuid[];
BEGIN
  SELECT count(*) INTO v_exist
  FROM public.est_movimentos
  WHERE empresa_id = v_empresa
    AND documento LIKE 'SEED_RELATORIOS_MS%';

  IF v_exist > 0 THEN
    RAISE NOTICE 'SEED movimentos já existem (% linhas) — pulando A5–A7', v_exist;
    RETURN;
  END IF;

  SELECT array_agg(sku_id ORDER BY quantidade DESC)
  INTO v_skus
  FROM (
    SELECT sal.sku_id, sal.quantidade
    FROM public.est_saldos sal
    WHERE sal.empresa_id = v_empresa
      AND sal.local_id = v_alm
      AND sal.quantidade >= 50
    ORDER BY sal.quantidade DESC
    LIMIT 20
  ) t;

  -- A5: entradas em BRANCO + ALM (18 linhas)
  FOR i IN 1..18 LOOP
    v_sku := v_skus[1 + ((i - 1) % array_length(v_skus, 1))];
    v_local := CASE WHEN i % 2 = 0 THEN v_branco ELSE v_alm END;
    v_qtd := 20 + (i * 3);
    v_doc := 'SEED_RELATORIOS_MS_ENT_' || lpad(i::text, 2, '0');
    v_res := public.est_registrar_movimento_atomico(
      p_empresa_id := v_empresa,
      p_tipo := 'entrada',
      p_sku_id := v_sku,
      p_local_id := v_local,
      p_quantidade := v_qtd,
      p_documento := v_doc,
      p_origem := 'lote_tela',
      p_usuario_id := v_user,
      p_motivo := 'Seed relatórios — entrada'
    );
    IF COALESCE((v_res->>'ok')::boolean, false) IS DISTINCT FROM true
       AND COALESCE(v_res->>'sucesso', '') NOT IN ('true', 't')
       AND v_res->>'movimento_id' IS NULL
       AND v_res->>'id' IS NULL THEN
      -- aceita vários formatos de retorno; falha só se exception
      NULL;
    END IF;
  END LOOP;

  -- A6: saídas retirada espalhadas (50 movs)
  FOR i IN 1..50 LOOP
    v_sku := v_skus[1 + ((i - 1) % array_length(v_skus, 1))];
    v_qtd := 2 + (i % 8);
    v_doc := 'SEED_RELATORIOS_MS_SAI_' || lpad(i::text, 2, '0');
    PERFORM public.est_registrar_movimento_atomico(
      p_empresa_id := v_empresa,
      p_tipo := 'saida',
      p_sku_id := v_sku,
      p_local_id := v_alm,
      p_quantidade := v_qtd,
      p_documento := v_doc,
      p_origem := 'retirada',
      p_usuario_id := v_user,
      p_motivo := 'Seed relatórios — saída retirada',
      p_permitir_saldo_negativo := false
    );
  END LOOP;

  -- A7: ajustes +/− (12)
  FOR i IN 1..12 LOOP
    v_sku := v_skus[1 + ((i - 1) % array_length(v_skus, 1))];
    v_qtd := 1 + (i % 5);
    v_doc := 'SEED_RELATORIOS_MS_AJU_' || lpad(i::text, 2, '0');
    PERFORM public.est_registrar_movimento_atomico(
      p_empresa_id := v_empresa,
      p_tipo := 'ajuste',
      p_sku_id := v_sku,
      p_local_id := v_alm,
      p_quantidade := v_qtd,
      p_documento := v_doc,
      p_origem := 'ajuste',
      p_ajuste_sinal := CASE WHEN i % 2 = 0 THEN 'negativo' ELSE 'positivo' END,
      p_motivo_codigo := CASE WHEN i % 2 = 0 THEN 'quebra' ELSE 'inventario' END,
      p_motivo := 'Seed relatórios — ajuste',
      p_usuario_id := v_user
    );
  END LOOP;

  -- Backdate movimento_em (14–30 dias / horários variados)
  UPDATE public.est_movimentos m
  SET movimento_em = now() - ((10 + (abs(hashtext(m.documento)) % 20)) || ' days')::interval
                     - ((abs(hashtext(m.documento || 'h')) % 14) || ' hours')::interval
                     - ((abs(hashtext(m.documento || 'm')) % 50) || ' minutes')::interval,
      created_at = now() - ((10 + (abs(hashtext(m.documento)) % 20)) || ' days')::interval
  WHERE m.empresa_id = v_empresa
    AND m.documento LIKE 'SEED_RELATORIOS_MS%';

  RAISE NOTICE 'SEED movimentos criados e backdatados';
END $$;

-- -----------------------------------------------------------------------------
-- A8: requisições ciclo (12) + atendimento parcial/total via RPC saída
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_empresa uuid := '415854c0-84a4-489f-a357-2cc0142b6b65';
  v_alm uuid := '2b16eb1e-38c8-40d9-81d1-f2122980aea4';
  v_user uuid := 'ccaa213a-f85d-4df7-aa79-79cefa80edb4';
  v_aprov uuid := '33979087-5fb3-4a4b-bfc4-5da108ecdbd5'; -- gerente.almox
  v_pessoa uuid := '194eab5a-d24c-4187-9b14-e3967e0ae4d7'; -- Ambev
  v_exist int;
  i int;
  v_req_id uuid;
  v_sku uuid;
  v_qtd numeric;
  v_status text;
  v_atendida numeric;
  v_skus uuid[];
  v_item_id uuid;
  v_codigo text;
BEGIN
  SELECT count(*) INTO v_exist
  FROM public.est_requisicoes
  WHERE empresa_id = v_empresa
    AND sistema_origem = 'seed_relatorios_ms';

  IF v_exist > 0 THEN
    RAISE NOTICE 'SEED requisicoes já existem (%) — pulando A8', v_exist;
    RETURN;
  END IF;

  SELECT array_agg(sku_id)
  INTO v_skus
  FROM (
    SELECT sal.sku_id
    FROM public.est_saldos sal
    WHERE sal.empresa_id = v_empresa AND sal.local_id = v_alm AND sal.quantidade >= 30
    ORDER BY sal.quantidade DESC
    LIMIT 12
  ) t;

  FOR i IN 1..12 LOOP
    v_codigo := 'SEED_REQ_' || lpad(i::text, 2, '0');
    v_sku := v_skus[1 + ((i - 1) % array_length(v_skus, 1))];
    v_qtd := 10 + i;

    -- mix status: 2 rascunho, 2 pendente, resto aprovada → atendida
    IF i <= 2 THEN
      v_status := 'rascunho';
    ELSIF i <= 4 THEN
      v_status := 'pendente_aprovacao';
    ELSIF i <= 8 THEN
      v_status := 'aprovada';
    ELSIF i <= 10 THEN
      v_status := 'atendida_parcial';
    ELSE
      v_status := 'atendida_total';
    END IF;

    INSERT INTO public.est_requisicoes (
      empresa_id, numero, requisitante_pessoa_id, solicitante_usuario_id,
      status, origem, observacao, valor_estimado,
      aprovador_usuario_id, aprovado_em, aprovacao_resultado,
      codigo_origem, sistema_origem, requisitante_nome_origem,
      created_at, updated_at
    ) VALUES (
      v_empresa,
      'REQ-SEED-' || lpad(i::text, 3, '0'),
      v_pessoa,
      v_user,
      v_status,
      'manual',
      'seed_relatorios_ms',
      v_qtd * 5,
      CASE WHEN v_status IN ('rascunho', 'pendente_aprovacao') THEN NULL ELSE v_aprov END,
      CASE WHEN v_status IN ('rascunho', 'pendente_aprovacao') THEN NULL
           ELSE now() - ((5 + i) || ' days')::interval END,
      CASE WHEN v_status IN ('rascunho', 'pendente_aprovacao') THEN NULL ELSE 'aprovada' END,
      v_codigo,
      'seed_relatorios_ms',
      'Seed Relatórios MS',
      now() - ((8 + i) || ' days')::interval,
      now() - ((3 + i) || ' days')::interval
    )
    RETURNING id INTO v_req_id;

    IF v_status = 'atendida_total' THEN
      v_atendida := v_qtd;
    ELSIF v_status = 'atendida_parcial' THEN
      v_atendida := GREATEST(1, floor(v_qtd / 2));
    ELSIF v_status = 'aprovada' AND i IN (5, 6) THEN
      -- aprova e atende parcial via RPC abaixo
      v_atendida := 0;
    ELSE
      v_atendida := 0;
    END IF;

    INSERT INTO public.est_requisicao_itens (
      empresa_id, requisicao_id, sku_id,
      quantidade_pedida, quantidade_atendida, quantidade_pendente,
      local_id, status_item, created_at, updated_at
    ) VALUES (
      v_empresa, v_req_id, v_sku,
      v_qtd,
      v_atendida,
      GREATEST(v_qtd - v_atendida, 0),
      v_alm,
      CASE
        WHEN v_atendida >= v_qtd THEN 'atendido'
        WHEN v_atendida > 0 THEN 'parcial'
        ELSE 'pendente'
      END,
      now() - ((8 + i) || ' days')::interval,
      now()
    )
    RETURNING id INTO v_item_id;

    -- Atende via RPC (aprovada 5–6 e as já marcadas parcial/total sem cardex)
    IF v_status IN ('aprovada', 'atendida_parcial', 'atendida_total') AND i >= 5 THEN
      IF v_atendida = 0 THEN
        v_atendida := CASE WHEN i <= 8 THEN GREATEST(1, floor(v_qtd * 0.6)) ELSE v_qtd END;
      END IF;
      BEGIN
        PERFORM public.est_registrar_movimento_atomico(
          p_empresa_id := v_empresa,
          p_tipo := 'saida',
          p_sku_id := v_sku,
          p_local_id := v_alm,
          p_quantidade := v_atendida,
          p_documento := 'SEED_RELATORIOS_MS_REQ_' || lpad(i::text, 2, '0'),
          p_origem := 'requisicao',
          p_requisicao_id := v_req_id,
          p_usuario_id := v_user,
          p_motivo := 'Seed atendimento requisição'
        );
        UPDATE public.est_requisicao_itens
        SET quantidade_atendida = v_atendida,
            quantidade_pendente = GREATEST(quantidade_pedida - v_atendida, 0),
            status_item = CASE WHEN v_atendida >= quantidade_pedida THEN 'atendido' ELSE 'parcial' END,
            updated_at = now()
        WHERE id = v_item_id;
        UPDATE public.est_requisicoes
        SET status = CASE WHEN v_atendida >= v_qtd THEN 'atendida_total' ELSE 'atendida_parcial' END,
            updated_at = now()
        WHERE id = v_req_id AND status = 'aprovada';
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'REQ % atendimento falhou: %', v_codigo, SQLERRM;
      END;
    END IF;
  END LOOP;

  UPDATE public.est_movimentos
  SET movimento_em = now() - ((4 + (abs(hashtext(documento)) % 12)) || ' days')::interval
  WHERE empresa_id = v_empresa
    AND documento LIKE 'SEED_RELATORIOS_MS_REQ_%';

  RAISE NOTICE 'SEED requisicoes criadas';
END $$;

-- -----------------------------------------------------------------------------
-- A9–A10: terceiros + remessas (6 lotes) envio / retorno / baixa
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_empresa uuid := '415854c0-84a4-489f-a357-2cc0142b6b65';
  v_alm uuid := '2b16eb1e-38c8-40d9-81d1-f2122980aea4';
  v_user uuid := 'ccaa213a-f85d-4df7-aa79-79cefa80edb4';
  v_exist int;
  i int;
  v_rem_id uuid;
  v_item_id uuid;
  v_sku uuid;
  v_pessoa uuid;
  v_qtd numeric;
  v_ret numeric;
  v_bai numeric;
  v_skus uuid[];
  v_pessoas uuid[] := ARRAY[
    'eb406bc8-2e6e-4fc6-aa27-4f57d65366ac'::uuid, -- BETA
    'b0aa10c5-0c18-49b2-82d7-8578964960ee'::uuid, -- Gama
    '194eab5a-d24c-4187-9b14-e3967e0ae4d7'::uuid  -- Ambev
  ];
BEGIN
  -- A10: marcar papeis parceiro (destinatários de remessa)
  UPDATE public.crm_leads
  SET papeis = CASE
        WHEN papeis IS NULL THEN ARRAY['parceiro']::text[]
        WHEN NOT ('parceiro' = ANY (papeis)) THEN papeis || ARRAY['parceiro']::text[]
        ELSE papeis
      END,
      updated_at = now()
  WHERE empresa_id = v_empresa
    AND id = ANY (v_pessoas);

  SELECT count(*) INTO v_exist
  FROM public.est_remessa_lotes
  WHERE empresa_id = v_empresa
    AND observacao = 'seed_relatorios_ms';

  IF v_exist > 0 THEN
    RAISE NOTICE 'SEED remessas já existem (%) — pulando A9', v_exist;
    RETURN;
  END IF;

  SELECT array_agg(sku_id)
  INTO v_skus
  FROM (
    SELECT sal.sku_id
    FROM public.est_saldos sal
    WHERE sal.empresa_id = v_empresa AND sal.local_id = v_alm AND sal.quantidade >= 40
    ORDER BY sal.quantidade DESC
    LIMIT 8
  ) t;

  FOR i IN 1..6 LOOP
    v_pessoa := v_pessoas[1 + ((i - 1) % 3)];
    v_sku := v_skus[1 + ((i - 1) % array_length(v_skus, 1))];
    v_qtd := 12 + i * 2;

    INSERT INTO public.est_remessa_lotes (
      empresa_id, numero, destinatario_pessoa_id, motivo_codigo, motivo_texto,
      local_origem_id, documento, previsao_retorno_em, status, usuario_id,
      enviado_em, created_at, updated_at, observacao
    ) VALUES (
      v_empresa,
      'REM-SEED-' || lpad(i::text, 3, '0'),
      v_pessoa,
      'remessa_locacao',
      'Seed remessa relatórios',
      v_alm,
      'SEED_RELATORIOS_MS_REM_' || lpad(i::text, 2, '0'),
      (CURRENT_DATE + (10 + i)),
      'aberta',
      v_user,
      now() - ((6 + i) || ' days')::interval,
      now() - ((6 + i) || ' days')::interval,
      now(),
      'seed_relatorios_ms'
    )
    RETURNING id INTO v_rem_id;

    INSERT INTO public.est_remessa_itens (
      empresa_id, remessa_id, sku_id, quantidade_enviada, quantidade_retornada,
      quantidade_baixada, status_item, local_origem_id, observacao, created_at, updated_at
    ) VALUES (
      v_empresa, v_rem_id, v_sku, v_qtd, 0, 0, 'em_poder', v_alm,
      'seed_relatorios_ms', now(), now()
    )
    RETURNING id INTO v_item_id;

    PERFORM public.est_registrar_movimento_atomico(
      p_empresa_id := v_empresa,
      p_tipo := 'remessa_saida',
      p_sku_id := v_sku,
      p_local_id := v_alm,
      p_quantidade := v_qtd,
      p_documento := 'SEED_RELATORIOS_MS_REM_' || lpad(i::text, 2, '0'),
      p_pessoa_id := v_pessoa,
      p_origem := 'remessa',
      p_lote_remessa_id := v_rem_id,
      p_remessa_item_id := v_item_id,
      p_motivo_codigo := 'remessa_locacao',
      p_motivo := 'Seed remessa saída',
      p_usuario_id := v_user
    );

    -- 1–2 abertas; 3–4 parcial (retorno); 5–6 fechadas (retorno+baixa)
    IF i BETWEEN 3 AND 6 THEN
      v_ret := CASE WHEN i <= 4 THEN GREATEST(1, floor(v_qtd / 3)) ELSE GREATEST(1, floor(v_qtd / 2)) END;
      PERFORM public.est_registrar_movimento_atomico(
        p_empresa_id := v_empresa,
        p_tipo := 'remessa_retorno',
        p_sku_id := v_sku,
        p_local_id := v_alm,
        p_quantidade := v_ret,
        p_documento := 'SEED_RELATORIOS_MS_RET_' || lpad(i::text, 2, '0'),
        p_pessoa_id := v_pessoa,
        p_origem := 'remessa',
        p_lote_remessa_id := v_rem_id,
        p_remessa_item_id := v_item_id,
        p_motivo := 'Seed remessa retorno',
        p_usuario_id := v_user,
        p_quantidade_poder := v_ret
      );
      UPDATE public.est_remessa_itens
      SET quantidade_retornada = v_ret,
          status_item = 'parcial',
          updated_at = now()
      WHERE id = v_item_id;
      UPDATE public.est_remessa_lotes SET status = 'parcial', updated_at = now() WHERE id = v_rem_id;
    END IF;

    IF i >= 5 THEN
      v_bai := v_qtd - COALESCE(v_ret, 0);
      IF v_bai > 0 THEN
        PERFORM public.est_registrar_movimento_atomico(
          p_empresa_id := v_empresa,
          p_tipo := 'remessa_baixa',
          p_sku_id := v_sku,
          p_local_id := v_alm,
          p_quantidade := v_bai,
          p_documento := 'SEED_RELATORIOS_MS_BAI_' || lpad(i::text, 2, '0'),
          p_pessoa_id := v_pessoa,
          p_origem := 'remessa',
          p_lote_remessa_id := v_rem_id,
          p_remessa_item_id := v_item_id,
          p_motivo := 'Seed remessa baixa',
          p_usuario_id := v_user
        );
        UPDATE public.est_remessa_itens
        SET quantidade_baixada = v_bai,
            status_item = 'retornado',
            updated_at = now()
        WHERE id = v_item_id;
        UPDATE public.est_remessa_lotes SET status = 'fechada', updated_at = now() WHERE id = v_rem_id;
      END IF;
    END IF;
  END LOOP;

  UPDATE public.est_movimentos
  SET movimento_em = now() - ((3 + (abs(hashtext(documento)) % 10)) || ' days')::interval
  WHERE empresa_id = v_empresa
    AND (documento LIKE 'SEED_RELATORIOS_MS_REM_%'
      OR documento LIKE 'SEED_RELATORIOS_MS_RET_%'
      OR documento LIKE 'SEED_RELATORIOS_MS_BAI_%');

  RAISE NOTICE 'SEED remessas criadas';
END $$;

-- -----------------------------------------------------------------------------
-- B) Workflow — probabilidade, fechamentos, history, atrasos, gargalos
-- -----------------------------------------------------------------------------

-- B1: probabilidade nas etapas dos funis
UPDATE public.pipeline_stages ps
SET probabilidade_fechamento = CASE
  WHEN ps.nome ILIKE '%prospec%' THEN 10
  WHEN ps.nome ILIKE '%qualif%' THEN 25
  WHEN ps.nome ILIKE '%negoci%' THEN 50
  WHEN ps.nome ILIKE '%não aprov%' OR ps.nome ILIKE '%nao aprov%' THEN 5
  WHEN ps.nome ILIKE '%aprovad%' THEN 75
  WHEN ps.nome ILIKE '%fechament%' OR ps.nome ILIKE '%fechado%' THEN 95
  WHEN ps.nome ILIKE '%gerar contrato%' THEN 40
  WHEN ps.nome ILIKE '%fatur%' THEN 70
  WHEN ps.nome ILIKE '%inadimpl%' THEN 20
  WHEN ps.nome ILIKE '%separa%' THEN 30
  WHEN ps.nome ILIKE '%entrega%' AND ps.nome NOT ILIKE '%entregue%' THEN 60
  WHEN ps.nome ILIKE '%entregue%' THEN 90
  WHEN ps.nome ILIKE '%retorn%' THEN 50
  WHEN ps.nome ILIKE '%recebid%' THEN 20
  WHEN ps.nome ILIKE '%atendiment%' THEN 45
  WHEN ps.nome ILIKE '%devolut%' THEN 80
  ELSE COALESCE(ps.probabilidade_fechamento, 35)
END
FROM public.pipelines p
WHERE ps.pipeline_id = p.id
  AND p.empresa_id = '415854c0-84a4-489f-a357-2cc0142b6b65';

-- B6: atribuir vendedores a cards abertos sem responsável
WITH alvo AS (
  SELECT c.id,
         (ARRAY[
           'ff15dd49-42ce-4d1d-bba0-8511c9d211fa'::uuid,
           '9f8b434d-2016-4189-b625-afe41f6dc7bf'::uuid,
           'f7298a05-e9fe-4559-b9c3-75285e6e2564'::uuid,
           '4aa020a5-d815-4d51-9147-e9d492205d36'::uuid
         ])[1 + ((ROW_NUMBER() OVER (ORDER BY c.created_at) - 1) % 4)] AS resp
  FROM public.crm_cards c
  WHERE c.empresa_id = '415854c0-84a4-489f-a357-2cc0142b6b65'
    AND COALESCE(c.finalizado, false) = false
    AND c.responsavel_id IS NULL
)
UPDATE public.crm_cards c
SET responsavel_id = a.resp,
    updated_at = now(),
    metadados = COALESCE(c.metadados, '{}'::jsonb) || jsonb_build_object('seed_relatorios_ms', true)
FROM alvo a
WHERE c.id = a.id;

-- B5: concentrar cards em NEGOCIAÇÃO e FECHAMENTO (gargalos)
WITH move AS (
  SELECT c.id,
         ROW_NUMBER() OVER (ORDER BY c.created_at) AS rn
  FROM public.crm_cards c
  WHERE c.empresa_id = '415854c0-84a4-489f-a357-2cc0142b6b65'
    AND c.pipeline_id = '9212b1e0-2786-4548-ad2f-35b2fc712d18'
    AND COALESCE(c.finalizado, false) = false
)
UPDATE public.crm_cards c
SET stage_id = CASE
      WHEN m.rn <= 8 THEN 'cd16c7c7-f630-4a9a-bed6-1c6947bd968d'::uuid
      WHEN m.rn <= 14 THEN 'b5f8582a-7c72-425b-ae20-46a74f4566b1'::uuid
      ELSE c.stage_id
    END,
    stage_entered_at = now() - ((m.rn) || ' days')::interval,
    updated_at = now(),
    metadados = COALESCE(c.metadados, '{}'::jsonb) || jsonb_build_object('seed_relatorios_ms', true)
FROM move m
WHERE c.id = m.id
  AND m.rn <= 14;

-- B4: cards atrasados
WITH atrasados AS (
  SELECT c.id,
         ROW_NUMBER() OVER (ORDER BY c.created_at) AS rn
  FROM public.crm_cards c
  WHERE c.empresa_id = '415854c0-84a4-489f-a357-2cc0142b6b65'
    AND COALESCE(c.finalizado, false) = false
)
UPDATE public.crm_cards c
SET data_prazo = CURRENT_DATE - ((3 + (a.rn % 10))::int),
    updated_at = now(),
    metadados = COALESCE(c.metadados, '{}'::jsonb) || jsonb_build_object('seed_relatorios_ms', true)
FROM atrasados a
WHERE c.id = a.id
  AND a.rn <= 12;

-- B2: fechar +20 cards no período recente
DO $wf$
DECLARE
  v_empresa uuid := '415854c0-84a4-489f-a357-2cc0142b6b65';
  v_pipe uuid := '9212b1e0-2786-4548-ad2f-35b2fc712d18';
  v_fech uuid := 'b5f8582a-7c72-425b-ae20-46a74f4566b1';
  r record;
  i int := 0;
  v_when timestamptz;
  v_vendors uuid[] := ARRAY[
    'ff15dd49-42ce-4d1d-bba0-8511c9d211fa'::uuid,
    '9f8b434d-2016-4189-b625-afe41f6dc7bf'::uuid,
    'f7298a05-e9fe-4559-b9c3-75285e6e2564'::uuid,
    '4aa020a5-d815-4d51-9147-e9d492205d36'::uuid
  ];
BEGIN
  FOR r IN
    SELECT c.id, c.stage_id, c.valor, c.responsavel_id
    FROM public.crm_cards c
    WHERE c.empresa_id = v_empresa
      AND c.pipeline_id = v_pipe
      AND COALESCE(c.finalizado, false) = false
      AND COALESCE((c.metadados->>'seed_closed')::boolean, false) IS NOT TRUE
    ORDER BY c.created_at
    LIMIT 20
  LOOP
    i := i + 1;
    v_when := now() - ((2 + (i % 25)) || ' days')::interval - ((i % 10) || ' hours')::interval;
    UPDATE public.crm_cards
    SET finalizado = true,
        finalizado_em = v_when,
        stage_id = v_fech,
        valor = COALESCE(NULLIF(valor, 0), 5000 + i * 1375),
        responsavel_id = COALESCE(responsavel_id, v_vendors[1 + ((i - 1) % 4)]),
        updated_at = v_when,
        metadados = COALESCE(metadados, '{}'::jsonb) || jsonb_build_object(
          'seed_relatorios_ms', true,
          'seed_closed', true
        ),
        observacao = CASE
          WHEN observacao IS NULL OR observacao = '' THEN 'seed_relatorios_ms'
          WHEN observacao LIKE '%seed_relatorios_ms%' THEN observacao
          ELSE observacao || ' | seed_relatorios_ms'
        END
    WHERE id = r.id;

    INSERT INTO public.crm_cards_history (
      card_id, usuario_id, acao, de_stage_id, para_stage_id,
      de_pipeline_id, para_pipeline_id, observacao, created_at, empresa_id
    ) VALUES (
      r.id,
      COALESCE(r.responsavel_id, v_vendors[1]),
      'STATUS_CHANGED',
      r.stage_id,
      v_fech,
      v_pipe,
      v_pipe,
      'seed_relatorios_ms:CARD_FINISHED',
      v_when,
      v_empresa
    );
  END LOOP;
END
$wf$;

-- B3: +80 STATUS_CHANGED com timestamps escalonados
DO $hist$
DECLARE
  v_empresa uuid := '415854c0-84a4-489f-a357-2cc0142b6b65';
  v_pipe uuid := '9212b1e0-2786-4548-ad2f-35b2fc712d18';
  v_stages uuid[] := ARRAY[
    '51107160-6030-42de-b25b-23cdcc5a70d0'::uuid,
    'e539d138-cd96-4a81-9791-0ae69a0b35a4'::uuid,
    'cd16c7c7-f630-4a9a-bed6-1c6947bd968d'::uuid,
    '39363b20-7452-4d1e-bdd5-b986d96137ed'::uuid,
    'b5f8582a-7c72-425b-ae20-46a74f4566b1'::uuid
  ];
  v_exist int;
  r record;
  i int := 0;
  from_s uuid;
  to_s uuid;
  v_when timestamptz;
  v_user uuid;
BEGIN
  SELECT count(*) INTO v_exist
  FROM public.crm_cards_history
  WHERE empresa_id = v_empresa
    AND observacao = 'seed_relatorios_ms:STATUS_CHANGED';

  IF v_exist >= 80 THEN
    RAISE NOTICE 'SEED history já existe (%) — pulando B3', v_exist;
    RETURN;
  END IF;

  FOR r IN
    SELECT c.id, c.responsavel_id
    FROM public.crm_cards c
    WHERE c.empresa_id = v_empresa
      AND c.pipeline_id = v_pipe
    ORDER BY c.created_at
    LIMIT 25
  LOOP
    FOR i IN 0..3 LOOP
      from_s := v_stages[1 + i];
      to_s := v_stages[2 + i];
      v_when := now() - (((i + 1) * 3 + (abs(hashtext(r.id::text)) % 15)) || ' days')::interval
                - (((i * 3) + 9) || ' hours')::interval;
      v_user := COALESCE(r.responsavel_id, 'ff15dd49-42ce-4d1d-bba0-8511c9d211fa'::uuid);
      INSERT INTO public.crm_cards_history (
        card_id, usuario_id, acao, de_stage_id, para_stage_id,
        de_pipeline_id, para_pipeline_id, observacao, created_at, empresa_id
      ) VALUES (
        r.id, v_user, 'STATUS_CHANGED', from_s, to_s,
        v_pipe, v_pipe, 'seed_relatorios_ms:STATUS_CHANGED', v_when, v_empresa
      );
    END LOOP;
  END LOOP;
END
$hist$;

-- -----------------------------------------------------------------------------
-- C) Omnichannel — threads, conversas, interações, handover, closed
-- -----------------------------------------------------------------------------
DO $omni$
DECLARE
  v_empresa uuid := '415854c0-84a4-489f-a357-2cc0142b6b65';
  v_wa uuid := '1651ed70-d255-4284-8fbd-66a51a7cfadc';
  v_sim uuid := '602b6f19-8d0b-4a52-9daa-23fc8c37b5ea';
  v_lead uuid := 'c430623e-e3e9-48ae-afc9-e44167a35209';
  v_user uuid := 'ff15dd49-42ce-4d1d-bba0-8511c9d211fa';
  v_exist int;
  i int;
  v_thread uuid;
  v_canal uuid;
  v_status text;
  v_opened timestamptz;
  v_ext text;
  j int;
  v_msg_at timestamptz;
  v_hour int;
  v_dow int;
BEGIN
  SELECT count(*) INTO v_exist
  FROM public.crm_chat_threads
  WHERE empresa_id = v_empresa
    AND external_id LIKE 'seed_ms_%';

  IF v_exist >= 40 THEN
    RAISE NOTICE 'SEED threads já existem (%) — pulando C', v_exist;
    RETURN;
  END IF;

  FOR i IN 1..40 LOOP
    v_canal := CASE WHEN i % 2 = 0 THEN v_sim ELSE v_wa END;
    v_ext := 'seed_ms_' || lpad(i::text, 3, '0');
    v_opened := now() - ((1 + (i % 28)) || ' days')::interval
                - (((i * 2) % 20) || ' hours')::interval;
    IF i <= 16 THEN
      v_status := 'ai';
    ELSIF i <= 28 THEN
      v_status := 'human';
    ELSE
      v_status := 'closed';
    END IF;

    v_thread := gen_random_uuid();

    INSERT INTO public.crm_chat_threads (
      id, empresa_id, canal_id, external_id, lead_id, status,
      created_at, updated_at, opened_at,
      handover_at, handover_reason, closed_at, resolved_at,
      message_count_inbound, message_count_outbound
    ) VALUES (
      v_thread, v_empresa, v_canal, v_ext, v_lead, v_status,
      v_opened, v_opened + interval '2 hours', v_opened,
      CASE WHEN v_status IN ('human', 'closed')
           THEN v_opened + interval '45 minutes' ELSE NULL END,
      CASE WHEN v_status IN ('human', 'closed') THEN 'seed_relatorios_ms' ELSE NULL END,
      CASE WHEN v_status = 'closed' THEN v_opened + interval '6 hours' ELSE NULL END,
      CASE WHEN v_status = 'closed' THEN v_opened + interval '6 hours' ELSE NULL END,
      0, 0
    );

    INSERT INTO public.crm_conversas (
      empresa_id, canal_id, lead_id, external_id, status,
      last_message, sessao_id, metadata, created_at, updated_at,
      atribuido_a_id
    ) VALUES (
      v_empresa, v_canal, v_lead, v_ext, v_status,
      'Seed omni relatórios', v_thread,
      jsonb_build_object('seed_relatorios_ms', true),
      v_opened, v_opened + interval '2 hours',
      CASE WHEN v_status = 'human' THEN v_user ELSE NULL END
    );

    FOR j IN 1..5 LOOP
      v_hour := (8 + ((i + j) % 12));
      v_dow := (i + j) % 7;
      v_msg_at := date_trunc('day', v_opened) + (v_dow || ' days')::interval
                  + (v_hour || ' hours')::interval
                  + ((j * 7) || ' minutes')::interval;
      IF v_msg_at > now() THEN
        v_msg_at := now() - ((j) || ' hours')::interval;
      END IF;

      INSERT INTO public.crm_interacoes (
        empresa_id, lead_id, contact_phone, contact_name, role, content,
        metadata, created_at, conversa_id, user_id
      ) VALUES (
        v_empresa, v_lead, '5511999' || lpad(i::text, 4, '0'),
        'Seed Contato ' || i,
        CASE WHEN j % 2 = 1 THEN 'user' ELSE 'assistant' END,
        CASE WHEN j % 2 = 1
          THEN 'Olá, preciso de ajuda (seed ' || i || '/' || j || ')'
          ELSE 'Claro! Em que posso ajudar? (seed)'
        END,
        jsonb_build_object('seed_relatorios_ms', true),
        v_msg_at,
        v_thread,
        CASE WHEN j % 2 = 0 AND v_status = 'human' THEN v_user ELSE NULL END
      );
    END LOOP;

    UPDATE public.crm_chat_threads t
    SET first_response_at = COALESCE(t.first_response_at, v_opened + interval '12 minutes'),
        first_response_role = COALESCE(t.first_response_role, 'assistant'),
        handover_at = CASE
          WHEN v_status IN ('human', 'closed') THEN COALESCE(t.handover_at, v_opened + interval '45 minutes')
          ELSE t.handover_at
        END,
        closed_at = CASE WHEN v_status = 'closed' THEN COALESCE(t.closed_at, v_opened + interval '6 hours') ELSE t.closed_at END,
        resolved_at = CASE WHEN v_status = 'closed' THEN COALESCE(t.resolved_at, v_opened + interval '6 hours') ELSE t.resolved_at END,
        updated_at = now()
    WHERE t.id = v_thread;
  END LOOP;

  RAISE NOTICE 'SEED omni threads/msgs criados';
END
$omni$;

-- -----------------------------------------------------------------------------
-- Verificação rápida pós-seed
-- -----------------------------------------------------------------------------
SELECT
  (SELECT count(*) FROM cad_skus WHERE empresa_id='415854c0-84a4-489f-a357-2cc0142b6b65' AND COALESCE(estoque_minimo,0)>0) AS skus_com_min,
  (SELECT count(*) FROM cad_skus WHERE empresa_id='415854c0-84a4-489f-a357-2cc0142b6b65' AND COALESCE(estoque_maximo,0)>0) AS skus_com_max,
  (SELECT count(*) FROM est_movimentos WHERE empresa_id='415854c0-84a4-489f-a357-2cc0142b6b65' AND documento LIKE 'SEED_RELATORIOS_MS%') AS movs_seed,
  (SELECT count(*) FROM est_requisicoes WHERE empresa_id='415854c0-84a4-489f-a357-2cc0142b6b65' AND sistema_origem='seed_relatorios_ms') AS reqs_seed,
  (SELECT count(*) FROM est_remessa_lotes WHERE empresa_id='415854c0-84a4-489f-a357-2cc0142b6b65' AND observacao='seed_relatorios_ms') AS remessas_seed,
  (SELECT count(*) FROM crm_cards WHERE empresa_id='415854c0-84a4-489f-a357-2cc0142b6b65' AND COALESCE(finalizado,false) AND finalizado_em > now() - interval '35 days') AS cards_fechados_periodo,
  (SELECT count(*) FROM crm_cards_history WHERE empresa_id='415854c0-84a4-489f-a357-2cc0142b6b65' AND observacao LIKE 'seed_relatorios_ms%') AS history_seed,
  (SELECT count(*) FROM crm_chat_threads WHERE empresa_id='415854c0-84a4-489f-a357-2cc0142b6b65' AND external_id LIKE 'seed_ms_%') AS threads_seed,
  (SELECT count(*) FROM crm_interacoes WHERE empresa_id='415854c0-84a4-489f-a357-2cc0142b6b65' AND metadata ? 'seed_relatorios_ms') AS msgs_seed;

