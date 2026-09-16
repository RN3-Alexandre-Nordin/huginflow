-- Rastreio de requisição vinda de sistema externo (planilha / integração)

ALTER TABLE public.est_requisicoes
  ADD COLUMN IF NOT EXISTS codigo_origem text,
  ADD COLUMN IF NOT EXISTS sistema_origem text,
  ADD COLUMN IF NOT EXISTS requisitante_nome_origem text;

COMMENT ON COLUMN public.est_requisicoes.codigo_origem IS
  'ID/número da requisição no sistema de origem. Quando informado, 1 requisição Hugin = 1 requisição origem.';
COMMENT ON COLUMN public.est_requisicoes.sistema_origem IS
  'Identificador do sistema de origem (ex.: atc_suprimentos, sap, planilha).';
COMMENT ON COLUMN public.est_requisicoes.requisitante_nome_origem IS
  'Nome do requisitante como veio na origem (texto livre para rastreio/auditoria).';

-- Idempotência: não reimportar a mesma req de origem
CREATE UNIQUE INDEX IF NOT EXISTS uq_est_requisicoes_empresa_sistema_codigo_origem
  ON public.est_requisicoes (empresa_id, sistema_origem, codigo_origem)
  WHERE codigo_origem IS NOT NULL
    AND btrim(codigo_origem) <> ''
    AND sistema_origem IS NOT NULL
    AND btrim(sistema_origem) <> '';
