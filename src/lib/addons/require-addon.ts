import { redirect } from 'next/navigation'
import { getMyProfile } from '@/lib/auth/getMyProfile'
import { empresaHasAddon } from '@/lib/addons/entitlements'

type Profile = NonNullable<Awaited<ReturnType<typeof getMyProfile>>>

/**
 * Gate de entitlement (eixo técnico `enabled`).
 * Superadmin RN3 não é bloqueado no menu/URL; dados continuam com `empresa_id`.
 * `commercial_status` NÃO corta acesso nesta entrega.
 */
export async function requireEmpresaAddons(options: {
  /** Todos os códigos devem estar enabled. */
  all?: string[]
  /** Pelo menos um dos códigos enabled. */
  any?: string[]
}): Promise<Profile> {
  const me = await getMyProfile()
  if (!me) redirect('/login')
  if (me.role_global === 'superadmin') return me

  const empresaId = me.empresa_id
  if (!empresaId) {
    redirect('/cockpit/acesso-negado?reason=addon')
  }

  if (options.any && options.any.length > 0) {
    for (const code of options.any) {
      if (await empresaHasAddon(empresaId, code)) return me
    }
    redirect('/cockpit/acesso-negado?reason=addon')
  }

  for (const code of options.all ?? []) {
    if (!(await empresaHasAddon(empresaId, code))) {
      redirect('/cockpit/acesso-negado?reason=addon')
    }
  }

  return me
}
