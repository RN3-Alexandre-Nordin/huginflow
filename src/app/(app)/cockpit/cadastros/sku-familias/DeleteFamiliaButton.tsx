'use client'

import { useTransition } from 'react'
import { Trash2 } from 'lucide-react'
import { deleteSkuFamilia } from './actions'

export default function DeleteFamiliaButton({ id, nome }: { id: string; nome: string }) {
  const [pending, start] = useTransition()
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm(`Excluir a família "${nome}"? SKUs vinculados ficam sem família.`)) return
        start(async () => {
          const res = await deleteSkuFamilia(id)
          if (res && 'error' in res && res.error) alert(res.error)
        })
      }}
      className="rounded-lg p-2 text-gray-400 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  )
}
