'use client'

import { useEffect, useState } from 'react'
import { listarSeriesAction } from '@/app/(app)/cockpit/estoque/series/actions'

type SerieOpcao = { id: string; numero: string }

export default function CampoSerie({
  skuId,
  localId,
  situacao = 'em_estoque',
  value,
  onChange,
  varios = false,
  selecionadas = [],
  onToggle,
}: {
  skuId: string
  localId?: string
  situacao?: 'em_estoque' | 'em_terceiro'
  value?: string
  onChange?: (serieId: string) => void
  varios?: boolean
  selecionadas?: string[]
  onToggle?: (serieId: string, marcado: boolean) => void
}) {
  const [series, setSeries] = useState<SerieOpcao[]>([])
  const [aviso, setAviso] = useState<string | null>(null)

  useEffect(() => {
    let ativo = true
    if (!skuId) {
      setSeries([])
      return
    }
    listarSeriesAction(skuId, situacao, localId).then((res) => {
      if (!ativo) return
      setSeries(res.series || [])
      setAviso(res.error || (res.series?.length ? null : 'Nenhuma série neste local.'))
    })
    return () => {
      ativo = false
    }
  }, [skuId, localId, situacao])

  if (varios) {
    return (
      <div className="space-y-1">
        <p className="text-[10px] uppercase tracking-wider text-gray-500">Séries desta unidade</p>
        {series.length === 0 ? (
          <p className="text-[11px] text-amber-300/90">{aviso || 'Nenhuma série disponível.'}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {series.map((serie) => {
              const marcado = selecionadas.includes(serie.id)
              return (
                <label
                  key={serie.id}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-mono ${
                    marcado
                      ? 'border-[#2BAADF]/40 bg-[#2BAADF]/10 text-[#2BAADF]'
                      : 'border-[#ffffff14] text-gray-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={marcado}
                    onChange={(e) => onToggle?.(serie.id, e.target.checked)}
                  />
                  {serie.numero}
                </label>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <select
      value={value || ''}
      onChange={(e) => onChange?.(e.target.value)}
      className="w-full bg-[#0d1218] border border-[#2BAADF]/30 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-[#2BAADF]/60"
    >
      <option value="">{aviso && series.length === 0 ? aviso : 'Série *'}</option>
      {series.map((serie) => (
        <option key={serie.id} value={serie.id}>
          {serie.numero}
        </option>
      ))}
    </select>
  )
}
