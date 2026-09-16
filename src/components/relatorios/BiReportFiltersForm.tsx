import Link from 'next/link'

const inputCls =
  'w-full bg-[#0A0A0A] border border-[#ffffff15] rounded-xl px-3 py-2 text-xs text-white'

type Opt = { id: string; label: string }

type Props = {
  slug: string
  filterKeys: string[]
  values: Record<string, string>
  departamentos: Opt[]
  canais: Opt[]
  pipelines: Opt[]
  responsaveis?: Opt[]
}

export default function BiReportFiltersForm({
  slug,
  filterKeys,
  values,
  departamentos,
  canais,
  pipelines,
  responsaveis = [],
}: Props) {
  const has = (k: string) => filterKeys.includes(k)
  const formKey =
    Object.keys(values)
      .filter((k) => k !== 'offset')
      .sort()
      .map((k) => `${k}=${values[k] ?? ''}`)
      .join('&') || 'empty'

  return (
    <form
      key={formKey}
      method="get"
      action={`/cockpit/relatorios/${slug}`}
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
        {has('departamento') && (
          <label className="block text-[10px] uppercase tracking-wider text-gray-500">
            Departamento
            <select
              name="departamento_id"
              defaultValue={values.departamento_id || ''}
              className={`${inputCls} mt-1`}
            >
              <option value="">Todos</option>
              {departamentos.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {has('canal') && (
          <label className="block text-[10px] uppercase tracking-wider text-gray-500">
            Canal
            <select name="canal_id" defaultValue={values.canal_id || ''} className={`${inputCls} mt-1`}>
              <option value="">Todos</option>
              {canais.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {has('pipeline') && (
          <label className="block text-[10px] uppercase tracking-wider text-gray-500">
            Funil
            <select
              name="pipeline_id"
              defaultValue={values.pipeline_id || ''}
              className={`${inputCls} mt-1`}
            >
              <option value="">Todos</option>
              {pipelines.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {has('responsavel') && (
          <label className="block text-[10px] uppercase tracking-wider text-gray-500">
            Responsável
            <select
              name="responsavel_id"
              defaultValue={values.responsavel_id || ''}
              className={`${inputCls} mt-1`}
            >
              <option value="">Todos</option>
              {responsaveis.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {has('min_cards') && (
          <label className="block text-[10px] uppercase tracking-wider text-gray-500">
            Mín. cards (gargalo)
            <input
              type="number"
              name="min_cards"
              min={1}
              defaultValue={values.min_cards || '3'}
              className={`${inputCls} mt-1`}
            />
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
          href={`/cockpit/relatorios/${slug}`}
          className="rounded-xl px-4 py-2 text-xs text-gray-400 hover:text-white"
          replace
        >
          Limpar
        </Link>
      </div>
    </form>
  )
}
