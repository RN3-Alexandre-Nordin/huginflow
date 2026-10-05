const inputCls =
  'w-full bg-[#0A0A0A] border border-[#ffffff15] rounded-xl px-3 py-2 text-xs text-white'

type Props = {
  slug: string
  filterKeys: string[]
  values: Record<string, string>
}

export default function ComprasReportFiltersForm({ slug, filterKeys, values }: Props) {
  const has = (k: string) => filterKeys.includes(k)
  if (filterKeys.length === 0) return null

  const formKey =
    Object.keys(values)
      .sort()
      .map((k) => `${k}=${values[k] ?? ''}`)
      .join('&') || 'empty'

  return (
    <form
      key={formKey}
      method="get"
      action={`/cockpit/compras/relatorios/${slug}`}
      className="space-y-3 rounded-2xl border border-[#ffffff0a] bg-[#111111] p-4"
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
        {has('tipo') && (
          <label className="block text-[10px] uppercase tracking-wider text-gray-500">
            Tipo
            <select name="tipo" defaultValue={values.tipo || ''} className={`${inputCls} mt-1`}>
              <option value="">Todos</option>
              <option value="produtivo">Material produtivo</option>
              <option value="consumo">Consumo</option>
              <option value="servico">Serviço</option>
            </select>
          </label>
        )}
        {has('status') && (
          <label className="block text-[10px] uppercase tracking-wider text-gray-500">
            Status
            <select name="status" defaultValue={values.status || ''} className={`${inputCls} mt-1`}>
              <option value="">Todos</option>
              <option value="rascunho">Rascunho</option>
              <option value="confirmada">Confirmada</option>
              <option value="cancelada">Cancelada</option>
            </select>
          </label>
        )}
        {has('situacao') && (
          <label className="block text-[10px] uppercase tracking-wider text-gray-500">
            Situação
            <select name="situacao" defaultValue={values.situacao || 'em_uso'} className={`${inputCls} mt-1`}>
              <option value="em_uso">Em uso</option>
              <option value="em_estoque">Em estoque</option>
              <option value="em_terceiro">Em terceiro</option>
              <option value="baixada">Baixada</option>
              <option value="todos">Todas</option>
            </select>
          </label>
        )}
        {has('sku_codigo') && (
          <label className="block text-[10px] uppercase tracking-wider text-gray-500">
            SKU
            <input
              type="text"
              name="sku_codigo"
              defaultValue={values.sku_codigo || ''}
              placeholder="Código"
              className={`${inputCls} mt-1`}
            />
          </label>
        )}
      </div>
      <div className="flex justify-end gap-2">
        <a
          href={`/cockpit/compras/relatorios/${slug}`}
          className="rounded-xl px-3 py-2 text-xs text-gray-400 hover:text-white"
        >
          Limpar
        </a>
        <button
          type="submit"
          className="rounded-xl bg-[#2BAADF] px-4 py-2 text-xs font-semibold text-white"
        >
          Filtrar
        </button>
      </div>
    </form>
  )
}
