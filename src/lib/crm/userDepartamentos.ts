import type { SupabaseClient } from '@supabase/supabase-js'

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

/**
 * Departamentos do usuário para ACL omnichannel / cards.
 * 1) usuarios_departamentos (explícito)
 * 2) fallback: departamentos dos funis do grupo (pipeline_grupo_acesso)
 *
 * NASU e tenants similares costumam não popular usuarios_departamentos —
 * sem o fallback, operador perde a thread do próprio depto após encaminhar o card.
 */
export async function getUserDepartamentoIds(
  supabase: SupabaseClient,
  userId: string,
  grupoId?: string | null,
): Promise<string[]> {
  const ids = new Set<string>()

  const { data: direct } = await supabase
    .from('usuarios_departamentos')
    .select('departamento_id')
    .eq('usuario_id', userId)

  for (const row of direct ?? []) {
    if (row.departamento_id) ids.add(row.departamento_id)
  }

  if (grupoId) {
    const { data: pipes } = await supabase
      .from('pipeline_grupo_acesso')
      .select('pipelines(departamento_id)')
      .eq('grupo_id', grupoId)

    for (const row of pipes ?? []) {
      const deptId =
        firstRelation(
          (row as { pipelines?: { departamento_id?: string | null } | { departamento_id?: string | null }[] | null })
            .pipelines,
        )?.departamento_id ?? null
      if (deptId) ids.add(deptId)
    }
  }

  return [...ids]
}
