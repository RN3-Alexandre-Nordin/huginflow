-- Realtime para alertas de desconexão de canais inbound (modal no cockpit).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'crm_canais'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_canais;
  END IF;
END $$;
