const inputClass =
  'mt-1 w-full rounded-xl border border-[#ffffff14] bg-[#0A0A0A] px-3 py-2 text-sm text-white outline-none focus:border-[#2BAADF]/50 [color-scheme:dark]'

export default function PedidosFiltros({
  fornecedores,
  solicitantes,
  statusOpcoes,
  tipoOpcoes,
  motivoOpcoes,
  fornecedor,
  data,
  solicitante,
  status,
  busca = '',
  tipo = '',
  motivo = '',
  limparHref = '/cockpit/compras/pedidos',
  rotuloData = 'Data do pedido',
  rotuloBusca = 'Número',
}: {
  fornecedores: Array<{ id: string; nome: string }>
  solicitantes?: Array<{ id: string; nome: string }>
  statusOpcoes: Array<{ id: string; label: string }>
  tipoOpcoes?: Array<{ id: string; label: string }>
  motivoOpcoes?: Array<{ id: string; label: string }>
  fornecedor: string
  data: string
  solicitante?: string
  status: string
  busca?: string
  tipo?: string
  motivo?: string
  limparHref?: string
  rotuloData?: string
  rotuloBusca?: string
}) {
  return (
    <form method="get" className="grid gap-3 rounded-2xl border border-[#ffffff0a] bg-[#111111] p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <label className="block text-xs text-gray-400">
        {rotuloBusca}
        <input name="q" defaultValue={busca} placeholder="Trecho do número" className={inputClass} />
      </label>
      <label className="block text-xs text-gray-400">
        Fornecedor
        <select name="fornecedor" defaultValue={fornecedor} className={inputClass}>
          <option value="">Todos</option>
          {fornecedores.map((item) => (
            <option key={item.id} value={item.id}>
              {item.nome}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs text-gray-400">
        {rotuloData}
        <input type="date" name="data" defaultValue={data} className={inputClass} />
      </label>
      {solicitantes ? (
        <label className="block text-xs text-gray-400">
          Solicitante
          <select name="solicitante" defaultValue={solicitante || ''} className={inputClass}>
            <option value="">Todos</option>
            {solicitantes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nome}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {tipoOpcoes?.length ? (
        <label className="block text-xs text-gray-400">
          Tipo
          <select name="tipo" defaultValue={tipo} className={inputClass}>
            <option value="">Todos</option>
            {tipoOpcoes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {motivoOpcoes?.length ? (
        <label className="block text-xs text-gray-400">
          Motivo
          <select name="motivo" defaultValue={motivo} className={inputClass}>
            <option value="">Todos</option>
            {motivoOpcoes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="block text-xs text-gray-400">
        Status
        <select name="status" defaultValue={status} className={inputClass}>
          <option value="">Todos</option>
          {statusOpcoes.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-2">
        <button
          type="submit"
          className="rounded-xl bg-[#2BAADF] px-4 py-2 text-sm font-semibold text-white"
        >
          Filtrar
        </button>
        <a
          href={limparHref}
          className="rounded-xl border border-[#ffffff14] px-4 py-2 text-sm font-semibold text-gray-300"
        >
          Limpar
        </a>
      </div>
    </form>
  )
}
