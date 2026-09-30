'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import SearchableSelect from '@/components/SearchableSelect'
import { criarCotacaoDeSolicitacao } from '../actions'

export type SolicitacaoOption = {
  id: string
  numero: string
  tipoLabel: string
  solicitanteId: string
  solicitanteNome: string
  cotacaoAbertaId: string | null
  cotacaoAbertaNumero: string | null
}

type SolicitanteOption = { id: string; nome: string }

export default function NovaCotacaoForm({
  solicitacoes,
  solicitantes,
}: {
  solicitacoes: SolicitacaoOption[]
  solicitantes: SolicitanteOption[]
}) {
  const router = useRouter()
  const [solicitanteFiltro, setSolicitanteFiltro] = useState('')
  const [solicitacaoId, setSolicitacaoId] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const filtradas = useMemo(() => {
    if (!solicitanteFiltro) return solicitacoes
    return solicitacoes.filter((s) => s.solicitanteId === solicitanteFiltro)
  }, [solicitacoes, solicitanteFiltro])

  const selecionada = filtradas.find((s) => s.id === solicitacaoId) || null
  const jaTemCotacao = Boolean(selecionada?.cotacaoAbertaId)

  const options = filtradas.map((s) => ({
    value: s.id,
    label: s.cotacaoAbertaNumero
      ? `${s.numero} · ${s.tipoLabel} · ${s.solicitanteNome} · continuar ${s.cotacaoAbertaNumero}`
      : `${s.numero} · ${s.tipoLabel} · ${s.solicitanteNome}`,
    searchText: `${s.numero} ${s.tipoLabel} ${s.solicitanteNome} ${s.cotacaoAbertaNumero || ''}`,
  }))

  const solicitanteOptions = solicitantes.map((s) => ({
    id: s.id,
    nome: s.nome,
  }))

  return (
    <div className="overflow-hidden rounded-2xl border border-[#ffffff0a] bg-[#111111] shadow-2xl">
      <div className="border-b border-[#ffffff08] px-5 py-3.5 sm:px-6">
        <h3 className="text-base font-semibold text-white">Solicitação em aberto</h3>
        <p className="text-xs text-gray-500">
          Não lista as que já viraram pedido. Com cotação em andamento, você continua a
          existente (não cria outra).
        </p>
      </div>
      <div className="space-y-4 p-5 sm:p-6">
        {!solicitacoes.length ? (
          <p className="text-sm text-gray-500">
            Nenhuma solicitação em aberto. Registre uma em Solicitações.
          </p>
        ) : (
          <>
            <div className="block text-sm text-gray-300">
              <span className="mb-1 block">Filtrar por solicitante</span>
              <SearchableSelect
                value={solicitanteFiltro}
                onChange={(id) => {
                  setSolicitanteFiltro(id)
                  setSolicitacaoId('')
                }}
                options={[
                  { id: '', nome: 'Todos os solicitantes' },
                  ...solicitanteOptions,
                ]}
                placeholder="Todos os solicitantes…"
                emptyLabel="Nenhum solicitante"
              />
            </div>
            <div className="block text-sm text-gray-300">
              <span className="mb-1 block">Solicitação *</span>
              {filtradas.length ? (
                <SearchableSelect
                  value={solicitacaoId}
                  onChange={setSolicitacaoId}
                  options={options}
                  placeholder="Buscar número, tipo ou solicitante…"
                  emptyLabel="Nenhuma solicitação neste filtro"
                />
              ) : (
                <p className="mt-2 text-sm text-gray-500">
                  Nenhuma solicitação em aberto para este solicitante.
                </p>
              )}
            </div>
            {jaTemCotacao ? (
              <p className="rounded-xl border border-[#2BAADF]/25 bg-[#2BAADF]/10 px-3 py-2 text-xs text-[#2BAADF]">
                Já existe {selecionada?.cotacaoAbertaNumero}. Ao continuar, você reabre essa
                cotação (pode salvar e voltar depois).
              </p>
            ) : null}
          </>
        )}
        {erro ? <p className="text-sm text-red-400">{erro}</p> : null}
      </div>
      <div className="flex items-center justify-end border-t border-[#ffffff08] bg-[#0A0A0A]/90 px-6 py-4">
        <button
          type="button"
          disabled={pending || !solicitacaoId}
          onClick={() => {
            setErro(null)
            start(async () => {
              // Se já tem cotação aberta, vai direto nela
              if (selecionada?.cotacaoAbertaId) {
                router.push(`/cockpit/compras/cotacoes/${selecionada.cotacaoAbertaId}`)
                return
              }
              const res = await criarCotacaoDeSolicitacao(solicitacaoId)
              if (res.error || !res.id) {
                setErro(res.error || 'Falha ao abrir cotação.')
                return
              }
              router.push(`/cockpit/compras/cotacoes/${res.id}`)
              router.refresh()
            })
          }}
          className="rounded-xl bg-gradient-to-r from-[#2BAADF] to-[#1A8FBF] px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          {pending ? 'Abrindo…' : jaTemCotacao ? 'Continuar cotação' : 'Continuar'}
        </button>
      </div>
    </div>
  )
}
