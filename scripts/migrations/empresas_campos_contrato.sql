-- Campos jurídicos em empresas (qualificação do Cliente no MSA / contrato)
-- Aplicar no Supabase dev (develop): vujqukqsfwmoezwyuoum

ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS tipo_societario text,
  ADD COLUMN IF NOT EXISTS cidade text,
  ADD COLUMN IF NOT EXISTS responsavel_cpf text,
  ADD COLUMN IF NOT EXISTS responsavel_nacionalidade text,
  ADD COLUMN IF NOT EXISTS responsavel_estado_civil text,
  ADD COLUMN IF NOT EXISTS responsavel_profissao text;

COMMENT ON COLUMN empresas.tipo_societario IS 'Ex.: sociedade empresária limitada — preâmbulo do contrato';
COMMENT ON COLUMN empresas.cidade IS 'Cidade da sede — campo Local nas assinaturas';
COMMENT ON COLUMN empresas.responsavel_cpf IS 'CPF do representante legal do Cliente';
COMMENT ON COLUMN empresas.responsavel_nacionalidade IS 'Nacionalidade do representante legal';
COMMENT ON COLUMN empresas.responsavel_estado_civil IS 'Estado civil do representante legal';
COMMENT ON COLUMN empresas.responsavel_profissao IS 'Profissão do representante legal';
