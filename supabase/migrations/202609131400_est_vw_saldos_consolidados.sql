-- Performance SaaS: consolidação de saldos no Postgres (não no JS).
-- VIEW comum (não materializada): sempre refletindo est_saldos; security_invoker respeita RLS.

CREATE OR REPLACE VIEW public.est_vw_saldos_consolidados
WITH (security_invoker = true) AS
SELECT
  s.empresa_id,
  s.sku_id,
  sk.codigo AS sku_codigo,
  sk.nome AS sku_nome,
  sk.unidade_estoque,
  sk.ponto_reposicao,
  SUM(s.quantidade)::numeric(18, 4) AS quantidade,
  COUNT(*)::integer AS locais_count,
  MAX(s.updated_at) AS updated_at
FROM public.est_saldos s
JOIN public.cad_skus sk ON sk.id = s.sku_id
GROUP BY
  s.empresa_id,
  s.sku_id,
  sk.codigo,
  sk.nome,
  sk.unidade_estoque,
  sk.ponto_reposicao;

COMMENT ON VIEW public.est_vw_saldos_consolidados IS
  'Saldo total por SKU (SUM de est_saldos). VIEW comum — não cache; RLS via security_invoker.';

GRANT SELECT ON public.est_vw_saldos_consolidados TO authenticated, service_role;
