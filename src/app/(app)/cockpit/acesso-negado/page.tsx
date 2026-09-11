'use client'

import { ShieldAlert, Home } from "lucide-react"
import Link from "next/link"
import BackTextButton from '@/components/BackTextButton'

export default function AcessoNegadoPage() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center p-8 text-center animate-fade-in-up">
      {/* Icon with Glow */}
      <div className="relative mb-8">
        <div className="absolute inset-0 bg-red-500/20 blur-3xl rounded-full" />
        <div className="relative w-24 h-24 rounded-3xl bg-[#111111] border border-red-500/30 flex items-center justify-center shadow-2xl shadow-red-500/10">
          <ShieldAlert className="w-12 h-12 text-red-500" />
        </div>
      </div>

      {/* Text Content */}
      <h1 className="text-3xl font-bold text-white tracking-tight mb-3">
        Acesso Restrito
      </h1>
      <p className="text-gray-400 max-w-md mx-auto leading-relaxed mb-10">
        Ops! Parece que o seu perfil não possui as permissões necessárias para acessar este módulo.
        Caso acredite que isso seja um erro, entre em contato com o administrador da sua empresa.
      </p>

      {/* Action Buttons */}
      <div className="flex items-center gap-4">
        <Link 
          href="/cockpit"
          className="flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-black font-semibold text-sm hover:bg-gray-200 transition-all shadow-lg hover:shadow-white/5 active:scale-95"
        >
          <Home className="w-4 h-4" />
          Voltar ao Início
        </Link>
        <BackTextButton
          className="flex items-center gap-2 px-6 py-3 rounded-xl bg-[#ffffff05] border border-[#ffffff0a] text-gray-400 font-semibold text-sm hover:text-white hover:bg-[#ffffff10] transition-all active:scale-95"
        >
          Voltar Anterior
        </BackTextButton>
      </div>

      {/* System Note */}
      <div className="mt-16 pt-8 border-t border-[#ffffff05] w-full max-w-lg">
        <p className="text-[10px] text-gray-600 uppercase tracking-[0.2em] font-bold">
          HUGIN FLOW SECURITY ENFORCEMENT &bull; RBAC v2
        </p>
      </div>
    </div>
  )
}
