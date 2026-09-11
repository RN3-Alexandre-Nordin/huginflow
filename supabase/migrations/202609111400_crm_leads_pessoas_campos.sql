-- Pessoas: papéis multi + natureza + blocos comercial/fiscal/endereço/finanças
-- Mantém tabela crm_leads (compat funil/omni); UI passa a chamar Pessoas.

ALTER TABLE public.crm_leads
  ADD COLUMN IF NOT EXISTS papeis text[] NOT NULL DEFAULT ARRAY['lead']::text[],
  ADD COLUMN IF NOT EXISTS natureza text NOT NULL DEFAULT 'pf',
  ADD COLUMN IF NOT EXISTS nome_fantasia text,
  ADD COLUMN IF NOT EXISTS rg_ie text,
  ADD COLUMN IF NOT EXISTS inscricao_municipal text,
  ADD COLUMN IF NOT EXISTS email_financeiro text,
  ADD COLUMN IF NOT EXISTS telefone_2 text,
  ADD COLUMN IF NOT EXISTS site text,
  ADD COLUMN IF NOT EXISTS preferencia_contato text,
  ADD COLUMN IF NOT EXISTS cep text,
  ADD COLUMN IF NOT EXISTS logradouro text,
  ADD COLUMN IF NOT EXISTS numero text,
  ADD COLUMN IF NOT EXISTS complemento text,
  ADD COLUMN IF NOT EXISTS bairro text,
  ADD COLUMN IF NOT EXISTS cidade text,
  ADD COLUMN IF NOT EXISTS uf text,
  ADD COLUMN IF NOT EXISTS pais text DEFAULT 'BR',
  ADD COLUMN IF NOT EXISTS origem_detalhe text,
  ADD COLUMN IF NOT EXISTS observacoes text,
  ADD COLUMN IF NOT EXISTS status_relacionamento text NOT NULL DEFAULT 'ativo',
  ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS optante_simples boolean,
  ADD COLUMN IF NOT EXISTS regime_tributario text,
  ADD COLUMN IF NOT EXISTS pix text,
  ADD COLUMN IF NOT EXISTS banco text,
  ADD COLUMN IF NOT EXISTS agencia text,
  ADD COLUMN IF NOT EXISTS conta text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.crm_leads
  DROP CONSTRAINT IF EXISTS crm_leads_natureza_chk;
ALTER TABLE public.crm_leads
  ADD CONSTRAINT crm_leads_natureza_chk
  CHECK (natureza IN ('pf', 'pj'));

ALTER TABLE public.crm_leads
  DROP CONSTRAINT IF EXISTS crm_leads_status_rel_chk;
ALTER TABLE public.crm_leads
  ADD CONSTRAINT crm_leads_status_rel_chk
  CHECK (status_relacionamento IN ('ativo', 'inativo', 'bloqueado'));

ALTER TABLE public.crm_leads
  DROP CONSTRAINT IF EXISTS crm_leads_papeis_chk;
ALTER TABLE public.crm_leads
  ADD CONSTRAINT crm_leads_papeis_chk
  CHECK (
    cardinality(papeis) >= 1
    AND papeis <@ ARRAY[
      'lead',
      'cliente',
      'fornecedor',
      'funcionario',
      'transportador',
      'parceiro',
      'prestador',
      'contato'
    ]::text[]
  );

ALTER TABLE public.crm_leads
  DROP CONSTRAINT IF EXISTS crm_leads_preferencia_contato_chk;
ALTER TABLE public.crm_leads
  ADD CONSTRAINT crm_leads_preferencia_contato_chk
  CHECK (
    preferencia_contato IS NULL
    OR preferencia_contato IN ('whatsapp', 'email', 'telefone')
  );

UPDATE public.crm_leads
SET papeis = ARRAY['lead']::text[]
WHERE papeis IS NULL OR cardinality(papeis) = 0;

CREATE INDEX IF NOT EXISTS idx_crm_leads_papeis
  ON public.crm_leads USING gin (papeis);

CREATE INDEX IF NOT EXISTS idx_crm_leads_empresa_ativo
  ON public.crm_leads (empresa_id, ativo);

COMMENT ON COLUMN public.crm_leads.papeis IS
  'Papéis da pessoa (multi): lead, cliente, fornecedor, etc.';
COMMENT ON COLUMN public.crm_leads.natureza IS
  'pf | pj';
