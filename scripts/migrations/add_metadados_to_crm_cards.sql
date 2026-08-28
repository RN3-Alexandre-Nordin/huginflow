-- Migration: Adiciona coluna JSONB `metadados` em crm_cards
-- Utilizada para armazenar dados de contato de leads vindos da Landing Page via /api/inbound/leads
-- Execute este script no SQL Editor do Supabase (projeto Hugin Flow)

ALTER TABLE public.crm_cards
  ADD COLUMN IF NOT EXISTS metadados JSONB DEFAULT NULL;

COMMENT ON COLUMN public.crm_cards.metadados IS 
  'Dados estruturados do lead (origem, contato, mensagem) para cards criados por integrações externas como Landing Pages.';
