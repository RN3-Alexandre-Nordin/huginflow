-- =============================================================================
-- SCALE seed DEV — Monte Sinai — paginação + consistência + performance
-- Empresa: 415854c0-84a4-489f-a357-2cc0142b6b65
-- Marcador: SEED_MSX_* / seed_relatorios_ms_x / seed_msx_*
-- Complementa o seed base (seed_relatorios_ms). Idempotente.
-- NÃO executar em produção.
-- =============================================================================
-- Alvos (aditivos):
--   Entradas +40 | Saídas +250 | Ajustes +80
--   Reqs +70 | Remessas +54
--   Cards novos +120 (80 fechados + 40 abertos) | History +400
--   Threads +140 | Msgs ~700
--   Min em ~20 SKUs | Max em ~15 SKUs
-- =============================================================================

DO $$
DECLARE
  v_empresa uuid := '415854c0-84a4-489f-a357-2cc0142b6b65';
  v_nome text;
BEGIN
  SELECT nome INTO v_nome FROM public.empresas WHERE id = v_empresa;
  IF v_nome IS NULL OR lower(v_nome) NOT LIKE '%monte%sinai%' THEN
    RAISE EXCEPTION 'SEED_ABORT: empresa % nao e Monte Sinai (%)', v_empresa, v_nome;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- Params: expandir críticos / excesso (mais linhas nos relatórios)
-- -----------------------------------------------------------------------------
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
SET estoque_minimo = GREATEST(ROUND(r.quantidade * 1.12, 0), r.quantidade + 15),
    ponto_reposicao = GREATEST(ROUND(r.quantidade * 1.04, 0), r.quantidade + 8),
    updated_at = now()
FROM ranked r
WHERE sk.id = r.sku_id AND r.rn BETWEEN 1 AND 20;

WITH ranked AS (
  SELECT s.id AS sku_id, sal.quantidade,
         ROW_NUMBER() OVER (ORDER BY sal.quantidade DESC) AS rn
  FROM public.est_saldos sal
  JOIN public.cad_skus s ON s.id = sal.sku_id
  WHERE sal.empresa_id = '415854c0-84a4-489f-a357-2cc0142b6b65'
    AND sal.local_id = '2b16eb1e-38c8-40d9-81d1-f2122980aea4'
    AND sal.quantidade > 80
)
UPDATE public.cad_skus sk
SET estoque_maximo = GREATEST(ROUND(r.quantidade * 0.30, 0), 40),
    updated_at = now()
FROM ranked r
WHERE sk.id = r.sku_id AND r.rn BETWEEN 1 AND 15;

-- -----------------------------------------------------------------------------
-- Movimentos SCALE via RPC (qtds determinísticas: ent=10+i%5, sai=3, aj=2)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_empresa uuid := '415854c0-84a4-489f-a357-2cc0142b6b65';
  v_alm uuid := '2b16eb1e-38c8-40d9-81d1-f2122980aea4';
  v_branco uuid := 'f8c4edc3-eb55-4aa7-a372-5671e6ca9460';
  v_user uuid := 'ccaa213a-f85d-4df7-aa79-79cefa80edb4';
  v_exist int;
  i int;
  v_sku uuid;
  v_skus uuid[];
