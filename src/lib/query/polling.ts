/** Intervalo de polling dos dashboards — mais lento em dev para aliviar o ambiente local. */
export function getDashboardRefetchInterval(): number {
  return process.env.NODE_ENV === 'development' ? 120_000 : 30_000
}
