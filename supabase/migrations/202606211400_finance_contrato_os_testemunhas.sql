-- Número automático da OS + testemunhas do contrato (MSA/PDF)

BEGIN;

ALTER TABLE public.finance_contratos
  ADD COLUMN IF NOT EXISTS numero_os text,
  ADD COLUMN IF NOT EXISTS testemunha_1_nome text,
  ADD COLUMN IF NOT EXISTS testemunha_1_cpf text,
  ADD COLUMN IF NOT EXISTS testemunha_2_nome text,
  ADD COLUMN IF NOT EXISTS testemunha_2_cpf text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_contratos_numero_os_empresa
  ON public.finance_contratos (empresa_id, numero_os)
  WHERE numero_os IS NOT NULL;

COMMENT ON COLUMN public.finance_contratos.numero_os IS
  'Número da Ordem de Serviço (auto OS-AAAA-NNNN por empresa).';
COMMENT ON COLUMN public.finance_contratos.testemunha_1_nome IS 'Testemunha 1 — nome (MSA/PDF).';
COMMENT ON COLUMN public.finance_contratos.testemunha_1_cpf IS 'Testemunha 1 — CPF (MSA/PDF).';
COMMENT ON COLUMN public.finance_contratos.testemunha_2_nome IS 'Testemunha 2 — nome (MSA/PDF).';
COMMENT ON COLUMN public.finance_contratos.testemunha_2_cpf IS 'Testemunha 2 — CPF (MSA/PDF).';

CREATE OR REPLACE FUNCTION public.tg_finance_contrato_before_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.numero_contrato IS NULL OR btrim(NEW.numero_contrato) = '' THEN
    NEW.numero_contrato := 'CTR-' || to_char(now(), 'YYYY') || '-' || lpad(
      (SELECT COUNT(*) + 1 FROM public.finance_contratos c WHERE c.empresa_id = NEW.empresa_id)::text,
      4, '0'
    );
  END IF;

  IF NEW.numero_os IS NULL OR btrim(NEW.numero_os) = '' THEN
    NEW.numero_os := 'OS-' || to_char(now(), 'YYYY') || '-' || lpad(
      (SELECT COUNT(*) + 1 FROM public.finance_contratos c WHERE c.empresa_id = NEW.empresa_id)::text,
      4, '0'
    );
  END IF;

  RETURN NEW;
END;
$$;

UPDATE public.finance_contratos c
SET numero_os = sub.numero_os
FROM (
  SELECT id,
    'OS-' || to_char(created_at, 'YYYY') || '-' || lpad(
      row_number() OVER (PARTITION BY empresa_id ORDER BY created_at)::text,
      4, '0'
    ) AS numero_os
  FROM public.finance_contratos
  WHERE numero_os IS NULL OR btrim(numero_os) = ''
) sub
WHERE c.id = sub.id;

COMMIT;
