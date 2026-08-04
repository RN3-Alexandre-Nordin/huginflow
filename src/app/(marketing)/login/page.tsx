"use client";

import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";
import { login } from "../../actions";

function LoginForm() {
  const searchParams = useSearchParams();
  const errorMsg = searchParams.get("error");
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  return (
    <div className="w-full max-w-md animate-fade-in-up">
      {/* Mobile logo */}
      <div className="flex justify-center mb-10 lg:hidden">
        <Image
          src="/logotipo.png"
          alt="HuginFlow"
          width={140}
          height={70}
          style={{ filter: "brightness(0) invert(1) opacity(0.9)" }}
        />
      </div>

      {/* Heading */}
      <div className="mb-10">
        <h2
          className="text-3xl font-black tracking-tight mb-2"
          style={{ color: "#F5F5F5" }}
        >
          Bem-vindo de volta
        </h2>
        <p className="text-sm" style={{ color: "rgba(245,245,245,0.45)" }}>
          Faça login para acessar sua conta HuginFlow
        </p>
      </div>

      {/* Form utilizando Progressive Enhancement (action direta) */}
      {/* Isso garante que o login funcione mesmo se o JS falhar */}
      <form 
        action={login} 
        className="flex flex-col gap-5"
      >
        {/* Error Alert */}
        {errorMsg && (
          <div 
            className="p-4 rounded-xl flex items-center gap-3 animate-shake"
            style={{ 
              background: "rgba(220, 38, 38, 0.1)", 
              border: "1px solid rgba(220, 38, 38, 0.2)",
              color: "#ef4444" 
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span className="text-sm font-medium">{errorMsg}</span>
          </div>
        )}

        {/* Email */}
        <div className="flex flex-col gap-2">
          <label
            htmlFor="email"
            className="text-xs font-semibold uppercase tracking-wider"
            style={{ color: "rgba(245,245,245,0.5)" }}
          >
            E-mail
          </label>
          <div
            className="relative rounded-xl transition-all duration-300"
            style={{
              border: focusedField === "email"
                ? "1.5px solid var(--ragnar-blue)"
                : "1.5px solid rgba(255,255,255,0.08)",
              boxShadow: focusedField === "email"
                ? "0 0 0 4px rgba(43,170,223,0.12)"
                : "none",
            }}
          >
            <div
              className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none transition-colors duration-300"
              style={{ color: focusedField === "email" ? "var(--ragnar-blue)" : "rgba(255,255,255,0.3)" }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <input
              id="email"
              type="email"
              onFocus={() => setFocusedField("email")}
              onBlur={() => setFocusedField(null)}
              placeholder="seu@email.com"
              name="email"
              required
              autoComplete="email"
              className="w-full pl-12 pr-4 py-4 rounded-xl text-sm outline-none transition-colors duration-300"
              style={{
                background: "rgba(255,255,255,0.04)",
                color: "#F5F5F5",
              }}
            />
          </div>
        </div>

        {/* Password */}
        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <label
              htmlFor="password"
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: "rgba(245,245,245,0.5)" }}
            >
              Senha
            </label>
          </div>
          <div
            className="relative rounded-xl transition-all duration-300"
            style={{
              border: focusedField === "password"
                ? "1.5px solid var(--ragnar-blue)"
                : "1.5px solid rgba(255,255,255,0.08)",
              boxShadow: focusedField === "password"
                ? "0 0 0 4px rgba(43,170,223,0.12)"
                : "none",
            }}
          >
            <div
              className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none transition-colors duration-300"
              style={{ color: focusedField === "password" ? "var(--ragnar-blue)" : "rgba(255,255,255,0.3)" }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="1.8" />
                <path d="M7 11V7a5 5 0 0110 0v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </div>
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              onFocus={() => setFocusedField("password")}
              onBlur={() => setFocusedField(null)}
              placeholder="••••••••"
              name="password"
              required
              autoComplete="current-password"
              className="w-full pl-12 pr-12 py-4 rounded-xl text-sm outline-none transition-colors duration-300"
              style={{
                background: "rgba(255,255,255,0.04)",
                color: "#F5F5F5",
              }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 transition-colors duration-200"
              style={{ color: "rgba(255,255,255,0.3)" }}
              aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
            >
              {showPassword ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  <line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" strokeWidth="1.8" />
                  <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Remember me */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="w-5 h-5 rounded flex items-center justify-center transition-all duration-200 flex-shrink-0"
            style={{
              background: "rgba(43,170,223,0.15)",
              border: "1.5px solid rgba(43,170,223,0.5)",
            }}
          >
            <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
              <path d="M1 4l3 3 5-6" stroke="#2BAADF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <span className="text-sm cursor-pointer" style={{ color: "rgba(245,245,245,0.5)" }}>
            Manter conectado
          </span>
        </div>

        {/* Submit button - Estático para garantir o clique */}
        <button
          id="login-submit"
          type="submit"
          className="relative w-full py-4 rounded-xl font-bold text-sm tracking-wide transition-all duration-300 overflow-hidden mt-2"
          style={{
            background: "linear-gradient(135deg, #2BAADF 0%, #1A8FBF 100%)",
            color: "#fff",
            boxShadow: "0 4px 24px rgba(43,170,223,0.35)",
            cursor: "pointer",
          }}
        >
          <span className="flex items-center justify-center gap-2">
            Entrar na plataforma
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M5 12h14M12 5l7 7-7 7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </button>
      </form>

      {/* Footer */}
      <p className="text-center text-xs mt-10" style={{ color: "rgba(245,245,245,0.25)" }}>
        Não tem uma conta?{" "}
        <a href="/register" className="font-semibold transition-colors duration-200 hover:underline" style={{ color: "var(--ragnar-blue)" }}>
          Fale com a equipe HuginFlow
        </a>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="min-h-screen flex overflow-hidden" style={{ background: "var(--background)" }}>
      {/* ── Left panel: decorative ── */}
      <div className="hidden lg:flex flex-col justify-between w-[55%] relative overflow-hidden p-12" style={{ background: "linear-gradient(135deg, #0C0C0C 0%, #111827 40%, #0C1A2E 100%)" }}>
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "linear-gradient(#2BAADF 1px, transparent 1px), linear-gradient(90deg, #2BAADF 1px, transparent 1px)", backgroundSize: "50px 50px" }} />
        <div className="absolute top-[-80px] left-[-80px] w-[420px] h-[420px] rounded-full opacity-20" style={{ background: "radial-gradient(circle, #2BAADF 0%, transparent 70%)", filter: "blur(40px)" }} />
        <div className="absolute bottom-[-100px] right-[-60px] w-[360px] h-[360px] rounded-full opacity-15" style={{ background: "radial-gradient(circle, #80B828 0%, transparent 70%)", filter: "blur(50px)" }} />
        <div className="relative z-10">
          <Image src="/logotipo.png" alt="HuginFlow" width={160} height={80} className="opacity-90" style={{ filter: "brightness(0) invert(1) opacity(0.9)" }} />
        </div>
        <div className="relative z-10 flex flex-col gap-8">
           <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ background: "rgba(43, 170, 223, 0.15)", border: "1px solid rgba(43, 170, 223, 0.4)" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="#2BAADF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: "var(--ragnar-blue)" }}>Plataforma Inteligente</span>
          </div>
          <div>
            <h1 className="text-5xl xl:text-6xl font-black leading-tight mb-4" style={{ color: "#F5F5F5" }}>Workflows<br /><span style={{ background: "linear-gradient(90deg, #2BAADF, #80B828)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>inteligentes</span></h1>
            <p className="text-lg leading-relaxed max-w-md" style={{ color: "rgba(245,245,245,0.55)" }}>Orquestre CRM, atendimento e processos com IA. Automatize, visualize e escale com o HuginFlow.</p>
          </div>
        </div>
      </div>

      {/* ── Right panel: login form with Suspense ── */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 lg:px-16 relative" style={{ background: "#0F0F0F" }}>
        <div className="absolute top-0 right-0 w-[300px] h-[300px] opacity-10 pointer-events-none" style={{ background: "radial-gradient(circle at top right, #2BAADF, transparent 70%)", filter: "blur(40px)" }} />
        <Suspense fallback={<div className="text-white">Carregando...</div>}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
