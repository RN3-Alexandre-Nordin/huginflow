-- RN3 global test agent runs (módulo /cockpit/testes — só superadmin)

CREATE TABLE IF NOT EXISTS public.test_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'passed', 'failed', 'cancelled', 'error')),
  suite text NOT NULL DEFAULT 'e2e-core',
  headed boolean NOT NULL DEFAULT false,
  base_url text,
  commit_sha text,
  passed int NOT NULL DEFAULT 0,
  failed int NOT NULL DEFAULT 0,
  skipped int NOT NULL DEFAULT 0,
  triggered_by uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  report_path text,
  events_path text,
  summary_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_test_runs_started_at ON public.test_runs (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_test_runs_status ON public.test_runs (status);

ALTER TABLE public.test_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "test_runs_superadmin_all" ON public.test_runs;
CREATE POLICY "test_runs_superadmin_all" ON public.test_runs
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.role_global = 'superadmin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.role_global = 'superadmin'
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.test_runs TO authenticated;
GRANT ALL ON public.test_runs TO service_role;