BEGIN
  SELECT count(*) INTO v_exist FROM public.est_movimentos
  WHERE empresa_id = v_empresa AND documento LIKE 'SEED_MSX_%';
  IF v_exist > 0 THEN
    RAISE NOTICE 'SCALE movs ja existem (%) — pulando', v_exist;
    RETURN;
  END IF;

  SELECT array_agg(sku_id ORDER BY quantidade DESC) INTO v_skus FROM (
    SELECT sal.sku_id, sal.quantidade FROM public.est_saldos sal
    WHERE sal.empresa_id = v_empresa AND sal.local_id = v_alm AND sal.quantidade >= 30
    ORDER BY sal.quantidade DESC LIMIT 30
  ) t;

  IF v_skus IS NULL OR array_length(v_skus, 1) < 5 THEN
    RAISE EXCEPTION 'SCALE_ABORT: poucos SKUs com saldo';
  END IF;

  -- Reforço de entradas antes das saídas (40)
  FOR i IN 1..40 LOOP
    v_sku := v_skus[1 + ((i - 1) % array_length(v_skus, 1))];
    PERFORM public.est_registrar_movimento_atomico(
      p_empresa_id := v_empresa, p_tipo := 'entrada', p_sku_id := v_sku,
      p_local_id := CASE WHEN i % 3 = 0 THEN v_branco ELSE v_alm END,
      p_quantidade := 15 + (i % 10),
      p_documento := 'SEED_MSX_ENT_' || lpad(i::text, 3, '0'),
      p_origem := 'lote_tela', p_usuario_id := v_user, p_motivo := 'Scale entrada');
  END LOOP;

  -- 250 saidas qtd=3 (total 750 unidades) — consumo/giro/DOH + paginação
  FOR i IN 1..250 LOOP
    v_sku := v_skus[1 + ((i - 1) % array_length(v_skus, 1))];
    BEGIN
      PERFORM public.est_registrar_movimento_atomico(
        p_empresa_id := v_empresa, p_tipo := 'saida', p_sku_id := v_sku, p_local_id := v_alm,
        p_quantidade := 3,
        p_documento := 'SEED_MSX_SAI_' || lpad(i::text, 3, '0'),
        p_origem := 'retirada', p_usuario_id := v_user, p_motivo := 'Scale saida',
        p_permitir_saldo_negativo := false);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Scale saida % skip: %', i, SQLERRM;
    END;
  END LOOP;

  -- 80 ajustes qtd=2 (40+/40-) — paginação ajustes-shrinkage
  FOR i IN 1..80 LOOP
    v_sku := v_skus[1 + ((i - 1) % array_length(v_skus, 1))];
    BEGIN
      PERFORM public.est_registrar_movimento_atomico(
        p_empresa_id := v_empresa, p_tipo := 'ajuste', p_sku_id := v_sku, p_local_id := v_alm,
        p_quantidade := 2,
        p_documento := 'SEED_MSX_AJU_' || lpad(i::text, 3, '0'),
        p_origem := 'ajuste',
        p_ajuste_sinal := CASE WHEN i % 2 = 0 THEN 'negativo' ELSE 'positivo' END,
        p_motivo_codigo := CASE WHEN i % 2 = 0 THEN 'quebra' ELSE 'inventario' END,
        p_motivo := 'Scale ajuste', p_usuario_id := v_user);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Scale ajuste % skip: %', i, SQLERRM;
    END;
  END LOOP;

  UPDATE public.est_movimentos m
  SET movimento_em = now()
        - ((1 + (abs(hashtext(m.documento)) % 29)) || ' days')::interval
        - ((abs(hashtext(m.documento || 'h')) % 20) || ' hours')::interval,
      created_at = now() - ((1 + (abs(hashtext(m.documento)) % 29)) || ' days')::interval
  WHERE m.empresa_id = v_empresa AND m.documento LIKE 'SEED_MSX_%';
END $$;

-- -----------------------------------------------------------------------------
-- Requisições +70 (paginação fill-rate / lead-time)
-- qtd_pedida = 10; atendimento 100% nas atendidas_total, 50% nas parciais
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_empresa uuid := '415854c0-84a4-489f-a357-2cc0142b6b65';
  v_alm uuid := '2b16eb1e-38c8-40d9-81d1-f2122980aea4';
  v_user uuid := 'ccaa213a-f85d-4df7-aa79-79cefa80edb4';
  v_aprov uuid := '33979087-5fb3-4a4b-bfc4-5da108ecdbd5';
  v_pessoa uuid := '194eab5a-d24c-4187-9b14-e3967e0ae4d7';
  v_exist int; i int; v_req_id uuid; v_sku uuid; v_skus uuid[]; v_atendida numeric; v_status text;
