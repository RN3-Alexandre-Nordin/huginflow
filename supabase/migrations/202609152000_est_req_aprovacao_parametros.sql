-- Aprovação interna de requisições: parâmetros em est_config + auditoria em est_requisicoes

-- --------------------------------------------------------------------------
-- 1) est_config
-- --------------------------------------------------------------------------
ALTER TABLE public.est_config
  ADD COLUMN IF NOT EXISTS req_aprovacao_ativa boolean NOT NULL DEFAULT false;

ALTER TABLE public.est_config
  ADD COLUMN IF NOT EXISTS req_aprovador_usuario_id uuid
    REFERENCES public.usuarios (id) ON DELETE SET NULL;

ALTER TABLE public.est_config
  ADD COLUMN IF NOT EXISTS req_aprovacao_valor_minimo numeric(18, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.est_config
  DROP CONSTRAINT IF EXISTS est_config_req_aprovacao_valor_minimo_check;

ALTER TABLE public.est_config
  ADD CONSTRAINT est_config_req_aprovacao_valor_minimo_check
  CHECK (req_aprovacao_valor_minimo >= 0);

COMMENT ON COLUMN public.est_config.req_aprovacao_ativa IS
  'Se true, requisições enviadas podem exigir aprovação interna (conforme valor mínimo).';
COMMENT ON COLUMN public.est_config.req_aprovador_usuario_id IS
  'Usuário aprovador padrão das requisições (além de admin/superadmin).';
COMMENT ON COLUMN public.est_config.req_aprovacao_valor_minimo IS
  'Valor mínimo (Σ qtd × preco_custo). 0 = limiar não se aplica (toda req enviada vai para aprovação se flag ligada).';

CREATE INDEX IF NOT EXISTS idx_est_config_aprovador
  ON public.est_config (req_aprovador_usuario_id)
  WHERE req_aprovador_usuario_id IS NOT NULL;

-- --------------------------------------------------------------------------
-- 2) est_requisicoes — valor estimado + auditoria de aprovação
-- --------------------------------------------------------------------------
ALTER TABLE public.est_requisicoes
  ADD COLUMN IF NOT EXISTS valor_estimado numeric(18, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.est_requisicoes
  ADD COLUMN IF NOT EXISTS aprovador_usuario_id uuid
    REFERENCES public.usuarios (id) ON DELETE SET NULL;

ALTER TABLE public.est_requisicoes
  ADD COLUMN IF NOT EXISTS aprovado_em timestamptz;

ALTER TABLE public.est_requisicoes
  ADD COLUMN IF NOT EXISTS aprovacao_resultado text;

ALTER TABLE public.est_requisicoes
  DROP CONSTRAINT IF EXISTS est_requisicoes_aprovacao_resultado_check;

ALTER TABLE public.est_requisicoes
  ADD CONSTRAINT est_requisicoes_aprovacao_resultado_check
  CHECK (
    aprovacao_resultado IS NULL
    OR aprovacao_resultado IN ('aprovada', 'rejeitada')
  );

COMMENT ON COLUMN public.est_requisicoes.valor_estimado IS
  'Soma quantidade_pedida × preco_custo dos SKUs no momento da criação/envio.';
COMMENT ON COLUMN public.est_requisicoes.aprovador_usuario_id IS
  'Usuário que aprovou ou rejeitou a requisição.';
COMMENT ON COLUMN public.est_requisicoes.aprovado_em IS
  'Timestamp da decisão de aprovação/rejeição.';
COMMENT ON COLUMN public.est_requisicoes.aprovacao_resultado IS
  'Resultado da decisão: aprovada | rejeitada.';

CREATE INDEX IF NOT EXISTS idx_est_requisicoes_aprovador
  ON public.est_requisicoes (empresa_id, aprovador_usuario_id)
  WHERE aprovador_usuario_id IS NOT NULL;
