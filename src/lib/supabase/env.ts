/** Credenciais Supabase no servidor — escolhe par URL + anon key com o mesmo project ref. */

function decodeJwtRef(jwt: string): string | null {
  try {
    const payload = JSON.parse(
      Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'),
    ) as { ref?: string }
    return payload.ref ?? null
  } catch {
    return null
  }
}

export function getSupabaseProjectRef(url: string): string | null {
  const match = url.match(/https:\/\/([^.]+)\.supabase\.co/)
  return match?.[1] ?? null
}

function unique(values: Array<string | undefined>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const v of values) {
    const t = v?.trim()
    if (!t || seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  return out
}

function pickAlignedCredentials(): { url: string; anonKey: string } {
  const urlCandidates = unique([
    process.env.SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  ])
  const keyCandidates = unique([
    process.env.SUPABASE_ANON_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  ])

  for (const url of urlCandidates) {
    const urlRef = getSupabaseProjectRef(url)
    for (const anonKey of keyCandidates) {
      const keyRef = decodeJwtRef(anonKey)
      if (urlRef && keyRef && urlRef === keyRef) {
        return { url, anonKey }
      }
    }
  }

  const url = urlCandidates[0]
  const anonKey = keyCandidates[0]
  if (!url || !anonKey) {
    throw new Error(
      'Supabase ausente: defina SUPABASE_URL e SUPABASE_ANON_KEY (ou NEXT_PUBLIC_* no build).',
    )
  }

  const urlRef = getSupabaseProjectRef(url)
  const keyRef = decodeJwtRef(anonKey)
  if (urlRef && keyRef && urlRef !== keyRef) {
    console.error(
      `[Supabase] URL ref (${urlRef}) ≠ anon key ref (${keyRef}) — usando primeiro par disponível.`,
    )
  }

  return { url, anonKey }
}

let cached: { url: string; anonKey: string } | null = null

function getCredentials() {
  if (!cached) cached = pickAlignedCredentials()
  return cached
}

export function getServerSupabaseUrl(): string {
  return getCredentials().url
}

export function getServerSupabaseAnonKey(): string {
  return getCredentials().anonKey
}

export function getSupabaseCredentialDiagnostics() {
  const url = getServerSupabaseUrl()
  const anonKey = getServerSupabaseAnonKey()
  const urlRef = getSupabaseProjectRef(url)
  const anonRef = decodeJwtRef(anonKey)
  return {
    urlRef,
    anonRef,
    keysAligned: Boolean(urlRef && anonRef && urlRef === anonRef),
  }
}

export { decodeJwtRef }