BEGIN
  SELECT count(*) INTO v_exist FROM public.est_requisicoes
  WHERE empresa_id = v_empresa AND sistema_origem = 'seed_relatorios_ms_x';
  IF v_exist > 0 THEN RETURN; END IF;

  SELECT array_agg(sku_id) INTO v_skus FROM (
    SELECT sal.sku_id FROM public.est_saldos sal
    WHERE sal.empresa_id = v_empresa AND sal.local_id = v_alm AND sal.quantidade >= 20
    ORDER BY sal.quantidade DESC LIMIT 20
  ) t;

  FOR i IN 1..70 LOOP
    v_sku := v_skus[1 + ((i - 1) % array_length(v_skus, 1))];
    IF i <= 5 THEN v_status := 'rascunho';
    ELSIF i <= 10 THEN v_status := 'pendente_aprovacao';
    ELSIF i <= 25 THEN v_status := 'aprovada';
    ELSIF i <= 50 THEN v_status := 'atendida_parcial';
    ELSE v_status := 'atendida_total'; END IF;

    INSERT INTO public.est_requisicoes (
      empresa_id, numero, requisitante_pessoa_id, solicitante_usuario_id, status, origem, observacao,
      valor_estimado, aprovador_usuario_id, aprovado_em, aprovacao_resultado,
      codigo_origem, sistema_origem, requisitante_nome_origem, created_at, updated_at
    ) VALUES (
      v_empresa, 'REQ-MSX-' || lpad(i::text, 3, '0'), v_pessoa, v_user, v_status, 'manual', 'seed_relatorios_ms_x',
      50, CASE WHEN v_status IN ('rascunho','pendente_aprovacao') THEN NULL ELSE v_aprov END,
      CASE WHEN v_status IN ('rascunho','pendente_aprovacao') THEN NULL ELSE now() - ((2 + (i % 20)) || ' days')::interval END,
      CASE WHEN v_status IN ('rascunho','pendente_aprovacao') THEN NULL ELSE 'aprovada' END,
      'SEED_MSX_REQ_' || lpad(i::text, 3, '0'), 'seed_relatorios_ms_x', 'Scale Relatorios',
      now() - ((5 + (i % 25)) || ' days')::interval, now()
    ) RETURNING id INTO v_req_id;

    v_atendida := CASE
      WHEN v_status = 'atendida_total' THEN 10
      WHEN v_status = 'atendida_parcial' THEN 5
      ELSE 0 END;

    INSERT INTO public.est_requisicao_itens (
      empresa_id, requisicao_id, sku_id, quantidade_pedida, quantidade_atendida, quantidade_pendente,
      local_id, status_item, created_at, updated_at
    ) VALUES (
      v_empresa, v_req_id, v_sku, 10, v_atendida, 10 - v_atendida, v_alm,
      CASE WHEN v_atendida = 10 THEN 'atendido' WHEN v_atendida > 0 THEN 'parcial' ELSE 'pendente' END,
      now() - ((5 + (i % 25)) || ' days')::interval, now()
    );

    IF v_atendida > 0 THEN
      BEGIN
        PERFORM public.est_registrar_movimento_atomico(
          p_empresa_id := v_empresa, p_tipo := 'saida', p_sku_id := v_sku, p_local_id := v_alm,
          p_quantidade := v_atendida,
          p_documento := 'SEED_MSX_REQ_' || lpad(i::text, 3, '0'),
          p_origem := 'requisicao', p_requisicao_id := v_req_id,
          p_usuario_id := v_user, p_motivo := 'Scale atendimento req');
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'REQ MSX % fail %', i, SQLERRM;
      END;
    END IF;
  END LOOP;

  UPDATE public.est_movimentos
  SET movimento_em = now() - ((2 + (abs(hashtext(documento)) % 20)) || ' days')::interval
  WHERE empresa_id = v_empresa AND documento LIKE 'SEED_MSX_REQ_%';
END $$;

-- -----------------------------------------------------------------------------
-- Remessas +54 (paginação remessa / poder-terceiros)
-- enviada=10; parcial retorno=3; fechada retorno=5 + baixa=5
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_empresa uuid := '415854c0-84a4-489f-a357-2cc0142b6b65';
  v_alm uuid := '2b16eb1e-38c8-40d9-81d1-f2122980aea4';
  v_user uuid := 'ccaa213a-f85d-4df7-aa79-79cefa80edb4';
  v_exist int; i int; v_rem_id uuid; v_item_id uuid; v_sku uuid; v_pessoa uuid; v_skus uuid[];
  v_pessoas uuid[] := ARRAY[
    'eb406bc8-2e6e-4fc6-aa27-4f57d65366ac'::uuid,
    'b0aa10c5-0c18-49b2-82d7-8578964960ee'::uuid,
    '194eab5a-d24c-4187-9b14-e3967e0ae4d7'::uuid
  ];
