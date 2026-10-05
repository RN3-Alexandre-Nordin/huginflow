-- Fiscal SKU: campos da reforma tributária (IBS / CBS / IS) + NBS

ALTER TABLE public.cad_skus
  ADD COLUMN IF NOT EXISTS nbs text,
  ADD COLUMN IF NOT EXISTS class_trib_ibs_cbs text,
  ADD COLUMN IF NOT EXISTS cst_ibs text,
  ADD COLUMN IF NOT EXISTS cst_cbs text,
  ADD COLUMN IF NOT EXISTS cst_is text,
  ADD COLUMN IF NOT EXISTS aliq_ibs numeric(8, 4),
  ADD COLUMN IF NOT EXISTS aliq_ibs_uf numeric(8, 4),
  ADD COLUMN IF NOT EXISTS aliq_ibs_mun numeric(8, 4),
  ADD COLUMN IF NOT EXISTS aliq_cbs numeric(8, 4),
  ADD COLUMN IF NOT EXISTS aliq_is numeric(8, 4),
  ADD COLUMN IF NOT EXISTS perc_red_ibs numeric(8, 4),
  ADD COLUMN IF NOT EXISTS perc_red_cbs numeric(8, 4);

COMMENT ON COLUMN public.cad_skus.nbs IS 'Nomenclatura Brasileira de Serviços (reforma / serviços)';
COMMENT ON COLUMN public.cad_skus.class_trib_ibs_cbs IS 'cClassTrib IBS/CBS';
COMMENT ON COLUMN public.cad_skus.aliq_ibs IS 'Alíquota IBS total % (quando não segregada)';
COMMENT ON COLUMN public.cad_skus.aliq_ibs_uf IS 'Alíquota IBS estadual %';
COMMENT ON COLUMN public.cad_skus.aliq_ibs_mun IS 'Alíquota IBS municipal %';
COMMENT ON COLUMN public.cad_skus.aliq_cbs IS 'Alíquota CBS %';
COMMENT ON COLUMN public.cad_skus.aliq_is IS 'Alíquota Imposto Seletivo %';
