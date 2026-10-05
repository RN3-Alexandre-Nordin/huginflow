/** Uma série é uma unidade. Vários números podem vir separados por vírgula, ponto e vírgula ou quebra de linha. */
export function listarNumerosSerie(texto: string | null | undefined): string[] {
  if (!texto) return []
  return texto
    .split(/[\n,;]+/)
    .map((parte) => parte.trim())
    .filter(Boolean)
}

export function seriesConferemComQuantidade(
  texto: string | null | undefined,
  quantidade: number,
): { ok: true; numeros: string[] } | { ok: false; mensagem: string } {
  const numeros = listarNumerosSerie(texto)
  if (!Number.isInteger(quantidade) || quantidade < 1) {
    return {
      ok: false,
      mensagem: 'Cada série é uma unidade. A quantidade precisa ser um número inteiro maior que zero.',
    }
  }
  if (numeros.length !== quantidade) {
    return {
      ok: false,
      mensagem: `Informe uma série para cada unidade (${quantidade} no estoque, ${numeros.length} número(s) informado(s)).`,
    }
  }
  const vistos = new Set<string>()
  for (const numero of numeros) {
    const chave = numero.toLowerCase()
    if (vistos.has(chave)) {
      return { ok: false, mensagem: `A série ${numero} está repetida nesta entrada.` }
    }
    vistos.add(chave)
  }
  return { ok: true, numeros }
}