BEGIN
  SELECT count(*) INTO v_exist FROM public.est_remessa_lotes
  WHERE empresa_id = v_empresa AND observacao = 'seed_relatorios_ms_x';
  IF v_exist > 0 THEN RETURN; END IF;

  SELECT array_agg(sku_id) INTO v_skus FROM (
    SELECT sal.sku_id FROM public.est_saldos sal
    WHERE sal.empresa_id = v_empresa AND sal.local_id = v_alm AND sal.quantidade >= 25
    ORDER BY sal.quantidade DESC LIMIT 15
  ) t;

  FOR i IN 1..54 LOOP
    v_pessoa := v_pessoas[1 + ((i - 1) % 3)];
    v_sku := v_skus[1 + ((i - 1) % array_length(v_skus, 1))];

    INSERT INTO public.est_remessa_lotes (
      empresa_id, numero, destinatario_pessoa_id, motivo_codigo, motivo_texto, local_origem_id, documento,
      previsao_retorno_em, status, usuario_id, enviado_em, created_at, updated_at, observacao
    ) VALUES (
      v_empresa, 'REM-MSX-' || lpad(i::text, 3, '0'), v_pessoa, 'remessa_locacao', 'Scale remessa', v_alm,
      'SEED_MSX_REM_' || lpad(i::text, 3, '0'), CURRENT_DATE + (7 + (i % 14)), 'aberta', v_user,
      now() - ((1 + (i % 25)) || ' days')::interval,
      now() - ((1 + (i % 25)) || ' days')::interval, now(), 'seed_relatorios_ms_x'
    ) RETURNING id INTO v_rem_id;

    INSERT INTO public.est_remessa_itens (
      empresa_id, remessa_id, sku_id, quantidade_enviada, quantidade_retornada, quantidade_baixada,
      status_item, local_origem_id, observacao, created_at, updated_at
    ) VALUES (v_empresa, v_rem_id, v_sku, 10, 0, 0, 'em_poder', v_alm, 'seed_relatorios_ms_x', now(), now())
    RETURNING id INTO v_item_id;

    BEGIN
      PERFORM public.est_registrar_movimento_atomico(
        p_empresa_id := v_empresa, p_tipo := 'remessa_saida', p_sku_id := v_sku, p_local_id := v_alm,
        p_quantidade := 10, p_documento := 'SEED_MSX_REM_' || lpad(i::text, 3, '0'),
        p_pessoa_id := v_pessoa, p_origem := 'remessa', p_lote_remessa_id := v_rem_id,
        p_remessa_item_id := v_item_id, p_motivo_codigo := 'remessa_locacao',
        p_motivo := 'Scale remessa saida', p_usuario_id := v_user);

      -- 1-18 abertas; 19-36 parcial (retorno 3); 37-54 fechadas (ret 5 + baixa 5)
      IF i BETWEEN 19 AND 54 THEN
        PERFORM public.est_registrar_movimento_atomico(
          p_empresa_id := v_empresa, p_tipo := 'remessa_retorno', p_sku_id := v_sku, p_local_id := v_alm,
          p_quantidade := CASE WHEN i <= 36 THEN 3 ELSE 5 END,
          p_documento := 'SEED_MSX_RET_' || lpad(i::text, 3, '0'),
          p_pessoa_id := v_pessoa, p_origem := 'remessa', p_lote_remessa_id := v_rem_id,
          p_remessa_item_id := v_item_id, p_motivo := 'Scale retorno', p_usuario_id := v_user,
          p_quantidade_poder := CASE WHEN i <= 36 THEN 3 ELSE 5 END);
        UPDATE public.est_remessa_itens SET
          quantidade_retornada = CASE WHEN i <= 36 THEN 3 ELSE 5 END,
          status_item = 'parcial', updated_at = now() WHERE id = v_item_id;
        UPDATE public.est_remessa_lotes SET status = 'parcial', updated_at = now() WHERE id = v_rem_id;
      END IF;

      IF i >= 37 THEN
        PERFORM public.est_registrar_movimento_atomico(
          p_empresa_id := v_empresa, p_tipo := 'remessa_baixa', p_sku_id := v_sku, p_local_id := v_alm,
          p_quantidade := 5, p_documento := 'SEED_MSX_BAI_' || lpad(i::text, 3, '0'),
          p_pessoa_id := v_pessoa, p_origem := 'remessa', p_lote_remessa_id := v_rem_id,
          p_remessa_item_id := v_item_id, p_motivo := 'Scale baixa', p_usuario_id := v_user);
        UPDATE public.est_remessa_itens SET quantidade_baixada = 5, status_item = 'retornado', updated_at = now()
        WHERE id = v_item_id;
        UPDATE public.est_remessa_lotes SET status = 'fechada', updated_at = now() WHERE id = v_rem_id;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'REM MSX % fail %', i, SQLERRM;
      UPDATE public.est_remessa_lotes SET status = 'cancelada', updated_at = now() WHERE id = v_rem_id;
    END;
  END LOOP;

  UPDATE public.est_movimentos
  SET movimento_em = now() - ((1 + (abs(hashtext(documento)) % 25)) || ' days')::interval
  WHERE empresa_id = v_empresa
    AND (documento LIKE 'SEED_MSX_REM_%' OR documento LIKE 'SEED_MSX_RET_%' OR documento LIKE 'SEED_MSX_BAI_%');
