-- Provedor de IA por empresa (Gemini ou OpenAI)

ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS ai_provider text NOT NULL DEFAULT 'gemini',
  ADD COLUMN IF NOT EXISTS openai_api_key text;

ALTER TABLE public.empresas DROP CONSTRAINT IF EXISTS empresas_ai_provider_check;
ALTER TABLE public.empresas
  ADD CONSTRAINT empresas_ai_provider_check
  CHECK (ai_provider IN ('gemini', 'openai'));

COMMENT ON COLUMN public.empresas.ai_provider IS 'Provedor de IA: gemini | openai';
COMMENT ON COLUMN public.empresas.openai_api_key IS 'Chave API OpenAI (quando ai_provider = openai)';
