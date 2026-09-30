'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { confirmarCotacao } from '@/app/(app)/cockpit/compras/cotacoes/actions'

type Forn = {
  id: string
  nome: string
  prazo: string | null
  condicao: string | null
}
type Item = {
  id: string
  descricao: string
  quantidade: number
  unidade: string
  vencedor_fornecedor_id: string | null
}
type Preco = { cotacao_item_id: string; fornecedor_id: string; preco_unitario: number }

type Props = {
  cotacaoId: string
  status: string
  itens: Item[]
  fornecedores: Forn[]
  propostas: Preco[]
  somenteLeitura: boolean
}

function formatMoney(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function CompararVencedorForm({
  cotacaoId,
  status,
  itens,
  fornecedores,
  propostas,
  somenteLeitura,
}: Props) {
  const router = useRouter()
  const precoMap = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of propostas) {
      m.set(`${p.cotacao_item_id}:${p.fornecedor_id}`, Number(p.preco_unitario))
    }
    return m
  }, [propostas])

  const totais = useMemo(() => {
    return fornecedores.map((f) => {
      let soma = 0
      let preenchidos = 0
      for (const it of itens) {
        const unit = precoMap.get(`${it.id}:${f.id}`)
        if (unit == null) continue
        preenchidos += 1
        soma += unit * Number(it.quantidade)
      }
      return {
        id: f.id,
        nome: f.nome,
        soma,
        completo: itens.length > 0 && preenchidos === itens.length,
        preenchidos,
      }
    })
  }, [fornecedores, itens, precoMap])

  const menorTotal = useMemo(() => {
    const completos = totais.filter((t) => t.completo)
    if (!completos.length) return null
    return completos.reduce((best, t) => (t.soma < best.soma ? t : best))
  }, [totais])

  const [vencedores, setVencedores] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {}
    const completos = fornecedores
      .map((f) => {
        let soma = 0
        let ok = true
        for (const it of itens) {
          const unit = precoMap.get(`${it.id}:${f.id}`)
          if (unit == null) {
            ok = false
            break
          }
          soma += unit * Number(it.quantidade)
        }
        return ok ? { id: f.id, soma } : null
      })
      .filter((x): x is { id: string; soma: number } => Boolean(x))
    const pacote = completos.length
      ? completos.reduce((best, t) => (t.soma < best.soma ? t : best))
      : null

    for (const it of itens) {
      if (it.vencedor_fornecedor_id && precoMap.has(`${it.id}:${it.vencedor_fornecedor_id}`)) {
        map[it.id] = it.vencedor_fornecedor_id
        continue
      }
      if (pacote) {
        map[it.id] = pacote.id
        continue
      }
      let best: { id: string; preco: number } | null = null
      for (const f of fornecedores) {
        const preco = precoMap.get(`${it.id}:${f.id}`)
        if (preco == null) continue
        if (!best || preco < best.preco) best = { id: f.id, preco }
      }
      if (best) map[it.id] = best.id
    }
    return map
  })
  const [erro, setErro] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const ok = itens.every((it) => {
    const fid = vencedores[it.id]
    return fid && precoMap.has(`${it.id}:${fid}`)
  })

  function elegerMenorTotal() {
    if (!menorTotal) return
    setVencedores(Object.fromEntries(itens.map((it) => [it.id, menorTotal.id])))
  }

  function confirmar() {
    setErro(null)
    if (!ok) {
      setErro('Defina o vencedor de cada item (com preço).')
      return
    }
    start(async () => {
      const fd = new FormData()
      fd.set('cotacao_id', cotacaoId)
      fd.set('vencedores_json', JSON.stringify(vencedores))
      const res = await confirmarCotacao(fd)
      if (res.error) {
        setErro(res.error)
        return
      }
      router.push('/cockpit/compras/pedidos')
      router.refresh()
    })
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[#ffffff0a] bg-[#111111] shadow-2xl">
      <div className="border-b border-[#ffffff08] px-5 py-3.5 sm:px-6">
        <h3 className="text-base font-semibold text-white">Comparar propostas</h3>
        <p className="text-xs text-gray-500">
          Colunas = fornecedores. Clique no preço para eleger aquele item. O menor custo total
          soma os {itens.length} itens.
        </p>
        {menorTotal ? (
          <p className="mt-2 text-sm text-emerald-400">
            Menor custo total: {menorTotal.nome} — {formatMoney(menorTotal.soma)}
          </p>
        ) : (
          <p className="mt-2 text-sm text-amber-300/90">
            Nenhum fornecedor cotou todos os itens — o total completo ainda não fecha.
          </p>
        )}
      </div>

      <div className="min-h-[16rem] p-3 sm:p-4">
        {erro ? <p className="mb-3 text-sm text-red-400">{erro}</p> : null}
        {status === 'confirmada' ? (
          <p className="mb-3 text-sm text-emerald-400">Cotação confirmada — pedidos gerados.</p>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[42rem] border-separate border-spacing-0 text-left text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 min-w-[14rem] bg-[#111111] px-3 py-3 text-xs uppercase tracking-wide text-gray-500">
                  Item
                </th>
                {fornecedores.map((f) => {
                  const tot = totais.find((t) => t.id === f.id)
                  const ehMenor = menorTotal?.id === f.id
                  return (
                    <th
                      key={f.id}
                      className={`min-w-[11rem] px-3 py-3 align-top ${
                        ehMenor ? 'bg-emerald-500/10' : ''
                      }`}
                    >
                      <span className="block text-sm font-semibold text-white">{f.nome}</span>
                      {ehMenor ? (
                        <span className="mt-1 inline-block rounded-md bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
                          Menor total
                        </span>
                      ) : null}
                      <span className="mt-2 block text-[11px] font-normal normal-case text-gray-400">
                        Prazo: {f.prazo || '—'}
                      </span>
                      <span className="block text-[11px] font-normal normal-case text-gray-400">
                        Pagamento: {f.condicao || '—'}
                      </span>
                      <span className="mt-1 block text-[11px] font-normal text-gray-500">
                        {tot?.preenchidos}/{itens.length} preços
                      </span>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {itens.map((it) => {
                let menorUnit: number | null = null
                for (const f of fornecedores) {
                  const unit = precoMap.get(`${it.id}:${f.id}`)
                  if (unit == null) continue
                  if (menorUnit == null || unit < menorUnit) menorUnit = unit
                }
                return (
                  <tr key={it.id}>
                    <td className="sticky left-0 z-10 border-t border-[#ffffff08] bg-[#111111] px-3 py-1.5">
                      <span className="block truncate text-sm text-white" title={it.descricao}>
                        {it.descricao}
                        <span className="ml-2 text-xs font-normal text-gray-500">
                          {it.quantidade} {it.unidade}
                        </span>
                      </span>
                    </td>
                    {fornecedores.map((f) => {
                      const unit = precoMap.get(`${it.id}:${f.id}`)
                      const selected = vencedores[it.id] === f.id
                      const ehMenorLinha = unit != null && unit === menorUnit
                      const linha = unit != null ? unit * Number(it.quantidade) : null
                      return (
                        <td
                          key={f.id}
                          className={`border-t border-[#ffffff08] px-2 py-1 ${
                            menorTotal?.id === f.id ? 'bg-emerald-500/5' : ''
                          }`}
                        >
                          {unit == null ? (
                            <span className="block px-2 py-1 text-gray-600">—</span>
                          ) : (
                            <button
                              type="button"
                              disabled={somenteLeitura}
                              onClick={() =>
                                setVencedores((prev) => ({ ...prev, [it.id]: f.id }))
                              }
                              title={
                                ehMenorLinha
                                  ? `Menor unitário · linha ${linha != null ? formatMoney(linha) : ''}`
                                  : `Linha ${linha != null ? formatMoney(linha) : ''}`
                              }
                              className={`flex w-full items-baseline justify-between gap-2 rounded-lg border px-2 py-1 text-left text-sm transition ${
                                selected
                                  ? 'border-[#2BAADF]/50 bg-[#2BAADF]/15 text-[#2BAADF]'
                                  : ehMenorLinha
                                    ? 'border-emerald-500/30 text-emerald-200 hover:bg-emerald-500/10'
                                    : 'border-[#ffffff14] text-gray-300 hover:bg-[#ffffff08]'
                              }`}
                            >
                              <span className="font-semibold">{formatMoney(unit)}</span>
                              <span className="shrink-0 text-[10px] text-gray-500">
                                {linha != null ? formatMoney(linha) : ''}
                                {ehMenorLinha ? ' · menor' : ''}
                              </span>
                            </button>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className="sticky left-0 z-10 border-t border-[#ffffff14] bg-[#111111] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Custo total
                </td>
                {totais.map((t) => (
                  <td
                    key={t.id}
                    className={`border-t border-[#ffffff14] px-3 py-2 ${
                      menorTotal?.id === t.id ? 'bg-emerald-500/10' : ''
                    }`}
                  >
                    <span
                      className={`text-sm font-semibold ${
                        menorTotal?.id === t.id ? 'text-emerald-300' : 'text-white'
                      }`}
                    >
                      {t.preenchidos ? formatMoney(t.soma) : '—'}
                    </span>
                    <span className="ml-2 text-[10px] text-gray-500">
                      {t.completo ? 'completa' : `${t.preenchidos}/${itens.length}`}
                    </span>
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#ffffff08] bg-[#0A0A0A]/90 px-6 py-4">
        <Link href={`/cockpit/compras/cotacoes/${cotacaoId}`} className="text-sm text-[#2BAADF]">
          Voltar ao hub
        </Link>
        {!somenteLeitura && status !== 'confirmada' ? (
          <div className="flex flex-wrap gap-2">
            {menorTotal ? (
              <button
                type="button"
                onClick={elegerMenorTotal}
                className="rounded-xl border border-emerald-500/30 px-4 py-2.5 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/10"
              >
                Eleger menor custo total
              </button>
            ) : null}
            <Link
              href="/cockpit/compras/cotacoes"
              className="rounded-xl border border-[#ffffff14] px-5 py-2.5 text-sm font-semibold text-gray-300"
            >
              Sair sem gerar
            </Link>
            <button
              type="button"
              disabled={pending || !ok}
              onClick={confirmar}
              className="rounded-xl bg-gradient-to-r from-[#2BAADF] to-[#1A8FBF] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              {pending ? 'Gerando…' : 'Confirmar e gerar pedidos'}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