END $$;

-- -----------------------------------------------------------------------------
-- Workflow: +120 cards (80 fechados no período, 40 abertos) + history
-- valor fechado = 1000 + (i*100)  → receita esperada verificável
-- -----------------------------------------------------------------------------
DO $$
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
  v_vendors uuid[] := ARRAY[
    'ff15dd49-42ce-4d1d-bba0-8511c9d211fa'::uuid,
    '9f8b434d-2016-4189-b625-afe41f6dc7bf'::uuid,
    'f7298a05-e9fe-4559-b9c3-75285e6e2564'::uuid,
    '4aa020a5-d815-4d51-9147-e9d492205d36'::uuid
  ];
  v_exist int; i int; v_card uuid; v_when timestamptz; v_stage uuid; v_user uuid; j int;
BEGIN
  SELECT count(*) INTO v_exist FROM public.crm_cards
  WHERE empresa_id = v_empresa AND COALESCE(metadados->>'seed_relatorios_ms_x','') = 'true';
  IF v_exist > 0 THEN RETURN; END IF;

  FOR i IN 1..120 LOOP
    v_user := v_vendors[1 + ((i - 1) % 4)];
    v_when := now() - ((1 + (i % 28)) || ' days')::interval - ((i % 12) || ' hours')::interval;

    IF i <= 80 THEN
      -- fechados
      v_stage := v_stages[5];
      INSERT INTO public.crm_cards (
        empresa_id, pipeline_id, stage_id, titulo, valor, responsavel_id,
        finalizado, finalizado_em, data_prazo, stage_entered_at, observacao, metadados, created_at, updated_at, ordem
      ) VALUES (
        v_empresa, v_pipe, v_stage, 'Scale Fechado ' || lpad(i::text, 3, '0'),
        1000 + (i * 100), v_user, true, v_when, (v_when::date - 2), v_when - interval '3 days',
        'seed_relatorios_ms_x',
        jsonb_build_object('seed_relatorios_ms_x', true, 'seed_closed', true, 'scale_idx', i),
        v_when - interval '10 days', v_when, i
      ) RETURNING id INTO v_card;

      INSERT INTO public.crm_cards_history (
        card_id, usuario_id, acao, de_stage_id, para_stage_id, de_pipeline_id, para_pipeline_id,
        observacao, created_at, empresa_id
      ) VALUES (
        v_card, v_user, 'STATUS_CHANGED', v_stages[4], v_stages[5], v_pipe, v_pipe,
        'seed_relatorios_ms_x:CARD_FINISHED', v_when, v_empresa
      );
    ELSE
      -- abertos concentrados em negociacao/fechamento (gargalos) + atrasos
      v_stage := CASE WHEN i % 2 = 0 THEN v_stages[3] ELSE v_stages[5] END;
      INSERT INTO public.crm_cards (
        empresa_id, pipeline_id, stage_id, titulo, valor, responsavel_id,
        finalizado, data_prazo, stage_entered_at, observacao, metadados, created_at, updated_at, ordem
      ) VALUES (
        v_empresa, v_pipe, v_stage, 'Scale Aberto ' || lpad(i::text, 3, '0'),
        2000 + (i * 50), v_user, false,
        CURRENT_DATE - ((i % 12) + 1),
        now() - ((i % 15) || ' days')::interval,
        'seed_relatorios_ms_x',
        jsonb_build_object('seed_relatorios_ms_x', true, 'scale_idx', i),
        now() - interval '20 days', now(), i
      ) RETURNING id INTO v_card;
    END IF;

    -- 4 transitions por card → +480 history (conversao/dwell/produtividade)
    FOR j IN 0..3 LOOP
      INSERT INTO public.crm_cards_history (
        card_id, usuario_id, acao, de_stage_id, para_stage_id, de_pipeline_id, para_pipeline_id,
        observacao, created_at, empresa_id
      ) VALUES (
        v_card, v_user, 'STATUS_CHANGED', v_stages[1 + j], v_stages[2 + j], v_pipe, v_pipe,
        'seed_relatorios_ms_x:STATUS_CHANGED',
        now() - (((j + 1) * 2 + (i % 10)) || ' days')::interval - ((j * 4) || ' hours')::interval,
        v_empresa
      );
    END LOOP;
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- Omni SCALE: +140 threads / ~700 msgs (heatmap + volume 30d + handover)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_empresa uuid := '415854c0-84a4-489f-a357-2cc0142b6b65';
  v_wa uuid := '1651ed70-d255-4284-8fbd-66a51a7cfadc';
  v_sim uuid := '602b6f19-8d0b-4a52-9daa-23fc8c37b5ea';
  v_lead uuid := 'c430623e-e3e9-48ae-afc9-e44167a35209';
  v_user uuid := 'ff15dd49-42ce-4d1d-bba0-8511c9d211fa';
  v_exist int; i int; j int; v_thread uuid; v_canal uuid; v_status text; v_opened timestamptz; v_msg_at timestamptz;
