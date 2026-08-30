'use client'

import { useTransition, useState } from "react"
import { updateEmpresaStatus } from "@/app/(app)/cockpit/actions"
import Link from "next/link"
import { Building2, Power, PowerOff, CheckCircle2, XCircle } from "lucide-react"

interface Empresa {
  id: string
  nome: string
  cnpj: string | null
  email: string | null
  telefone: string | null
  website: string | null
  endereco: string | null
  ramo_atividade: string | null
  responsavel_nome: string | null
  responsavel_cargo: string | null
  responsavel_email: string | null
  responsavel_telefone: string | null
  ativo: boolean
}

export default function StatusToggle({ empresa }: { empresa: Empresa }) {
  const [isPending, startTransition] = useTransition()
  const [isAtivo, setIsAtivo] = useState(empresa.ativo)
  const [showConfirm, setShowConfirm] = useState(false)

  const handleToggle = () => {
    const novoStatus = !isAtivo
    startTransition(async () => {
      await updateEmpresaStatus(empresa.id, novoStatus)
      setIsAtivo(novoStatus)
      setShowConfirm(false)
    })
  }

  return (
    <div className={`rounded-2xl border p-5 transition-all ${isAtivo ? 'bg-[#80B828]/5 border-[#80B828]/20' : 'bg-red-500/5 border-red-500/20'}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isAtivo ? 'bg-[#80B828]/10' : 'bg-red-500/10'}`}>
            {isAtivo ? <Power className="w-5 h-5 text-[#80B828]" /> : <PowerOff className="w-5 h-5 text-red-400" />}
          </div>
          <div>
            <p className="font-semibold text-white text-sm">Status do Contrato / Acesso</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              {isAtivo ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-[#80B828]">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Empresa Ativa — Usuários podem acessar o sistema
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-red-400">
                  <XCircle className="w-3.5 h-3.5" />
                  Empresa Suspensa — Usuários bloqueados no login
                </span>
              )}
            </div>
          </div>
        </div>

        {!showConfirm ? (
          <button
            onClick={() => setShowConfirm(true)}
            disabled={isPending}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-50 ${
              isAtivo
                ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20'
                : 'bg-[#80B828]/10 hover:bg-[#80B828]/20 text-[#80B828] border border-[#80B828]/20'
            }`}
          >
            {isAtivo ? 'Suspender Acesso' : 'Reativar Acesso'}
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Confirmar?</span>
            <button
              onClick={handleToggle}
              disabled={isPending}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                isAtivo ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-[#80B828] hover:bg-[#6da020] text-white'
              }`}
            >
              {isPending ? '...' : 'Sim, confirmar'}
            </button>
            <button
              onClick={() => setShowConfirm(false)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-400 hover:bg-[#ffffff0a] transition-all"
            >
              Cancelar
            </button>
          </div>
        )}
      </div>

      {!isAtivo && (
        <p className="mt-3 text-xs text-red-400/60 border-t border-red-500/10 pt-3">
          ⚠️ Todos os logins de usuários desta empresa estão bloqueados. Clique em "Reativar Acesso" para restaurar imediatamente.
        </p>
      )}
    </div>
  )
}
