'use client'

import { useState } from 'react'

export default function LoginForm({ errorMsg }: { errorMsg?: string | null }) {
  const [showPassword, setShowPassword] = useState(false)
  const [focusedField, setFocusedField] = useState<string | null>(null)

  const displayError =
    errorMsg === 'Invalid login credentials'
      ? 'E-mail ou senha incorretos. Verifique os dados e tente novamente.'
      : errorMsg

  return (
    <div className="w-full max-w-md animate-fade-in-up">
      <div className="flex justify-center mb-10 lg:hidden">
        <img
          src="/logo-principal.png?v=20260824b"
          alt="Hugin Flow"
          className="h-24 w-auto max-w-[min(100%,420px)] object-contain bg-transparent"
        />
      </div>

      <div className="mb-10">
        <h2 className="text-3xl font-black tracking-tight mb-2" style={{ color: '#F5F5F5' }}>
          Bem-vindo de volta
        </h2>
        <p className="text-sm" style={{ color: 'rgba(245,245,245,0.45)' }}>
          Faça login para acessar sua conta Hugin Flow
        </p>
      </div>

      <form action="/api/auth/login" method="POST" className="flex flex-col gap-5" data-testid="login-form">
        {displayError && (
          <div
            data-testid="login-error"
            className="p-4 rounded-xl flex items-center gap-3 animate-shake"
            style={{
              background: 'rgba(220, 38, 38, 0.1)',
              border: '1px solid rgba(220, 38, 38, 0.2)',
              color: '#ef4444',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span className="text-sm font-medium">{displayError}</span>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <label htmlFor="email" className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(245,245,245,0.5)' }}>
            E-mail
          </label>
          <div
            className="relative rounded-xl transition-all duration-300"
            style={{
              border: focusedField === 'email' ? '1.5px solid var(--brand-blue)' : '1.5px solid rgba(255,255,255,0.08)',
              boxShadow: focusedField === 'email' ? '0 0 0 4px rgba(43,170,223,0.12)' : 'none',
            }}
          >
            <input
              id="email"
              type="email"
              onFocus={() => setFocusedField('email')}
              onBlur={() => setFocusedField(null)}
              placeholder="seu@email.com"
              name="email"
              required
              autoComplete="email"
              className="w-full px-4 py-4 rounded-xl text-sm outline-none transition-colors duration-300"
              style={{ background: 'rgba(255,255,255,0.04)', color: '#F5F5F5' }}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="password" className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(245,245,245,0.5)' }}>
            Senha
          </label>
          <div
            className="relative rounded-xl transition-all duration-300"
            style={{
              border: focusedField === 'password' ? '1.5px solid var(--brand-blue)' : '1.5px solid rgba(255,255,255,0.08)',
              boxShadow: focusedField === 'password' ? '0 0 0 4px rgba(43,170,223,0.12)' : 'none',
            }}
          >
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              onFocus={() => setFocusedField('password')}
              onBlur={() => setFocusedField(null)}
              placeholder="••••••••"
              name="password"
              required
              autoComplete="current-password"
              className="w-full pl-4 pr-12 py-4 rounded-xl text-sm outline-none transition-colors duration-300"
              style={{ background: 'rgba(255,255,255,0.04)', color: '#F5F5F5' }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 transition-colors duration-200"
              style={{ color: 'rgba(255,255,255,0.3)' }}
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
            >
              {showPassword ? 'Ocultar' : 'Ver'}
            </button>
          </div>
        </div>

        <button
          id="login-submit"
          type="submit"
          className="relative w-full py-4 rounded-xl font-bold text-sm tracking-wide transition-all duration-300 overflow-hidden mt-2"
          style={{
            background: 'linear-gradient(135deg, #2BAADF 0%, #1A8FBF 100%)',
            color: '#fff',
            boxShadow: '0 4px 24px rgba(43,170,223,0.35)',
            cursor: 'pointer',
          }}
        >
          Entrar na plataforma
        </button>
      </form>

      <p className="text-center text-xs mt-10" style={{ color: 'rgba(245,245,245,0.25)' }}>
        Não tem uma conta?{' '}
        <a href="/register" className="font-semibold transition-colors duration-200 hover:underline" style={{ color: 'var(--brand-blue)' }}>
          Fale com a equipe Hugin Flow
        </a>
      </p>
    </div>
  )
}
