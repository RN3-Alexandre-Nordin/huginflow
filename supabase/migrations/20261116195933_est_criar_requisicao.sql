-- Pacote 4: unicidade do número interno e criação atômica de requisição + itens.
-- Não renumerar nem apagar registros existentes. Duplicidade interrompe a migration.

DO $$
DECLARE
  v_duplicados integer;
  v_amostra text;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.est_requisicoes'::regclass
      AND conname = 'uq_est_requisicoes_empresa_numero'
  ) THEN
    RETURN;
  END IF;

  SELECT count(*)::integer
    INTO v_duplicados
  FROM (
    SELECT empresa_id, numero
    FROM public.est_requisicoes
    GROUP BY empresa_id, numero
    HAVING count(*) > 1
  ) d;

  IF v_duplicados > 0 THEN
    SELECT string_agg(
      format('%s / %s × %s', empresa_id, numero, qtd),
      '; ' ORDER BY qtd DESC
    )
      INTO v_amostra
    FROM (
      SELECT empresa_id, numero, count(*) AS qtd
      FROM public.est_requisicoes
      GROUP BY empresa_id, numero
      HAVING count(*) > 1
      ORDER BY count(*) DESC
      LIMIT 20
    ) s;

    RAISE EXCEPTION
      'MIGRATION_ABORTADA: % par(es) duplicado(s) de (empresa_id, numero) em est_requisicoes. Nenhum registro foi excluído ou renumerado. Corrija manualmente e rode de novo. Amostra: %',
      v_duplicados,
      COALESCE(v_amostra, '(sem amostra)');
  END IF;

  ALTER TABLE public.est_requisicoes
    ADD CONSTRAINT uq_est_requisicoes_empresa_numero UNIQUE (empresa_id, numero);
END
$$;

COMMENT ON CONSTRAINT uq_est_requisicoes_empresa_numero ON public.est_requisicoes IS
  'Número interno único por empresa. Protege a sequência REQ-AAAAMMDD-#### contra colisão.';
