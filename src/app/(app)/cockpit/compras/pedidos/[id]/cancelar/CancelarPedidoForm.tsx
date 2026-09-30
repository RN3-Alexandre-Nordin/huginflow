'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import PedidoWizard from '../../PedidoWizard'
import { cancelarPedido } from '../../actions'

const STEPS = [
  { id: 'motivo', label: '1. Motivo', hint: 'Texto livre. O pedido permanece no histórico.' },
  { id: 'revisao', label: '2. Revisão', hint: 'Confira o motivo e confirme o cancelamento.' },
] as const

type StepId = (typeof STEPS)[number]['id']

const inputClass =
  'mt-1 w-full rounded-xl border border-[#ffffff14] bg-[#0A0A0A] px-3 py-2 text-sm text-white outline-none focus:border-[#2BAADF]/50'

export default function CancelarPedidoForm({
  pedidoId,
  numero,
}: {
  pedidoId: string
  numero: string
}) {
  const router = useRouter()
  const [passo, setPasso] = useState<StepId>('motivo')
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const motivoOk = motivo.trim().length > 0

  function irProximo() {
    setErro(null)
    if (!motivoOk) {
      setErro('Informe o motivo do cancelamento.')
      return
    }
    setPasso('revisao')
  }

  function confirmar() {
    setErro(null)
    if (!motivoOk) {
      setErro('Informe o motivo do cancelamento.')
      setPasso('motivo')
      return
    }
    const formData = new FormData()
    formData.set('pedido_id', pedidoId)
    formData.set('motivo', motivo.trim())
    start(async () => {
      const res = await cancelarPedido(formData)
      if (res.error) {
        setErro(res.error)
        return
      }
      router.push(`/cockpit/compras/pedidos/${pedidoId}`)
      router.refresh()
    })
  }

  return (
    <PedidoWizard
      steps={STEPS}
      passo={passo}
      numero={numero}
      erro={erro}
      onVoltar={() => {
        setErro(null)
        setPasso('motivo')
      }}
      onProximo={irProximo}
      onConfirmar={confirmar}
      confirmarLabel="Confirmar cancelamento"
      proximoDisabled={!motivoOk}
      pending={pending}
    >
      {passo === 'motivo' ? (
        <label className="block text-sm text-gray-300" role="tabpanel">
          Motivo do cancelamento *
          <textarea
            required
            rows={5}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            className={inputClass}
            placeholder="Descreva o motivo"
          />
        </label>
      ) : (
        <div className="rounded-xl border border-[#ffffff0a] bg-[#0A0A0A]/60 p-4 text-sm" role="tabpanel">
          <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-gray-600">
            Cancelamento
          </p>
          <dl className="space-y-3">
            <div>
              <dt className="text-xs text-gray-500">Pedido</dt>
              <dd className="font-mono text-[#2BAADF]">{numero}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Motivo</dt>
              <dd className="whitespace-pre-wrap text-white">{motivo.trim()}</dd>
            </div>
          </dl>
        </div>
      )}
    </PedidoWizard>
  )
}
