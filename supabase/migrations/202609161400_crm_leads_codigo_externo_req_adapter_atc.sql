-- Matrícula / código externo em Pessoas (match de planilhas legado)
-- + addon cobrável do adaptador ATC de requisição por planilha

ALTER TABLE public.crm_leads
  ADD COLUMN IF NOT EXISTS codigo_externo text;

COMMENT ON COLUMN public.crm_leads.codigo_externo IS
  'Código/matrícula no sistema externo do cliente. Usado por adaptadores de planilha (ex.: ATC). Único por empresa quando preenchido.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_leads_empresa_codigo_externo
  ON public.crm_leads (empresa_id, codigo_externo)
  WHERE codigo_externo IS NOT NULL AND btrim(codigo_externo) <> '';

INSERT INTO public.addon_registry (
  codigo, nome, descricao, tipo, sort_order, ativo,
  default_enabled, rn3_only, billable, billing_model, list_price_cents
) VALUES (
  'estoque_req_adapter_atc',
  'Adapter planilha requisição ATC',
  'Transforma export legado de suprimentos (ATC) no formato canônico Hugin de requisição. Custom cobrável.',
  'addon', 85, true,
  false, false, true, 'flat', NULL
)
ON CONFLICT (codigo) DO UPDATE SET
  nome = EXCLUDED.nome,
  descricao = EXCLUDED.descricao,
  updated_at = now();
