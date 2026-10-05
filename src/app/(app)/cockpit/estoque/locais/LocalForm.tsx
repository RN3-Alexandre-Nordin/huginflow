'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Warehouse, Check, AlertCircle, Loader2, Sparkles } from 'lucide-react'

type Departamento = {
  id: string
  nome: string
}

type Empresa = {
  id: string
  nome: string
}

type LocalData = {
  id?: string
  empresa_id?: string
  codigo?: string
  nome?: string
  tipo?: string
  eh_principal?: boolean
  departamento_id?: string | null
  ativo?: boolean
}

type Props = {
  initialData?: LocalData
  departamentos: Departamento[]
  empresas?: Empresa[]
  isSuperAdmin?: boolean
  currentEmpresaId?: string
  onSubmitAction: (formData: FormData) => Promise<{ error?: string } | void>
  title: string
  subtitle: string
}

export default function LocalForm({
  initialData,
  departamentos,
  empresas = [],
  isSuperAdmin = false,
  currentEmpresaId,
  onSubmitAction,
  title,
  subtitle,
}: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [codigo, setCodigo] = useState(initialData?.codigo || '')
  const [nome, setNome] = useState(initialData?.nome || '')
  const [tipo, setTipo] = useState(initialData?.tipo || 'almoxarifado')
  const [ehPrincipal, setEhPrincipal] = useState(initialData?.eh_principal || false)
  const [departamentoId, setDepartamentoId] = useState(initialData?.departamento_id || '')
  const [ativo, setAtivo] = useState(initialData?.ativo !== false)
  const [empresaId, setEmpresaId] = useState(initialData?.empresa_id || currentEmpresaId || '')

  function handleCodigoChange(value: string) {
    const upper = value.toUpperCase()
    setCodigo(upper)
    if (upper === 'BRANCO') {
      setEhPrincipal(true)
      setTipo('principal')
      if (!nome) setNome('Estoque Principal')
    }
  }

  function handleAplicarBranco() {
    setCodigo('BRANCO')
    setNome('Estoque Principal')
    setTipo('principal')
    setEhPrincipal(true)
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const formData = new FormData()
    formData.append('codigo', codigo)
    formData.append('nome', nome)
    formData.append('tipo', tipo)
    if (ehPrincipal) formData.append('eh_principal', 'on')
    if (departamentoId) formData.append('departamento_id', departamentoId)
    formData.append('ativo', ativo ? 'true' : 'false')
    if (isSuperAdmin && empresaId) formData.append('empresa_id', empresaId)

    try {
      const res = await onSubmitAction(formData)
      if (res && 'error' in res && res.error) {
        setError(res.error)
        setLoading(false)
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('NEXT_REDIRECT')) {
        return
      }
      setError('Ocorreu um erro ao salvar o local. Tente novamente.')
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-20 font-sans">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-white">{title}</h1>
        <p className="text-xs text-gray-400">{subtitle}</p>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-400" />
          <p>{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="rounded-2xl border border-[#ffffff0a] bg-[#111111] p-6 shadow-xl space-y-5">
          {/* Seletor de empresa (Superadmin) */}
          {isSuperAdmin && (
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                Empresa (Tenant) <span className="text-red-400">*</span>
              </label>
              <select
                value={empresaId}
                onChange={(e) => setEmpresaId(e.target.value)}
                required
                className="w-full rounded-xl border border-[#ffffff15] bg-[#0A0A0A] px-3.5 py-2.5 text-sm text-white focus:border-[#2BAADF] focus:outline-none"
              >
                <option value="">Selecione uma empresa...</option>
                {empresas.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.nome}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Dica da convenção BRANCO */}
          {!initialData?.id && codigo !== 'BRANCO' && (
            <div className="flex items-center justify-between rounded-xl border border-[#2BAADF]/20 bg-[#2BAADF]/5 p-3.5 text-xs text-[#2BAADF]">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 shrink-0" />
                <span>
                  Sua empresa opera com um único estoque geral? Use a convenção do local <strong>BRANCO</strong>.
                </span>
              </div>
              <button
                type="button"
                onClick={handleAplicarBranco}
                className="rounded-lg bg-[#2BAADF]/20 px-2.5 py-1 text-xs font-semibold hover:bg-[#2BAADF]/30 transition"
              >
                Preencher BRANCO
              </button>
            </div>
          )}

          <div className="grid gap-5 sm:grid-cols-2">
            {/* Código */}
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                Código do Local <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={codigo}
                onChange={(e) => handleCodigoChange(e.target.value)}
                required
                placeholder="Ex: BRANCO, ALMOX-01, DEP-SUL"
                className="w-full rounded-xl border border-[#ffffff15] bg-[#0A0A0A] px-3.5 py-2.5 text-sm uppercase text-white placeholder-gray-600 focus:border-[#2BAADF] focus:outline-none"
              />
              <p className="mt-1 text-[11px] text-gray-500">
                Identificador único por empresa. Use <strong>BRANCO</strong> para o local geral padrão.
              </p>
            </div>

            {/* Nome */}
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                Nome do Local <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                required
                placeholder="Ex: Estoque Principal, Almoxarifado Matriz"
                className="w-full rounded-xl border border-[#ffffff15] bg-[#0A0A0A] px-3.5 py-2.5 text-sm text-white placeholder-gray-600 focus:border-[#2BAADF] focus:outline-none"
              />
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            {/* Tipo */}
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                Tipo do Local
              </label>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
                className="w-full rounded-xl border border-[#ffffff15] bg-[#0A0A0A] px-3.5 py-2.5 text-sm text-white focus:border-[#2BAADF] focus:outline-none"
              >
                <option value="principal">Principal / Central</option>
                <option value="almoxarifado">Almoxarifado</option>
                <option value="deposito">Depósito</option>
                <option value="loja">Loja / Ponto de Venda</option>
                <option value="outro">Outro</option>
              </select>
            </div>

            {/* Departamento Vinculado (opcional) */}
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                Departamento Responsável (Opcional)
              </label>
              <select
                value={departamentoId}
                onChange={(e) => setDepartamentoId(e.target.value)}
                className="w-full rounded-xl border border-[#ffffff15] bg-[#0A0A0A] px-3.5 py-2.5 text-sm text-white focus:border-[#2BAADF] focus:outline-none"
              >
                <option value="">Nenhum departamento vinculado</option>
                {departamentos.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Opções Booleanas */}
          <div className="space-y-3 pt-2 border-t border-[#ffffff0a]">
            {/* eh_principal */}
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={ehPrincipal}
                onChange={(e) => setEhPrincipal(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-700 bg-[#0A0A0A] text-[#2BAADF] focus:ring-[#2BAADF]"
              />
              <div>
                <span className="text-sm font-medium text-white flex items-center gap-1.5">
                  Local Principal da Empresa
                  {ehPrincipal && (
                    <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-500/20">
                      PADRÃO
                    </span>
                  )}
                </span>
                <p className="text-xs text-gray-500">
                  Usado automaticamente quando nenhuma localização de estoque for informada em entradas manuais ou notas fiscais (NFe).
                </p>
              </div>
            </label>

            {/* ativo */}
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={ativo}
                onChange={(e) => setAtivo(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-700 bg-[#0A0A0A] text-[#2BAADF] focus:ring-[#2BAADF]"
              />
              <div>
                <span className="text-sm font-medium text-white">Local Ativo</span>
                <p className="text-xs text-gray-500">
                  Desative este local para bloquear novos lançamentos físicos ou transferências.
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* Rodapé de Ações */}
        <div className="flex items-center justify-end gap-3">
          <Link
            href="/cockpit/estoque/locais"
            className="rounded-xl border border-[#ffffff10] px-4 py-2.5 text-sm font-medium text-gray-400 hover:bg-[#1a1a1a] hover:text-white transition"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#2BAADF] to-[#1A8FBF] px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#2BAADF]/20 hover:opacity-95 transition disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                Salvar Local
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
