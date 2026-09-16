-- Writers leves para métricas SLA em crm_chat_threads (não bloqueia BI; RPCs já têm fallback).

-- Contagem de mensagens + first_response_at / handover_at / closed_at
CREATE OR REPLACE FUNCTION public.trg_crm_interacoes_thread_metrics()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_thread uuid;
BEGIN
  v_thread := NEW.conversa_id;
  IF v_thread IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.role = 'user' THEN
    UPDATE public.crm_chat_threads t
    SET
      message_count_inbound = COALESCE(t.message_count_inbound, 0) + 1,
      opened_at = COALESCE(t.opened_at, NEW.created_at),
      updated_at = now()
    WHERE t.id = v_thread;
  ELSIF NEW.role IN ('assistant', 'system') THEN
    UPDATE public.crm_chat_threads t
    SET
      message_count_outbound = COALESCE(t.message_count_outbound, 0) + 1,
      first_response_at = COALESCE(t.first_response_at, NEW.created_at),
      first_response_role = COALESCE(t.first_response_role, NEW.role),
      updated_at = now()
    WHERE t.id = v_thread;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_interacoes_thread_metrics ON public.crm_interacoes;
CREATE TRIGGER trg_crm_interacoes_thread_metrics
  AFTER INSERT ON public.crm_interacoes
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_crm_interacoes_thread_metrics();

-- Status da conversa → handover_at / closed_at / resolved_at na thread
CREATE OR REPLACE FUNCTION public.trg_crm_conversas_thread_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.sessao_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'human' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'human') THEN
    UPDATE public.crm_chat_threads t
    SET
      status = 'human',
      handover_at = COALESCE(t.handover_at, now()),
      updated_at = now()
    WHERE t.id = NEW.sessao_id;
  ELSIF NEW.status = 'closed' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'closed') THEN
    UPDATE public.crm_chat_threads t
    SET
      status = 'closed',
      closed_at = COALESCE(t.closed_at, now()),
      resolved_at = COALESCE(t.resolved_at, now()),
      updated_at = now()
    WHERE t.id = NEW.sessao_id;
  ELSIF NEW.status = 'ai' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    UPDATE public.crm_chat_threads t
    SET status = 'ai', updated_at = now()
    WHERE t.id = NEW.sessao_id AND t.status IS DISTINCT FROM 'closed';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_conversas_thread_status ON public.crm_conversas;
CREATE TRIGGER trg_crm_conversas_thread_status
  AFTER INSERT OR UPDATE OF status ON public.crm_conversas
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_crm_conversas_thread_status();

COMMENT ON FUNCTION public.trg_crm_interacoes_thread_metrics() IS
  'Mantém message_count_* e first_response_at em crm_chat_threads.';
COMMENT ON FUNCTION public.trg_crm_conversas_thread_status() IS
  'Propaga status ai/human/closed para handover_at/closed_at na thread.';
