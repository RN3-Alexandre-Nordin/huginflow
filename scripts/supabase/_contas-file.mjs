import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'

const CONTAS_CANDIDATES = ['Contas HuginFlow.txt', 'Contas Supabase.txt']

export function resolveContasFilePath(root) {
  const fromEnv = process.env.SUPABASE_CONTAS_FILE?.trim()
  if (fromEnv) {
    const envPath = resolve(root, fromEnv)
    if (existsSync(envPath)) return envPath
  }

  for (const name of CONTAS_CANDIDATES) {
    const candidate = resolve(root, name)
    if (existsSync(candidate)) return candidate
  }

  return null
}

export function readContasFile(root) {
  const path = resolveContasFilePath(root)
  if (!path) return null
  return readFileSync(path, 'utf8')
}
