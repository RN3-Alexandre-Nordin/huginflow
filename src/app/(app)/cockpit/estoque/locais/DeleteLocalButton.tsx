'use client'

import { useState } from 'react'
import { Trash2, Loader2 } from 'lucide-react'
import { deleteLocal } from './actions'

export default function DeleteLocalButton({ id, nome }: { id: string; nome: string }) {
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    const ok = window.confirm(`Deseja realmente excluir o local "${nome}"?`)
    if (!ok) return

    setLoading(true)
    try {
      const res = await deleteLocal(id)
      if (res && res.error) {
        alert(res.error)
      }
    } catch {
      alert('Erro inesperado ao excluir o local.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={loading}
      title="Excluir Local"
      className="p-2.5 text-red-500/70 hover:text-red-400 bg-red-400/5 hover:bg-red-400/10 rounded-xl transition-all disabled:opacity-50"
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin text-red-400" /> : <Trash2 className="w-4 h-4" />}
    </button>
  )
}
