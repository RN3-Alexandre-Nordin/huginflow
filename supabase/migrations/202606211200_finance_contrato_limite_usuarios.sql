-- Limite de usuários autorizados no contrato comercial (quadro-resumo da OS / PDF)

BEGIN;

ALTER TABLE public.finance_contratos
  ADD COLUMN IF NOT EXISTS limite_usuarios smallint;

ALTER TABLE public.finance_contratos
  DROP CONSTRAINT IF EXISTS finance_contratos_limite_usuarios_check;

ALTER TABLE public.finance_contratos
  ADD CONSTRAINT finance_contratos_limite_usuarios_check
  CHECK (limite_usuarios IS NULL OR (limite_usuarios >= 1 AND limite_usuarios <= 9999));

COMMENT ON COLUMN public.finance_contratos.limite_usuarios IS
  'Limite de usuários autorizados na Plataforma (refletido na OS/PDF).';

COMMIT;
