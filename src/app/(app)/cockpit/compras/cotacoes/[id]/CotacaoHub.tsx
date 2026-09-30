'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Pencil, Trash2 } from 'lucide-react'
import SearchableSelect from '@/components/SearchableSelect'
import { adicionarFornecedorCotacao, removerFornecedorCotacao } from '@/app/(app)/cockpit/compras/cotacoes/actions'

export type HubFornecedor = {
  fornecedor_id: string
  nome: string
  documento?: string | null
  prazo_texto: string | null
  condicao_texto: string | null
  precosPreenchidos: number
  totalItens: number
}

type CadastroOption = { id: string; nome: string; documento?: string | null }

type Props = {
  cotacaoId: string
  status: string
  fornecedores: HubFornecedor[]
  cadastro: CadastroOption[]
  totalItens: number
  podeComparar: boolean
  somenteLeitura: boolean
}

export default function CotacaoHub({
  cotacaoId,
  status,
  fornecedores,
  cadastro,
  totalItens,
  podeComparar,
  somenteLeitura,
}: Props) {
  const router = useRouter()
  const [showAdd, setShowAdd] = useState(false)
  const [fornecedorId, setFornecedorId] = useState('')
  const [prazo, setPrazo] = useState('')
  const [condicao, setCondicao] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const usados = new Set(fornecedores.map((f) => f.fornecedor_id))
  const opcoes = cadastro
    .filter((c) => !usados.has(c.id))
    .map((c) => ({
      value: c.id,
      label: c.documento ? `${c.nome} · ${c.documento}` : c.nome,
    }))

  const inputClass =
    'mt-1 w-full rounded-xl border border-[#ffffff14] bg-[#0A0A0A] px-3 py-2 text-white outline-none focus:border-[#2BAADF]/50'

  function adicionar() {
    setErro(null)
    if (!fornecedorId) {
      setErro('Selecione o fornecedor.')
      return
    }
    start(async () => {
      const fd = new FormData()
      fd.set('cotacao_id', cotacaoId)
      fd.set('fornecedor_id', fornecedorId)
      if (prazo.trim()) fd.set('prazo_texto', prazo.trim())
      if (condicao.trim()) fd.set('condicao_texto', condicao.trim())
      const res = await adicionarFornecedorCotacao(fd)
      if (res.error) {
        setErro(res.error)
        return
      }
      setShowAdd(false)
      setFornecedorId('')
      setPrazo('')
      setCondicao('')
      router.refresh()
      if (res.fornecedor_id) {
        router.push(`/cockpit/compras/cotacoes/${cotacaoId}/proposta/${res.fornecedor_id}`)
      }
    })
  }

  function remover(fid: string, nome: string) {
    setErro(null)
    if (!confirm(`Remover ${nome} desta cotação? Os preços dele serão apagados.`)) return
    start(async () => {
      const res = await removerFornecedorCotacao(cotacaoId, fid)
      if (res.error) {
        setErro(res.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#ffffff0a] bg-[#111111] p-5">
        <h3 className="text-base font-semibold text-white">Propostas por fornecedor</h3>
        <p className="mt-1 text-xs text-gray-500">
          Até 3. Cada um tem tela própria de preços (lista vertical). Depois compare e eleja o
          vencedor.
        </p>

        {erro ? <p className="mt-3 text-sm text-red-400">{erro}</p> : null}

        <div className="mt-4 space-y-3">
          {fornecedores.map((f) => (
            <div
              key={f.fornecedor_id}
              className="rounded-xl border border-[#ffffff0a] bg-[#0A0A0A]/60 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-white">{f.nome}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    {f.precosPreenchidos}/{f.totalItens} preços
                    {f.prazo_texto ? ` · Prazo: ${f.prazo_texto}` : ''}
                    {f.condicao_texto ? ` · Cond.: ${f.condicao_texto}` : ''}
                  </p>
                  <div className="mt-2 h-1.5 max-w-xs overflow-hidden rounded-full bg-[#ffffff10]">
                    <div
                      className="h-full rounded-full bg-[#2BAADF]"
                      style={{
                        width: `${f.totalItens ? (100 * f.precosPreenchidos) / f.totalItens : 0}%`,
                      }}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/cockpit/compras/cotacoes/${cotacaoId}/proposta/${f.fornecedor_id}`}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[#ffffff14] px-3 py-2 text-xs font-semibold text-gray-200 hover:bg-[#ffffff08]"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    {somenteLeitura ? 'Ver preços' : 'Preencher preços'}
                  </Link>
                  {!somenteLeitura ? (
                    <button
                      type="button"
                      disabled={pending}
                      title="Remover"
                      onClick={() => remover(f.fornecedor_id, f.nome)}
                      className="rounded-lg p-2 text-gray-500 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ))}

          {!fornecedores.length ? (
            <p className="text-sm text-gray-500">Nenhum fornecedor ainda. Adicione o primeiro.</p>
          ) : null}
        </div>

        {!somenteLeitura && fornecedores.length < 3 ? (
          <div className="mt-4">
            {!showAdd ? (
              <button
                type="button"
                onClick={() => setShowAdd(true)}
                className="text-sm text-[#2BAADF] hover:underline"
              >
                + Adicionar fornecedor
              </button>
            ) : (
              <div className="space-y-3 rounded-xl border border-[#2BAADF]/25 bg-[#2BAADF]/5 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#2BAADF]">
                  Novo fornecedor
                </p>
                <SearchableSelect
                  value={fornecedorId}
                  onChange={setFornecedorId}
                  options={opcoes}
                  placeholder="Buscar fornecedor…"
                  emptyLabel="Nenhum fornecedor disponível"
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-xs text-gray-500">
                    Prazo
                    <input
                      className={inputClass}
                      value={prazo}
                      onChange={(e) => setPrazo(e.target.value)}
                      placeholder="Ex.: 15 dias"
                    />
                  </label>
                  <label className="block text-xs text-gray-500">
                    Condição
                    <input
                      className={inputClass}
                      value={condicao}
                      onChange={(e) => setCondicao(e.target.value)}
                      placeholder="Ex.: 28 DDL"
                    />
                  </label>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAdd(false)}
                    className="rounded-xl border border-[#ffffff14] px-4 py-2 text-sm text-gray-300"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={pending || !fornecedorId}
                    onClick={adicionar}
                    className="rounded-xl bg-gradient-to-r from-[#2BAADF] to-[#1A8FBF] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                  >
                    {pending ? 'Incluindo…' : 'Incluir e preencher preços'}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Link
          href="/cockpit/compras/cotacoes"
          className="rounded-xl border border-[#ffffff14] px-5 py-2.5 text-sm font-semibold text-gray-300 hover:bg-[#ffffff08]"
        >
          Voltar à lista
        </Link>
        {status !== 'confirmada' ? (
          <Link
            href={`/cockpit/compras/cotacoes/${cotacaoId}/vencedor`}
            className={`rounded-xl px-5 py-2.5 text-sm font-semibold text-white ${
              podeComparar
                ? 'bg-gradient-to-r from-[#2BAADF] to-[#1A8FBF]'
                : 'pointer-events-none bg-[#ffffff14] text-gray-500'
            }`}
            title={
              podeComparar
                ? undefined
                : `Cada item precisa de ao menos um preço (${totalItens} itens).`
            }
          >
            Comparar e eleger vencedor
          </Link>
        ) : (
          <Link
            href={`/cockpit/compras/cotacoes/${cotacaoId}/vencedor`}
            className="rounded-xl border border-[#ffffff14] px-5 py-2.5 text-sm font-semibold text-gray-300"
          >
            Ver vencedores
          </Link>
        )}
      </div>
    </div>
  )
}
