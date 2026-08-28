/** Credenciais Supabase no servidor — SUPABASE_* (runtime Docker) tem prioridade sobre NEXT_PUBLIC_* (build). */
export function getServerSupabaseUrl(): string {
  const url =
    process.env.SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  if (!url) {
    throw new Error('Supabase URL ausente (SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_URL).')
  }
  return url
}

export function getServerSupabaseAnonKey(): string {
  const key =
    process.env.SUPABASE_ANON_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  if (!key) {
    throw new Error('Supabase anon key ausente (SUPABASE_ANON_KEY ou NEXT_PUBLIC_SUPABASE_ANON_KEY).')
  }
  return key
}

export function getSupabaseProjectRef(url?: string): string | null {
  const target = url ?? getServerSupabaseUrl()
  const match = target.match(/https:\/\/([^.]+)\.supabase\.co/)
  return match?.[1] ?? null
}
