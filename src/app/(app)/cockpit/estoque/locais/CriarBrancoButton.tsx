'use client'

import { useState } from 'react'
import { Sparkles, Loader2 } from 'lucide-react'
import { criarLocalBrancoRapido } from './actions'

export default function CriarBrancoButton() {
  const [loading, setLoading] = useState(false)

  async function handleCreate() {
    setLoading(true)
    try {
      const res = await criarLocalBrancoRapido()
      if (res && res.error) {
        alert(res.error)
      }
    } catch {
      alert('Erro inesperado ao criar o local BRANCO.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleCreate}
      disabled={loading}
      className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#2BAADF] to-[#1A8FBF] px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-[#2BAADF]/20 hover:opacity-95 transition disabled:opacity-50"
    >
      {loading ? (
        <>
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Criando...
        </>
      ) : (
        <>
          <Sparkles className="w-3.5 h-3.5" />
          Criar Local BRANCO
        </>
      )}
    </button>
  )
}
