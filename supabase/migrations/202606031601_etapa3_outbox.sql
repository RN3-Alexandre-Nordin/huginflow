-- =============================================================================
-- Etapa 3 — integration_outbox
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.integration_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  topic text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'PENDING',
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,

  CONSTRAINT integration_outbox_status_check
    CHECK (status IN ('PENDING', 'SENT', 'ERROR'))
);

COMMENT ON TABLE public.integration_outbox IS
  'Outbox de eventos para integrações (Stripe, webhooks internos, etc.).';

CREATE INDEX IF NOT EXISTS idx_integration_outbox_empresa_status
  ON public.integration_outbox (empresa_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_integration_outbox_aggregate
  ON public.integration_outbox (aggregate_type, aggregate_id);

ALTER TABLE public.integration_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_outbox FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- enqueue_event — depende da tabela integration_outbox
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enqueue_event(
  p_empresa_id uuid,
  p_topic text,
  p_aggregate_type text,
  p_aggregate_id uuid,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_empresa_id IS NULL THEN
    RAISE EXCEPTION 'enqueue_event: empresa_id obrigatório';
  END IF;

  INSERT INTO public.integration_outbox (
    empresa_id,
    topic,
    aggregate_type,
    aggregate_id,
    payload,
    status
  ) VALUES (
    p_empresa_id,
    p_topic,
    p_aggregate_type,
    p_aggregate_id,
    COALESCE(p_payload, '{}'::jsonb),
    'PENDING'
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.enqueue_event(uuid, text, text, uuid, jsonb) IS
  'Enfileira evento de integração (outbox pattern).';

COMMIT;
