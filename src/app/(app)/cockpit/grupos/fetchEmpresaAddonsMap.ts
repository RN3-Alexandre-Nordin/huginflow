'use client'

import { createClient } from '@/utils/supabase/client'

/**
 * Mapa addon_codigo → enabled para filtrar a matriz de grupos.
 * Foundation do registry fica always-on no servidor; no client aproximamos:
 * linhas enabled=true + códigos sem linha (não bloqueia foundation).
 */
export async function fetchEmpresaAddonsMap(
  empresaId: string,
): Promise<Record<string, boolean> | null> {
  if (!empresaId) return null
  const supabase = createClient()

  const [{ data: registry }, { data: rows }] = await Promise.all([
    supabase.from('addon_registry').select('codigo, tipo, ativo').eq('ativo', true),
    supabase
      .from('empresa_addons')
      .select('addon_codigo, enabled')
      .eq('empresa_id', empresaId),
  ])

  const byCodigo = new Map(
    (rows || []).map((r) => [String(r.addon_codigo), Boolean(r.enabled)]),
  )

  const result: Record<string, boolean> = {}
  for (const item of registry || []) {
    const codigo = String(item.codigo)
    if (item.tipo === 'foundation') {
      result[codigo] = true
      continue
    }
    result[codigo] = byCodigo.get(codigo) === true
  }
  return result
}
