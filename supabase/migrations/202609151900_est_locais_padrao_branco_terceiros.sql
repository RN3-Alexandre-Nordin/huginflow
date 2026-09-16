-- Locais padrão por empresa: BRANCO (principal) + TERCEIROS (poder de terceiros)
-- Trigger AFTER INSERT em empresas + backfill das empresas existentes.
-- Função idempotente: est_garantir_locais_padrao(empresa_id)

-- 1) Flag de local sistema de terceiros
ALTER TABLE public.cad_locais_estoque
  ADD COLUMN IF NOT EXISTS eh_terceiros boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.cad_locais_estoque.eh_terceiros IS
  'Local sistema TERCEIROS: posição agregada do estoque próprio em poder de terceiros (não selecionável em operações manuais).';

ALTER TABLE public.cad_locais_estoque
  DROP CONSTRAINT IF EXISTS cad_locais_estoque_tipo_check;

ALTER TABLE public.cad_locais_estoque
  ADD CONSTRAINT cad_locais_estoque_tipo_check
  CHECK (tipo IN ('deposito', 'almoxarifado', 'loja', 'outro', 'principal', 'terceiros'));

-- No máximo 1 local TERCEIROS por empresa
CREATE UNIQUE INDEX IF NOT EXISTS uq_cad_locais_estoque_terceiros
  ON public.cad_locais_estoque (empresa_id)
  WHERE eh_terceiros = true;

-- 2) Função idempotente
CREATE OR REPLACE FUNCTION public.est_garantir_locais_padrao(p_empresa_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_branco_id uuid;
  v_terceiros_id uuid;
  v_created_branco boolean := false;
  v_created_terceiros boolean := false;
BEGIN
  IF p_empresa_id IS NULL THEN
    RAISE EXCEPTION 'PARAMETRO_OBRIGATORIO: empresa_id é obrigatório.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.empresas e WHERE e.id = p_empresa_id) THEN
    RAISE EXCEPTION 'EMPRESA_NAO_ENCONTRADA: %', p_empresa_id;
  END IF;

  -- BRANCO (principal)
  SELECT l.id INTO v_branco_id
  FROM public.cad_locais_estoque l
  WHERE l.empresa_id = p_empresa_id
    AND l.codigo = 'BRANCO'
  LIMIT 1;

  IF v_branco_id IS NULL THEN
    -- Garante no máximo 1 principal
    UPDATE public.cad_locais_estoque
    SET eh_principal = false, updated_at = now()
    WHERE empresa_id = p_empresa_id
      AND eh_principal = true;

    INSERT INTO public.cad_locais_estoque (
      empresa_id, codigo, nome, tipo, eh_principal, eh_terceiros, ativo, created_at, updated_at
    ) VALUES (
      p_empresa_id, 'BRANCO', 'Estoque Geral (BRANCO)', 'principal', true, false, true, now(), now()
    )
    RETURNING id INTO v_branco_id;

    v_created_branco := true;
  ELSE
    -- 1º desmarca outros principais (índice único parcial)
    UPDATE public.cad_locais_estoque
    SET eh_principal = false, updated_at = now()
    WHERE empresa_id = p_empresa_id
      AND id <> v_branco_id
      AND eh_principal = true;

    -- 2º promove BRANCO
    UPDATE public.cad_locais_estoque
    SET
      eh_principal = true,
      tipo = 'principal',
      eh_terceiros = false,
      ativo = true,
      updated_at = now()
    WHERE id = v_branco_id;
  END IF;

  -- TERCEIROS (sistema)
  SELECT l.id INTO v_terceiros_id
  FROM public.cad_locais_estoque l
  WHERE l.empresa_id = p_empresa_id
    AND (l.codigo = 'TERCEIROS' OR l.eh_terceiros = true)
  ORDER BY CASE WHEN l.codigo = 'TERCEIROS' THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_terceiros_id IS NULL THEN
    INSERT INTO public.cad_locais_estoque (
      empresa_id, codigo, nome, tipo, eh_principal, eh_terceiros, ativo, created_at, updated_at
    ) VALUES (
      p_empresa_id,
      'TERCEIROS',
      'Estoque em Poder de Terceiros',
      'terceiros',
      false,
      true,
      true,
      now(),
      now()
    )
    RETURNING id INTO v_terceiros_id;

    v_created_terceiros := true;
  ELSE
    UPDATE public.cad_locais_estoque
    SET
      codigo = 'TERCEIROS',
      nome = COALESCE(NULLIF(nome, ''), 'Estoque em Poder de Terceiros'),
      tipo = 'terceiros',
      eh_principal = false,
      eh_terceiros = true,
      ativo = true,
      updated_at = now()
    WHERE id = v_terceiros_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'empresa_id', p_empresa_id,
    'branco_id', v_branco_id,
    'terceiros_id', v_terceiros_id,
    'created_branco', v_created_branco,
    'created_terceiros', v_created_terceiros
  );
END;
$$;

COMMENT ON FUNCTION public.est_garantir_locais_padrao(uuid) IS
  'Garante locais sistema BRANCO (principal) e TERCEIROS por empresa. Idempotente.';

GRANT EXECUTE ON FUNCTION public.est_garantir_locais_padrao(uuid) TO authenticated, service_role;

-- 3) Trigger: toda nova empresa já nasce com BRANCO + TERCEIROS
CREATE OR REPLACE FUNCTION public.trg_empresas_seed_locais_estoque()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.est_garantir_locais_padrao(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_empresas_seed_locais_estoque ON public.empresas;
CREATE TRIGGER trg_empresas_seed_locais_estoque
  AFTER INSERT ON public.empresas
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_empresas_seed_locais_estoque();

COMMENT ON FUNCTION public.trg_empresas_seed_locais_estoque() IS
  'Seed automático de locais BRANCO e TERCEIROS ao criar empresa.';

-- 4) Backfill empresas existentes
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM public.empresas LOOP
    PERFORM public.est_garantir_locais_padrao(r.id);
  END LOOP;
END;
$$;
