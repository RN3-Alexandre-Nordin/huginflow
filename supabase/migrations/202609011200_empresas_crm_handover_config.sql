-- Configuração de handover estruturado por empresa (motivos e checklists).
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS crm_handover_config JSONB DEFAULT NULL;

COMMENT ON COLUMN public.empresas.crm_handover_config IS
  'CRM handover: { motivos: string[], ja_feito_opcoes: string[], pendencias_opcoes: string[] }';
