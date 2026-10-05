-- Dois gatilhos de valor na alçada do pedido.
-- nivel1_teto: até este valor, sem aprovação. Acima, 1ª alçada.
-- nivel2_a_partir: acima deste valor, 2ª alçada.
-- O teto antigo só disparava a 2ª alçada quando havia grupo do nível 2.
-- Sem esse grupo, o número antigo não entrava na conta: o piso da 1ª fica 0
-- para todo pedido continuar exigindo uma aprovação até a nova configuração.

ALTER TABLE public.com_config
  ADD COLUMN IF NOT EXISTS nivel2_a_partir numeric(14, 2) NULL;

COMMENT ON COLUMN public.com_config.nivel1_teto IS
  'Até este valor o pedido não exige alçada. Acima dele exige a 1ª alçada.';

COMMENT ON COLUMN public.com_config.nivel2_a_partir IS
  'Acima deste valor o pedido exige a 2ª alçada. Entre os dois valores, só a 1ª.';

UPDATE public.com_config
SET nivel2_a_partir = nivel1_teto,
    nivel1_teto = 0
WHERE nivel2_a_partir IS NULL
  AND nivel2_grupo_id IS NOT NULL
  AND nivel1_teto IS NOT NULL
  AND nivel1_teto > 0;

UPDATE public.com_config
SET nivel1_teto = 0
WHERE nivel2_a_partir IS NULL
  AND nivel2_grupo_id IS NULL
  AND nivel1_teto IS NOT NULL
  AND nivel1_teto > 0;
