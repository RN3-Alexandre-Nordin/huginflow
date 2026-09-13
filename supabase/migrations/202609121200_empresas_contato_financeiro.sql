-- =============================================================================
-- Migration: 202609121200_empresas_contato_financeiro.sql
-- Descrição: Adiciona colunas de Contato Financeiro na tabela public.empresas
--            para envio de faturamento, NF-e, boletos, cobrança e chave PIX.
-- =============================================================================

ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS financeiro_nome text,
  ADD COLUMN IF NOT EXISTS financeiro_email text,
  ADD COLUMN IF NOT EXISTS financeiro_telefone text,
  ADD COLUMN IF NOT EXISTS financeiro_chave_pix text;

COMMENT ON COLUMN public.empresas.financeiro_nome IS 'Nome do contato ou responsável pelo setor financeiro da empresa';
COMMENT ON COLUMN public.empresas.financeiro_email IS 'E-mail do setor financeiro para envio de NF-e, boletos e cobrança';
COMMENT ON COLUMN public.empresas.financeiro_telefone IS 'Telefone ou WhatsApp de contato financeiro da empresa';
COMMENT ON COLUMN public.empresas.financeiro_chave_pix IS 'Chave PIX da empresa para transações e faturamento';
