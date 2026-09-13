-- Migration: pipelines_ativo_soft_delete
-- Permite exclusão lógica (inativação) de funis com histórico de cards
-- e filtragem de funis ativos/inativos.

ALTER TABLE pipelines ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_pipelines_empresa_ativo ON pipelines (empresa_id, ativo);
