'use client'

import { useState, useTransition } from 'react'
import { salvarConfigCompras } from '../actions'

type Grupo = { id: string; nome: string }

const SECTIONS = [
  {
    id: 'alcada',
    label: 'Alçada',
    hint: 'Dois valores e o grupo de cada nível',
  },
  {
    id: 'recebimento',
    label: 'Recebimento',
    hint: 'Caixa nossa ou recebimento de importados',
  },
] as const

const inputClass =
  'mt-1 w-full rounded-xl border border-[#ffffff14] bg-[#0A0A0A] px-3 py-2 text-white outline-none focus:border-[#2BAADF]/50'

export default function ComprasConfigForm({
  grupos,
  locais,
  config,
}: {
  grupos: Grupo[]
  locais: { id: string; codigo: string; nome: string }[]
  config: {
    aprovacao_ativa: boolean
    nivel1_grupo_id: string | null
    nivel1_teto: number | null
    nivel2_grupo_id: string | null
    nivel2_a_partir: number | null
    recebimento_por_caixa: boolean
    caixa_proximo: number
    recebimento_importados: boolean
    importados_limpeza: string
    importados_agenda: string | null
    impressora_etiqueta: string
    local_entrada_id: string | null
  } | null
}) {
  const [aba, setAba] = useState<(typeof SECTIONS)[number]['id']>('alcada')
  const [porCaixa, setPorCaixa] = useState(config?.recebimento_por_caixa ?? false)
  const [importados, setImportados] = useState(config?.recebimento_importados ?? false)
  const [limpeza, setLimpeza] = useState(config?.importados_limpeza || 'baixa_manual')
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const [pending, start] = useTransition()

  function submit(formData: FormData) {
    setErro(null)
    setOk(false)
    start(async () => {
      const res = await salvarConfigCompras(formData)
      if (res.error) {
        setErro(res.error)
        return
      }
      setOk(true)
    })
  }

  return (
    <form action={submit} className="overflow-hidden rounded-2xl border border-[#ffffff0a] bg-[#111111]">
      <div className="border-b border-[#ffffff0a] bg-[#0A0A0A]/80 px-3 pt-3 pb-2">
        <p className="mb-2 px-1 text-[10px] font-black uppercase tracking-widest text-gray-600">
          Seções
        </p>
        <nav className="grid grid-cols-1 gap-1.5 sm:grid-cols-2" role="tablist">
          {SECTIONS.map((item) => {
            const active = aba === item.id
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setAba(item.id)}
                className={`rounded-xl px-2.5 py-2.5 text-left ${
                  active
                    ? 'border border-[#2BAADF]/25 bg-gradient-to-r from-[#2BAADF]/20 to-[#2BAADF]/5 text-[#2BAADF]'
                    : 'border border-transparent text-gray-400 hover:bg-[#ffffff08]'
                }`}
              >
                <span className="block text-sm font-semibold">{item.label}</span>
                <span className="mt-0.5 block text-[10px] text-gray-500">{item.hint}</span>
              </button>
            )
          })}
        </nav>
      </div>
      <div className={aba === 'alcada' ? 'min-h-[16rem] space-y-4 p-5' : 'hidden'} role="tabpanel">
        <label className="flex items-center gap-2 text-sm text-gray-300">
          <input
            type="checkbox"
            name="aprovacao_ativa"
            defaultChecked={config?.aprovacao_ativa ?? true}
            className="rounded border-[#ffffff30]"
          />
          Exigir aprovação no pedido antes do PDF ao fornecedor
        </label>
        <p className="text-xs text-gray-500">
          Até o 1º valor, sem aprovação. Entre o 1º e o 2º, uma aprovação. Acima do 2º, duas.
          Exemplo: 500 e 5000.
        </p>
        <label className="block text-sm text-gray-300">
          1ª alçada a partir de (R$)
          <input
            name="nivel1_teto"
            defaultValue={config?.nivel1_teto ?? ''}
            inputMode="decimal"
            placeholder="500"
            className={inputClass}
          />
          <span className="mt-1 block text-[11px] text-gray-500">
            Pedidos até este valor seguem sem aprovação.
          </span>
        </label>
        <label className="block text-sm text-gray-300">
          Grupo da 1ª alçada
          <select
            name="nivel1_grupo_id"
            defaultValue={config?.nivel1_grupo_id || ''}
            className={inputClass}
          >
            <option value="">—</option>
            {grupos.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm text-gray-300">
          2ª alçada a partir de (R$)
          <input
            name="nivel2_a_partir"
            defaultValue={config?.nivel2_a_partir ?? ''}
            inputMode="decimal"
            placeholder="5000"
            className={inputClass}
          />
          <span className="mt-1 block text-[11px] text-gray-500">
            Acima deste valor exigem as duas aprovações.
          </span>
        </label>
        <label className="block text-sm text-gray-300">
          Grupo da 2ª alçada
          <select
            name="nivel2_grupo_id"
            defaultValue={config?.nivel2_grupo_id || ''}
            className={inputClass}
          >
            <option value="">— (só uma alçada)</option>
            {grupos.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nome}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className={aba === 'recebimento' ? 'min-h-[16rem] space-y-4 p-5' : 'hidden'} role="tabpanel">
        <label className="flex items-center gap-2 text-sm text-gray-300">
          <input
            type="checkbox"
            name="recebimento_por_caixa"
            checked={porCaixa}
            onChange={(e) => setPorCaixa(e.target.checked)}
            className="rounded border-[#ffffff30]"
          />
          Conferir por caixa
        </label>
        <p className="text-xs text-gray-500">
          Rotina à parte. Ligado, o pedido ganha o recebimento por caixa (código CX-######). O
          recebimento manual e a nota em XML continuam disponíveis.
        </p>
        {porCaixa ? (
          <p className="font-mono text-sm text-[#2BAADF]">
            Próximo código: CX-{String(config?.caixa_proximo ?? 1).padStart(6, '0')}
          </p>
        ) : null}
        <label className="flex items-center gap-2 text-sm text-gray-300">
          <input
            type="checkbox"
            name="recebimento_importados"
            checked={importados}
            onChange={(e) => setImportados(e.target.checked)}
            className="rounded border-[#ffffff30]"
          />
          Recebimento de importados
        </label>
        <p className="text-xs text-gray-500">
          A planilha grava o código do fornecedor. A doca lê esse código na caixa. O recebimento
          comum e a caixa CX continuam disponíveis.
        </p>
        {importados ? (
          <div className="space-y-3">
            <label className="block text-sm text-gray-300">
              Limpeza do local temporário
              <select
                name="importados_limpeza"
                value={limpeza}
                onChange={(e) => setLimpeza(e.target.value)}
                className={inputClass}
              >
                <option value="transferencia">Transferência de estoque</option>
                <option value="baixa_manual">Baixa manual item a item</option>
                <option value="baixa_agendada">Baixa automática agendada</option>
              </select>
            </label>
            {limpeza === 'baixa_agendada' ? (
              <label className="block text-sm text-gray-300">
                Agenda
                <select
                  name="importados_agenda"
                  defaultValue={config?.importados_agenda || 'diaria'}
                  className={inputClass}
                >
                  <option value="diaria">Diária</option>
                  <option value="semanal">Semanal</option>
                  <option value="mensal">Mensal</option>
                </select>
              </label>
            ) : null}
            <p className="text-xs text-gray-500">
              Impressora de etiqueta: {config?.impressora_etiqueta || 'prevista'}. O modelo fica em
              aberto até a homologação.
            </p>
          </div>
        ) : null}
        <label className="block text-sm text-gray-300">
          Local padrão da entrada
          <select
            name="local_entrada_id"
            defaultValue={config?.local_entrada_id || ''}
            className={inputClass}
          >
            <option value="">—</option>
            {locais.map((local) => (
              <option key={local.id} value={local.id}>
                {local.codigo} · {local.nome}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs text-gray-500">
          A confirmação da nota de material produtivo gera a entrada neste local.
        </p>
      </div>
      <div className="px-5 pb-2">
        {erro ? <p className="text-sm text-red-400">{erro}</p> : null}
        {ok ? <p className="text-sm text-emerald-400">Configuração salva.</p> : null}
      </div>
      <div className="flex justify-end border-t border-[#ffffff08] bg-[#0A0A0A]/90 px-6 py-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-gradient-to-r from-[#2BAADF] to-[#1A8FBF] px-6 py-2.5 text-sm font-semibold text-white"
        >
          {pending ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </form>
  )
}
