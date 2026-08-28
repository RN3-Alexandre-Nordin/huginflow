'use client'

import { useTransition, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, KeyRound, Eye, EyeOff, ShieldCheck } from 'lucide-react'
import { changeMyPassword } from '@/app/actions'

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
        {label} {required && <span className="text-[#2BAADF]">*</span>}
      </label>
      {children}
    </div>
  )
}

const inputCls =
  'w-full bg-[#0A0A0A] border border-[#ffffff12] focus:border-[#2BAADF] rounded-xl px-4 py-2.5 text-sm text-white outline-none transition-all placeholder-gray-600 focus:ring-1 focus:ring-[#2BAADF]/30'

export default function ChangePasswordForm({
  success,
  required = false,
}: {
  success?: boolean
  required?: boolean
}) {
  const [isPending, startTransition] = useTransition()
  const [senhaAtual, setSenhaAtual] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmarSenha, setConfirmarSenha] = useState('')
  const [showAtual, setShowAtual] = useState(false)
  const [showNova, setShowNova] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [fieldError, setFieldError] = useState('')
  const [formError, setFormError] = useState('')

  const handleSubmit = (formData: FormData) => {
    setFormError('')
    setFieldError('')

    if (novaSenha !== confirmarSenha) {
      setFieldError('A nova senha e a confirmação devem ser iguais.')
      return
    }
    if (novaSenha.length < 6) {
      setFieldError('A nova senha deve ter no mínimo 6 caracteres.')
      return
    }
    if (senhaAtual === novaSenha) {
      setFieldError('A nova senha deve ser diferente da senha atual.')
      return
    }

    startTransition(async () => {
      if (required) {
        formData.set('required', '1')
      }
      const result = await changeMyPassword(formData)
      if (result?.error) {
        setFormError(result.error)
        return
      }
      setSenhaAtual('')
      setNovaSenha('')
      setConfirmarSenha('')
    })
  }

  return (
    <div className="max-w-lg mx-auto space-y-6 pb-12">
      <div className="flex items-center gap-4">
        {!required && (
          <Link
            href="/cockpit"
            className="p-2 rounded-lg bg-[#ffffff05] hover:bg-[#ffffff0a] text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
        )}
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <KeyRound className="w-6 h-6 text-[#2BAADF]" />
            {required ? 'Defina sua senha' : 'Alterar senha'}
          </h2>
          <p className="text-sm text-gray-400 mt-0.5">
            {required
              ? 'Por segurança, troque a senha padrão antes de usar o Hugin Flow.'
              : 'Atualize a senha da sua conta de acesso'}
          </p>
        </div>
      </div>

      {required && (
        <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 text-sm text-amber-200">
          <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
          Este é seu primeiro acesso (ou sua senha foi redefinida). Você só poderá usar o sistema após salvar uma nova senha pessoal.
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 text-sm text-emerald-400">
          <ShieldCheck className="w-4 h-4 shrink-0" />
          Senha alterada com sucesso.
        </div>
      )}

      <form action={handleSubmit} className="bg-[#111111] border border-[#ffffff0a] rounded-2xl p-6 space-y-5 shadow-xl">
        <Field label="Senha atual" required>
          <div className="relative">
            <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type={showAtual ? 'text' : 'password'}
              name="senha_atual"
              required
              autoComplete="current-password"
              value={senhaAtual}
              onChange={(e) => {
                setSenhaAtual(e.target.value)
                setFieldError('')
                setFormError('')
              }}
              className={`${inputCls} pl-10 pr-10`}
            />
            <button
              type="button"
              onClick={() => setShowAtual((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
            >
              {showAtual ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </Field>

        <Field label="Nova senha" required>
          <div className="relative">
            <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type={showNova ? 'text' : 'password'}
              name="nova_senha"
              required
              minLength={6}
              autoComplete="new-password"
              value={novaSenha}
              onChange={(e) => {
                setNovaSenha(e.target.value)
                setFieldError('')
                setFormError('')
              }}
              placeholder="Mínimo 6 caracteres"
              className={`${inputCls} pl-10 pr-10`}
            />
            <button
              type="button"
              onClick={() => setShowNova((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
            >
              {showNova ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </Field>

        <Field label="Confirmar nova senha" required>
          <div className="relative">
            <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type={showConfirm ? 'text' : 'password'}
              name="confirmar_senha"
              required
              autoComplete="new-password"
              value={confirmarSenha}
              onChange={(e) => {
                setConfirmarSenha(e.target.value)
                setFieldError('')
                setFormError('')
              }}
              placeholder="Repita a nova senha"
              className={`${inputCls} pl-10 pr-10 ${fieldError ? 'border-red-500/50 focus:border-red-500' : ''}`}
            />
            <button
              type="button"
              onClick={() => setShowConfirm((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
            >
              {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {fieldError && (
            <p className="text-xs text-red-400 mt-1 flex items-center gap-1">⚠ {fieldError}</p>
          )}
        </Field>

        {formError && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">
            {formError}
          </div>
        )}

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={isPending}
            className="bg-gradient-to-r from-[#2BAADF] to-[#1A8FBF] hover:shadow-[0_4px_24px_rgba(43,170,223,0.35)] disabled:opacity-50 disabled:cursor-not-allowed text-white px-8 py-2.5 rounded-xl text-sm font-semibold transition-all"
          >
            {isPending ? 'Salvando...' : 'Salvar nova senha'}
          </button>
        </div>
      </form>
    </div>
  )
}
