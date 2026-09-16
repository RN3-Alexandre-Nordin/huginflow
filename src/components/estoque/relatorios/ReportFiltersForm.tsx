import Link from 'next/link'

const inputCls =
  'w-full bg-[#0A0A0A] border border-[#ffffff15] rounded-xl px-3 py-2 text-xs text-white'

type Opt = { id: string; label: string }

type Props = {
  slug: string
  filterKeys: string[]
  values: Record<string, string>
  locais: Opt[]
  familias: Opt[]
  terceiros?: Opt[]
}

export default function ReportFiltersForm({
  slug,
  filterKeys,
  values,
  locais,
  familias,
  terceiros = [],
}: Props) {
  const has = (k: string) => filterKeys.includes(k)
  // Remonta inputs ao limpar/aplicar (defaultValue não atualiza sozinho)
  const formKey =
    Object.keys(values)
      .sort()
      .map((k) => `${k}=${values[k] ?? ''}`)
      .join('&') || 'empty'

  return (
    <form
      key={formKey}
      method="get"
      action={`/cockpit/estoque/relatorios/${slug}`}
      className="rounded-2xl border border-[#ffffff0a] bg-[#111111] p-4 space-y-3"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {has('periodo') && (
          <>
            <label className="block text-[10px] uppercase tracking-wider text-gray-500">
              Data início
              <input
                type="date"
                name="data_inicio"
                defaultValue={values.data_inicio || ''}
                className={`${inputCls} mt-1`}
              />
            </label>
            <label className="block text-[10px] uppercase tracking-wider text-gray-500">
              Data fim
              <input
                type="date"
                name="data_fim"
                defaultValue={values.data_fim || ''}
                className={`${inputCls} mt-1`}
              />
            </label>
          </>
        )}
        {has('dias_sem_movimento') && (
          <label className="block text-[10px] uppercase tracking-wider text-gray-500">
            Dias sem saída
            <input
              type="number"
              name="dias_sem_movimento"
              min={1}
              defaultValue={values.dias_sem_movimento || '60'}
              className={`${inputCls} mt-1`}
            />
          </label>
        )}
        {has('local') && (
          <label className="block text-[10px] uppercase tracking-wider text-gray-500">
            Local
            <select name="local_id" defaultValue={values.local_id || ''} className={`${inputCls} mt-1`}>
              <option value="">Todos</option>
              {locais.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {has('sku_codigo') && (
          <label className="block text-[10px] uppercase tracking-wider text-gray-500">
            Código SKU
            <input
              name="sku_codigo"
              defaultValue={values.sku_codigo || ''}
              placeholder="Ex.: CERV"
              className={`${inputCls} mt-1`}
            />
          </label>
        )}
        {has('familia') && (
          <label className="block text-[10px] uppercase tracking-wider text-gray-500">
            Família
            <select
              name="familia_id"
              defaultValue={values.familia_id || ''}
              className={`${inputCls} mt-1`}
            >
              <option value="">Todas</option>
              {familias.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {has('criterio_critico') && (
          <label className="block text-[10px] uppercase tracking-wider text-gray-500">
            Critério
            <select
              name="criterio_critico"
              defaultValue={values.criterio_critico || 'todos'}
              className={`${inputCls} mt-1`}
            >
              <option value="todos">Todos críticos</option>
              <option value="zerado">Zerados</option>
              <option value="minimo">Abaixo do mínimo</option>
              <option value="ponto">No ponto de reposição</option>
            </select>
          </label>
        )}
        {has('status_req') && (
          <label className="block text-[10px] uppercase tracking-wider text-gray-500">
            Status requisição
            <select
              name="status_req"
              defaultValue={values.status_req || ''}
              className={`${inputCls} mt-1`}
            >
              <option value="">Todos</option>
              <option value="aprovada">Aprovada</option>
              <option value="atendida_parcial">Parcial</option>
              <option value="atendida_total">Total</option>
              <option value="pendente_aprovacao">Pendente aprovação</option>
              <option value="rascunho">Rascunho</option>
            </select>
          </label>
        )}
        {has('origem_req') && (
          <label className="block text-[10px] uppercase tracking-wider text-gray-500">
            Origem req.
            <select
              name="origem_req"
              defaultValue={values.origem_req || ''}
              className={`${inputCls} mt-1`}
            >
              <option value="">Todas</option>
              <option value="manual">Manual</option>
              <option value="planilha">Planilha</option>
            </select>
          </label>
        )}
        {has('origem_saida') && (
          <label className="block text-[10px] uppercase tracking-wider text-gray-500">
            Origem saída
            <select
              name="origem_saida"
              defaultValue={values.origem_saida || ''}
              className={`${inputCls} mt-1`}
            >
              <option value="">Todas</option>
              <option value="retirada">Retirada</option>
              <option value="requisicao">Requisição</option>
            </select>
          </label>
        )}
        {has('terceiro') && (
          <label className="block text-[10px] uppercase tracking-wider text-gray-500">
            Terceiro
            <select
              name="terceiro_id"
              defaultValue={values.terceiro_id || ''}
              className={`${inputCls} mt-1`}
            >
              <option value="">Todos</option>
              {terceiros.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {has('status_remessa') && (
          <label className="block text-[10px] uppercase tracking-wider text-gray-500">
            Status remessa
            <select
              name="status_remessa"
              defaultValue={values.status_remessa || ''}
              className={`${inputCls} mt-1`}
            >
              <option value="">Todos</option>
              <option value="aberta">Aberta</option>
              <option value="parcial">Parcial</option>
              <option value="fechada">Fechada</option>
            </select>
          </label>
        )}
        {has('sinal_ajuste') && (
          <label className="block text-[10px] uppercase tracking-wider text-gray-500">
            Sinal ajuste
            <select
              name="sinal_ajuste"
              defaultValue={values.sinal_ajuste || ''}
              className={`${inputCls} mt-1`}
            >
              <option value="">Ambos</option>
              <option value="positivo">Positivo</option>
              <option value="negativo">Negativo</option>
            </select>
          </label>
        )}
        {has('so_com_saldo') && (
          <label className="flex items-end gap-2 text-xs text-gray-300 pb-2">
            <input
              type="checkbox"
              name="so_com_saldo"
              value="1"
              defaultChecked={values.so_com_saldo !== '0'}
              className="rounded border-gray-600"
            />
            Só com saldo &gt; 0
          </label>
        )}
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          className="rounded-xl bg-[#2BAADF] px-4 py-2 text-xs font-semibold text-white"
        >
          Aplicar filtros
        </button>
        <Link
          href={`/cockpit/estoque/relatorios/${slug}`}
          className="rounded-xl px-4 py-2 text-xs text-gray-400 hover:text-white"
          replace
        >
          Limpar
        </Link>
      </div>
      {/* Aplicar filtros sempre volta à 1ª página (offset não vai no form) */}
    </form>
  )
}
