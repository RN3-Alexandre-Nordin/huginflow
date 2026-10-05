export const UUID_FILTRO =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Trecho seguro para `ilike`. Remove curingas do Postgres. */
export function textoFiltro(raw: string | undefined) {
  return (raw || '')
    .trim()
    .slice(0, 40)
    .replace(/[%_\\,()]/g, '')
}

export function dataFiltroIso(raw: string | undefined) {
  return /^\d{4}-\d{2}-\d{2}$/.test(raw || '') ? raw! : ''
}

export function diaIntervalo(isoDate: string) {
  const inicio = new Date(`${isoDate}T00:00:00-03:00`)
  const fim = new Date(inicio.getTime() + 24 * 60 * 60 * 1000)
  return { inicio: inicio.toISOString(), fim: fim.toISOString() }
}
