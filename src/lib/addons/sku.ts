/** SKU interno estável a partir do nome comercial. */
const RESERVED_CODIGOS = new Set(['financeiro'])

export function slugifyAddonCodigo(nome: string): string {
  const base = nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
    .slice(0, 48)

  const slug = base || 'addon'
  if (RESERVED_CODIGOS.has(slug)) {
    return `${slug}_addon`
  }
  return slug
}

export function isReservedAddonCodigo(codigo: string): boolean {
  return RESERVED_CODIGOS.has(codigo)
}