BEGIN
  SELECT count(*) INTO v_exist FROM public.crm_chat_threads
  WHERE empresa_id = v_empresa AND external_id LIKE 'seed_msx_%';
  IF v_exist > 0 THEN RETURN; END IF;

  FOR i IN 1..140 LOOP
    v_canal := CASE WHEN i % 2 = 0 THEN v_sim ELSE v_wa END;
    v_opened := now() - ((1 + (i % 29)) || ' days')::interval - (((i * 3) % 22) || ' hours')::interval;
    IF i <= 56 THEN v_status := 'ai';
    ELSIF i <= 98 THEN v_status := 'human';
    ELSE v_status := 'closed'; END IF;

    v_thread := gen_random_uuid();
    INSERT INTO public.crm_chat_threads (
      id, empresa_id, canal_id, external_id, lead_id, status, created_at, updated_at, opened_at,
      handover_at, handover_reason, closed_at, resolved_at, first_response_at, first_response_role,
      message_count_inbound, message_count_outbound
    ) VALUES (
      v_thread, v_empresa, v_canal, 'seed_msx_' || lpad(i::text, 3, '0'), v_lead, v_status,
      v_opened, v_opened + interval '3 hours', v_opened,
      CASE WHEN v_status IN ('human','closed') THEN v_opened + interval '30 minutes' ELSE NULL END,
      CASE WHEN v_status IN ('human','closed') THEN 'seed_relatorios_ms_x' ELSE NULL END,
      CASE WHEN v_status = 'closed' THEN v_opened + interval '5 hours' ELSE NULL END,
      CASE WHEN v_status = 'closed' THEN v_opened + interval '5 hours' ELSE NULL END,
      v_opened + interval '8 minutes', 'assistant', 0, 0
    );

    INSERT INTO public.crm_conversas (
      empresa_id, canal_id, lead_id, external_id, status, last_message, sessao_id, metadata,
      created_at, updated_at, atribuido_a_id
    ) VALUES (
      v_empresa, v_canal, v_lead, 'seed_msx_' || lpad(i::text, 3, '0'), v_status,
      'Scale omni', v_thread, jsonb_build_object('seed_relatorios_ms_x', true),
      v_opened, v_opened + interval '3 hours',
      CASE WHEN v_status = 'human' THEN v_user ELSE NULL END
    );

    FOR j IN 1..5 LOOP
      v_msg_at := date_trunc('day', v_opened)
        + (((i + j) % 7) || ' days')::interval
        + ((7 + ((i + j) % 14)) || ' hours')::interval
        + ((j * 5) || ' minutes')::interval;
      IF v_msg_at > now() THEN v_msg_at := now() - ((j) || ' hours')::interval; END IF;

      INSERT INTO public.crm_interacoes (
        empresa_id, lead_id, contact_phone, contact_name, role, content, metadata, created_at, conversa_id, user_id
      ) VALUES (
        v_empresa, v_lead, '5511888' || lpad(i::text, 4, '0'), 'Scale Contato ' || i,
        CASE WHEN j % 2 = 1 THEN 'user' ELSE 'assistant' END,
        CASE WHEN j % 2 = 1 THEN 'Scale msg ' || i || '/' || j ELSE 'Scale reply ' || i || '/' || j END,
        jsonb_build_object('seed_relatorios_ms_x', true), v_msg_at, v_thread,
        CASE WHEN j % 2 = 0 AND v_status = 'human' THEN v_user ELSE NULL END
      );
    END LOOP;
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- Verificação + âncoras de consistência
-- -----------------------------------------------------------------------------
SELECT
  (SELECT count(*) FROM est_movimentos WHERE empresa_id='415854c0-84a4-489f-a357-2cc0142b6b65' AND documento LIKE 'SEED_MSX_%') AS movs_msx,
  (SELECT count(*) FROM est_movimentos WHERE empresa_id='415854c0-84a4-489f-a357-2cc0142b6b65' AND documento LIKE 'SEED_MSX_SAI_%') AS saidas_msx,
  (SELECT count(*) FROM est_movimentos WHERE empresa_id='415854c0-84a4-489f-a357-2cc0142b6b65' AND documento LIKE 'SEED_MSX_AJU_%') AS ajustes_msx,
  (SELECT count(*) FROM est_requisicoes WHERE empresa_id='415854c0-84a4-489f-a357-2cc0142b6b65' AND sistema_origem='seed_relatorios_ms_x') AS reqs_msx,
  (SELECT count(*) FROM est_remessa_lotes WHERE empresa_id='415854c0-84a4-489f-a357-2cc0142b6b65' AND observacao='seed_relatorios_ms_x') AS rem_msx,
  (SELECT count(*) FROM crm_cards WHERE empresa_id='415854c0-84a4-489f-a357-2cc0142b6b65' AND metadados->>'seed_relatorios_ms_x'='true') AS cards_msx,
  (SELECT count(*) FROM crm_cards_history WHERE empresa_id='415854c0-84a4-489f-a357-2cc0142b6b65' AND observacao LIKE 'seed_relatorios_ms_x%') AS hist_msx,
  (SELECT count(*) FROM crm_chat_threads WHERE empresa_id='415854c0-84a4-489f-a357-2cc0142b6b65' AND external_id LIKE 'seed_msx_%') AS thr_msx,
  (SELECT count(*) FROM crm_interacoes WHERE empresa_id='415854c0-84a4-489f-a357-2cc0142b6b65' AND metadata ? 'seed_relatorios_ms_x') AS msgs_msx;

-- Ancoras (cálculo esperado):
-- saidas MSX: count * 3 unidades
-- ajustes MSX: count * 2 unidades (metade + / metade -)
-- reqs atendidas_total: fill 100% (10/10); parciais: 50% (5/10)
-- remessas: 18 abertas / 18 parciais / 18 fechadas; enviada=10
-- receita scale fechados: sum(1000 + i*100) for i=1..80 = 80*1000 + 100*(80*81/2) = 80000 + 324000 = 404000
