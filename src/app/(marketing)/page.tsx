"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect } from "react";
import { CheckCircle2, Brain, MessageSquare, Zap, ArrowRight, Loader2, AlertCircle } from "lucide-react";

export default function HomePage() {
  const [formData, setFormData] = useState({
    nome: "",
    email: "",
    empresa: "",
    telefone: "",
    mensagem: ""
  });
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("animate-fade-in-up");
            (entry.target as HTMLElement).style.opacity = "1";
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );

    const elements = document.querySelectorAll(".reveal-on-scroll");
    elements.forEach((el) => {
      (el as HTMLElement).style.opacity = "0";
      observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  const validateEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");

    // Validações
    if (!formData.nome.trim()) return setErrorMessage("Por favor, informe seu nome.");
    if (!validateEmail(formData.email)) return setErrorMessage("Informe um e-mail válido.");
    if (!formData.telefone.trim()) return setErrorMessage("Informe seu telefone de contato.");

    setStatus("loading");

    try {
      console.log("Token Payload:", process.env.NEXT_PUBLIC_LANDING_PAGE_TOKEN);
      const response = await fetch("/api/inbound/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: formData.nome,
          email: formData.email,
          telefone: formData.telefone,
          mensagem: `Empresa: ${formData.empresa} | Mensagem: ${formData.mensagem}`,
          token: process.env.NEXT_PUBLIC_LANDING_PAGE_TOKEN
        }),
      });

      const result = await response.json();
      console.log("[Lead Inbound] Resposta da API:", result);

      if (!response.ok) {
        throw new Error(result.error || result.message || "Erro ao enviar lead");
      }

      setStatus("success");
      setFormData({ nome: "", email: "", empresa: "", telefone: "", mensagem: "" });
      
      // Reset success after 5 seconds
      setTimeout(() => setStatus("idle"), 5000);
    } catch (err: any) {
      console.error("Erro no envio:", err);
      setStatus("error");
      setErrorMessage(err.message || "Ocorreu um erro ao enviar seus dados. Tente novamente.");
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 font-sans selection:bg-brand-blue/30 relative overflow-x-hidden">
      
      {/* Background Overlays & Grid */}
      <div className="absolute inset-0 opacity-[0.07] pointer-events-none z-0" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)", backgroundSize: "32px 32px" }} />
      <div className="absolute top-[-10%] sm:top-[-20%] left-1/2 -translate-x-1/2 w-[800px] h-[400px] sm:h-[600px] bg-brand-blue/20 blur-[160px] rounded-full pointer-events-none z-0" />
      <div className="absolute top-[30%] left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-brand-blue-dark/15 blur-[160px] rounded-full pointer-events-none z-0" />

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* NAVBAR                                                            */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <nav className="fixed top-0 left-0 right-0 h-20 border-b border-white/5 bg-zinc-950/80 backdrop-blur-md z-50 animate-fade-in-up" style={{ animationDuration: '0.4s' }}>
        <div className="max-w-7xl mx-auto px-6 h-full flex items-center justify-between">
          <img
            src="/logo-principal.png?v=20260824"
            alt="Hugin Flow"
            width={180}
            height={48}
            className="h-10 sm:h-12 w-auto object-contain drop-shadow-sm transition-opacity hover:opacity-80"
          />
          <Link 
            href="/login" 
            className="px-5 py-2.5 rounded-full bg-brand-blue hover:bg-brand-blue-light text-white text-sm font-semibold tracking-wide border border-brand-blue/50 transition-all hover:scale-105 active:scale-95 flex items-center gap-2 shadow-[0_0_20px_-5px_rgba(43,170,223,0.4)]"
          >
            Acessar App
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
          </Link>
        </div>
      </nav>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* BLOCO 1 — HERO SECTION                                            */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <main className="relative pt-36 pb-8 px-6 flex flex-col items-center justify-center">
        <div className="max-w-5xl mx-auto text-center z-10 flex flex-col items-center">

          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-blue/5 border border-brand-blue/20 text-brand-blue text-xs font-bold tracking-widest uppercase mb-8 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-blue opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-blue" />
            </span>
            Plataforma Operacional 2.0
          </div>

          {/* Slogan Principal */}
          <h1 className="text-5xl sm:text-6xl md:text-[5.5rem] lg:text-[6.5rem] font-black tracking-tighter leading-[1.05] mb-8 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
            <span className="block text-zinc-100">Inteligência</span>
            <span className="block text-transparent bg-clip-text bg-gradient-to-r from-white to-brand-blue-light pb-2">
              em Movimento.
            </span>
          </h1>

          {/* Subtexto */}
          <p className="text-lg sm:text-xl md:text-2xl text-zinc-400 max-w-3xl leading-relaxed mb-12 animate-fade-in-up font-medium" style={{ animationDelay: '0.3s' }}>
            <strong className="text-zinc-200">CRM + Orquestrador de Workflow:</strong> A plataforma premium que automatiza processos complexos e coloca sua operação para rodar sozinha.
          </p>

          {/* CTA */}
          <div className="flex flex-col sm:flex-row items-center gap-4 animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
            <Link 
              href="/login" 
              className="w-full sm:w-auto px-8 py-4 rounded-full bg-zinc-100 hover:bg-white text-zinc-950 font-bold tracking-wide transition-all hover:scale-105 active:scale-95 shadow-[0_0_40px_-10px_rgba(255,255,255,0.3)] flex items-center justify-center gap-2 group"
            >
              Começar Agora
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="transition-transform group-hover:translate-x-1"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
            </Link>
          </div>
        </div>

        {/* ── Mockup do Produto Real (Screenshot Flutuante) ── */}
        <div className="mt-20 w-full max-w-6xl relative z-10 animate-fade-in-up" style={{ animationDelay: '0.55s' }}>
          {/* Neon Glow atrás do mockup */}
          <div className="absolute -inset-4 bg-gradient-to-br from-brand-blue/25 via-transparent to-brand-green/15 blur-3xl rounded-[2rem] opacity-50 pointer-events-none" />
          
          {/* Frame do Browser */}
          <div className="relative rounded-2xl border border-zinc-800/60 bg-zinc-950 shadow-[0_20px_80px_-20px_rgba(43,170,223,0.25)] overflow-hidden ring-1 ring-white/[0.03] transition-transform duration-700 ease-out hover:scale-[1.01]">
            {/* Barra de título */}
            <div className="h-10 w-full bg-zinc-900/80 border-b border-white/5 flex items-center px-4 gap-3 relative">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
                <div className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
                <div className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
              </div>
              <div className="h-5 w-52 bg-zinc-800/50 rounded-md mx-auto absolute left-1/2 -translate-x-1/2 border border-white/5 flex items-center justify-center">
                <span className="text-[9px] text-zinc-500 font-medium tracking-wide">app.huginflow.com/cockpit</span>
              </div>
            </div>
            {/* Screenshot real */}
            <Image
              src="/images/cockpit-screenshot.png"
              alt="HuginFlow Cockpit - CRM e Workflow em tempo real"
              width={1920}
              height={1080}
              className="w-full h-auto"
              priority
            />
          </div>
        </div>
      </main>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* BLOCO 2 — DORES E SOLUÇÃO (THE GAP)                              */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <section className="py-24 sm:py-32 px-6 bg-zinc-900 border-y border-white/5 relative z-10 mt-16">
        <div className="max-w-4xl mx-auto text-center reveal-on-scroll">
          <h2 className="text-4xl sm:text-5xl md:text-6xl font-black mb-8 text-zinc-100 tracking-tighter leading-tight">
            Onde a automação comum para, <br/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-blue to-brand-blue-light">
              o HuginFlow começa.
            </span>
          </h2>
          <p className="text-lg sm:text-xl text-zinc-400 leading-relaxed font-medium">
            O mercado está saturado de CRMs estáticos que dependem que você alimente os dados. 
            O HuginFlow é diferente. Ele é o motor ativo que une seus dados ao movimento real do seu negócio. 
            Um verdadeiro orquestrador desenhado não para arquivar, mas para <strong className="text-zinc-200">executar</strong>.
          </p>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* BLOCO 3 — O CÉREBRO OMNICHANNEL                                   */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <section className="py-24 sm:py-32 px-6 relative z-10 overflow-hidden">
        {/* Glow */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-brand-blue/5 blur-[150px] rounded-full pointer-events-none" />

        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20 reveal-on-scroll">
            <h2 className="text-4xl sm:text-5xl md:text-6xl font-black text-zinc-100 tracking-tighter leading-tight mb-6">
              HuginFlow: O Coração da Sua <br/>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-blue to-brand-blue-light">
                Operação Omnichannel.
              </span>
            </h2>
            <p className="text-lg sm:text-xl text-zinc-400 font-medium max-w-3xl mx-auto">
              Todos os canais convergem para um único cérebro. A IA entende, responde e dispara ações automaticamente.
            </p>
          </div>

          {/* Diagrama Omnichannel: 3 Colunas */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr_auto_1fr] gap-6 lg:gap-0 items-stretch">

            {/* COLUNA 1 — Entrada de Leads */}
            <div className="p-8 sm:p-10 rounded-3xl bg-zinc-900/50 border border-white/5 reveal-on-scroll">
              <div className="flex items-center gap-3 mb-8">
                <div className="w-12 h-12 rounded-2xl bg-green-500/10 flex items-center justify-center">
                  <MessageSquare className="w-6 h-6 text-green-400" />
                </div>
                <h3 className="text-xl font-bold text-zinc-100 tracking-tight">Entrada de Leads</h3>
              </div>
              <p className="text-zinc-400 text-sm font-medium leading-relaxed mb-8">
                Leads chegam por múltiplos canais e são centralizados automaticamente no HuginFlow, sem perda de contexto.
              </p>
              <div className="space-y-4">
                {/* WhatsApp */}
                <div className="flex items-center gap-4 p-3 rounded-xl bg-zinc-800/40 border border-white/5">
                  <div className="w-10 h-10 rounded-xl bg-green-500/15 flex items-center justify-center flex-shrink-0">
                    <svg viewBox="0 0 24 24" className="w-5 h-5 text-green-400" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                  </div>
                  <div>
                    <span className="text-zinc-200 font-semibold text-sm">WhatsApp Business</span>
                    <span className="block text-zinc-500 text-xs">Meta Business API</span>
                  </div>
                </div>
                {/* Instagram */}
                <div className="flex items-center gap-4 p-3 rounded-xl bg-zinc-800/40 border border-white/5">
                  <div className="w-10 h-10 rounded-xl bg-pink-500/15 flex items-center justify-center flex-shrink-0">
                    <svg viewBox="0 0 24 24" className="w-5 h-5 text-pink-400" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                  </div>
                  <div>
                    <span className="text-zinc-200 font-semibold text-sm">Instagram DM</span>
                    <span className="block text-zinc-500 text-xs">Meta Graph API</span>
                  </div>
                </div>
                {/* Landing Pages */}
                <div className="flex items-center gap-4 p-3 rounded-xl bg-zinc-800/40 border border-white/5">
                  <div className="w-10 h-10 rounded-xl bg-brand-blue/15 flex items-center justify-center flex-shrink-0">
                    <svg viewBox="0 0 24 24" className="w-5 h-5 text-brand-blue" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                  </div>
                  <div>
                    <span className="text-zinc-200 font-semibold text-sm">Landing Pages</span>
                    <span className="block text-zinc-500 text-xs">Webhooks & Formulários</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Seta 1 */}
            <div className="hidden lg:flex items-center justify-center px-4 reveal-on-scroll">
              <ArrowRight className="w-8 h-8 text-zinc-700" />
            </div>

            {/* COLUNA 2 — Núcleo de IA (O Cérebro) */}
            <div className="p-8 sm:p-10 rounded-3xl bg-zinc-900/50 border border-brand-blue/20 relative overflow-hidden reveal-on-scroll" style={{ transitionDelay: '100ms' }}>
              <div className="absolute inset-0 bg-gradient-to-br from-brand-blue/5 to-transparent pointer-events-none" />
              
              <div className="flex items-center gap-3 mb-8 relative z-10">
                <div className="w-12 h-12 rounded-2xl bg-brand-blue/15 flex items-center justify-center shadow-[0_0_25px_-5px_rgba(43,170,223,0.4)]">
                  <Brain className="w-6 h-6 text-brand-blue" />
                </div>
                <h3 className="text-xl font-bold text-zinc-100 tracking-tight">Núcleo de IA (LLMs)</h3>
              </div>
              <p className="text-zinc-400 text-sm font-medium leading-relaxed mb-8 relative z-10">
                Modelos de linguagem de última geração interpretam a intenção do cliente, respondem automaticamente ou triam para um operador humano.
              </p>
              <div className="space-y-4 relative z-10">
                {/* OpenAI */}
                <div className="flex items-center gap-4 p-3 rounded-xl bg-zinc-800/30 border border-brand-blue/10">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
                    <svg viewBox="0 0 24 24" className="w-5 h-5 text-emerald-400" fill="currentColor"><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.998 5.998 0 0 0-3.998 2.9 6.042 6.042 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/></svg>
                  </div>
                  <div>
                    <span className="text-zinc-200 font-semibold text-sm">OpenAI GPT-4</span>
                    <span className="block text-zinc-500 text-xs">Chat & Embeddings</span>
                  </div>
                </div>
                {/* RAG Knowledge */}
                <div className="flex items-center gap-4 p-3 rounded-xl bg-zinc-800/30 border border-brand-blue/10">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center flex-shrink-0">
                    <svg viewBox="0 0 24 24" className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                  </div>
                  <div>
                    <span className="text-zinc-200 font-semibold text-sm">RAG Knowledge Base</span>
                    <span className="block text-zinc-500 text-xs">Embeddings + Busca Semântica</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Seta 2 */}
            <div className="hidden lg:flex items-center justify-center px-4 reveal-on-scroll">
              <ArrowRight className="w-8 h-8 text-zinc-700" />
            </div>

            {/* COLUNA 3 — Ação (O Movimento) */}
            <div className="p-8 sm:p-10 rounded-3xl bg-zinc-900/50 border border-white/5 reveal-on-scroll" style={{ transitionDelay: '200ms' }}>
              <div className="flex items-center gap-3 mb-8">
                <div className="w-12 h-12 rounded-2xl bg-brand-green/15 flex items-center justify-center">
                  <Zap className="w-6 h-6 text-brand-green" />
                </div>
                <h3 className="text-xl font-bold text-zinc-100 tracking-tight">Ação (Workflow)</h3>
              </div>
              <p className="text-zinc-400 text-sm font-medium leading-relaxed mb-8">
                A IA não só responde: ela dispara o Workflow. Cada interação gera uma ação automática no seu sistema.
              </p>
              <div className="space-y-4">
                <div className="flex items-center gap-4 p-3 rounded-xl bg-zinc-800/40 border border-white/5">
                  <div className="w-10 h-10 rounded-xl bg-brand-green/15 flex items-center justify-center flex-shrink-0">
                    <CheckCircle2 className="w-5 h-5 text-brand-green" />
                  </div>
                  <div>
                    <span className="text-zinc-200 font-semibold text-sm">Criar Ticket no CRM</span>
                    <span className="block text-zinc-500 text-xs">Lead qualificado automaticamente</span>
                  </div>
                </div>
                <div className="flex items-center gap-4 p-3 rounded-xl bg-zinc-800/40 border border-white/5">
                  <div className="w-10 h-10 rounded-xl bg-brand-green/15 flex items-center justify-center flex-shrink-0">
                    <CheckCircle2 className="w-5 h-5 text-brand-green" />
                  </div>
                  <div>
                    <span className="text-zinc-200 font-semibold text-sm">Agendar Entrega</span>
                    <span className="block text-zinc-500 text-xs">Roteirização inteligente</span>
                  </div>
                </div>
                <div className="flex items-center gap-4 p-3 rounded-xl bg-zinc-800/40 border border-white/5">
                  <div className="w-10 h-10 rounded-xl bg-brand-green/15 flex items-center justify-center flex-shrink-0">
                    <CheckCircle2 className="w-5 h-5 text-brand-green" />
                  </div>
                  <div>
                    <span className="text-zinc-200 font-semibold text-sm">Atualizar Estoque</span>
                    <span className="block text-zinc-500 text-xs">Sincronização com ERP</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* BLOCO 4 — LOGÍSTICA DE ALTA PRECISÃO (Gráficos Operacionais)      */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <section className="py-24 sm:py-32 px-6 bg-zinc-950 border-t border-white/5 relative z-10 overflow-hidden">
        <div className="absolute right-[-10%] top-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-brand-green/5 blur-[120px] rounded-full pointer-events-none" />
        
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-center gap-16 lg:gap-24">
          <div className="flex-1 reveal-on-scroll">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-green/10 border border-brand-green/20 text-brand-green text-[10px] sm:text-xs font-bold tracking-[0.2em] uppercase mb-8">
              Logística & Eficiência
            </div>
            
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-black mb-8 text-zinc-100 tracking-tighter leading-[1.1]">
              Construído para operações com <br/>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-green to-emerald-400">
                Precisão Cirúrgica.
              </span>
            </h2>
            
            <p className="text-lg sm:text-xl text-zinc-400 leading-relaxed font-medium mb-10">
              Nas operações mais críticas, cada segundo e cada dado conta. O HuginFlow processa grandes volumes de informação instantaneamente, garantindo a governança e a rastreabilidade que as maiores operações exigem para escalar com segurança.
            </p>
            
            <ul className="space-y-5">
              {[
                'Monitoramento ininterrupto de SLAs e engarrafamentos', 
                'Disparo de alertas vitais automatizados e multicanal', 
                'Dashboards táticos atualizados com telemetria real-time'
              ].map((item, i) => (
                <li key={i} className="flex items-center gap-4 text-zinc-200 font-medium text-lg">
                  <div className="w-8 h-8 rounded-full bg-brand-green/10 flex items-center justify-center flex-shrink-0">
                    <CheckCircle2 className="w-5 h-5 text-brand-green" />
                  </div>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          
          {/* Gráficos Operacionais (Tailwind puro) */}
          <div className="flex-1 w-full reveal-on-scroll space-y-6" style={{ transitionDelay: '150ms' }}>
            {/* Gráfico 1: Tempo de Resposta por Canal */}
            <div className="p-6 rounded-2xl bg-zinc-900/60 border border-white/5">
              <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-6">Tempo Médio de Resposta por Canal</h4>
              <div className="space-y-4">
                {[
                  { label: "WhatsApp", value: 92, color: "bg-green-400", time: "1.2s" },
                  { label: "Instagram DM", value: 78, color: "bg-pink-400", time: "3.8s" },
                  { label: "E-mail", value: 65, color: "bg-brand-blue", time: "12s" },
                  { label: "Formulário Web", value: 85, color: "bg-amber-400", time: "2.1s" },
                ].map((bar, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <span className="text-zinc-400 text-xs font-semibold w-28 text-right">{bar.label}</span>
                    <div className="flex-1 h-6 bg-zinc-800 rounded-full overflow-hidden">
                      <div 
                        className={`h-full ${bar.color} rounded-full transition-all duration-1000`} 
                        style={{ width: `${bar.value}%` }} 
                      />
                    </div>
                    <span className="text-zinc-300 text-xs font-bold w-10">{bar.time}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Gráfico 2: Taxa de Automação */}
            <div className="p-6 rounded-2xl bg-zinc-900/60 border border-white/5 flex items-center gap-8">
              <div className="relative w-28 h-28 flex-shrink-0">
                <svg className="w-28 h-28 -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="42" stroke="currentColor" strokeWidth="8" fill="none" className="text-zinc-800" />
                  <circle cx="50" cy="50" r="42" stroke="currentColor" strokeWidth="8" fill="none" className="text-brand-green" strokeDasharray="264" strokeDashoffset="53" strokeLinecap="round" />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-2xl font-black text-zinc-100">80%</span>
                </div>
              </div>
              <div>
                <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">Taxa de Automação IA</h4>
                <p className="text-zinc-400 text-sm font-medium leading-relaxed">
                  80% das interações resolvidas automaticamente sem intervenção humana.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* BLOCO 5 — CALL TO ACTION (O FECHAMENTO)                           */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <section className="py-24 sm:py-32 px-6 bg-zinc-900 relative z-10 border-t border-white/5">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-center">
          
          {/* Frase de Autoridade */}
          <div className="reveal-on-scroll">
            <h2 className="text-5xl sm:text-6xl lg:text-7xl font-black text-zinc-100 tracking-tighter leading-[1.05] mb-8">
              Pronto para colocar sua inteligência <br className="hidden sm:block" />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-blue to-brand-blue-light">
                em movimento?
              </span>
            </h2>
            <p className="text-xl text-zinc-400 font-medium leading-relaxed mb-10">
              A transformação radical da sua operação começa agora. Envie seus dados e nossa equipe de arquitetos de software entrará em contato para mapear seu desafio.
            </p>
            
            <div className="flex items-center gap-4 text-sm text-zinc-500 font-medium">
              <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M22 4L12 14.01l-3-3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              Onboarding Operacional Técnico e Assistido.
            </div>
          </div>
          
          {/* Formulário Elegante */}
          <div className="reveal-on-scroll" style={{ transitionDelay: '150ms' }}>
            {status === "success" ? (
              <div className="bg-zinc-950 p-12 sm:p-16 rounded-[2.5rem] border border-brand-blue/30 shadow-2xl flex flex-col items-center text-center gap-6 animate-in zoom-in duration-500">
                <div className="w-20 h-20 rounded-full bg-brand-blue/10 flex items-center justify-center mb-2">
                  <CheckCircle2 className="w-10 h-10 text-brand-blue" />
                </div>
                <h3 className="text-3xl font-black text-white tracking-tighter">Recebemos seu contato!</h3>
                <p className="text-zinc-400 font-medium">
                  Nossa equipe de especialistas já foi notificada e entrará em contato com você em breve.
                </p>
                <button 
                  onClick={() => setStatus("idle")}
                  className="mt-4 px-8 py-3 rounded-full border border-white/10 text-white text-sm font-bold hover:bg-white/5 transition-all"
                >
                  Enviar outra mensagem
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="bg-zinc-950 p-8 sm:p-10 rounded-[2.5rem] border border-white/5 shadow-2xl flex flex-col gap-5 relative overflow-hidden transition-all duration-500">
                <div className="absolute top-0 right-0 w-64 h-64 bg-brand-blue/5 blur-[100px] rounded-full pointer-events-none" />
                
                {errorMessage && (
                  <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-bold flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {errorMessage}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div className="flex flex-col gap-2 relative z-10">
                    <label className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 pl-2">Nome Completo</label>
                    <input 
                      type="text" 
                      required
                      value={formData.nome}
                      onChange={e => setFormData({...formData, nome: e.target.value})}
                      className="bg-zinc-900 border border-white/5 rounded-2xl p-4 text-zinc-100 text-sm outline-none focus:border-brand-blue/50 focus:bg-zinc-800/50 transition-all placeholder:text-zinc-600" 
                      placeholder="Ex: João Silva" 
                    />
                  </div>
                  
                  <div className="flex flex-col gap-2 relative z-10">
                    <label className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 pl-2">E-mail Corporativo</label>
                    <input 
                      type="email" 
                      required
                      value={formData.email}
                      onChange={e => setFormData({...formData, email: e.target.value})}
                      className="bg-zinc-900 border border-white/5 rounded-2xl p-4 text-zinc-100 text-sm outline-none focus:border-brand-blue/50 focus:bg-zinc-800/50 transition-all placeholder:text-zinc-600" 
                      placeholder="joao@suaempresa.com.br" 
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div className="flex flex-col gap-2 relative z-10">
                    <label className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 pl-2">Empresa</label>
                    <input 
                      type="text" 
                      value={formData.empresa}
                      onChange={e => setFormData({...formData, empresa: e.target.value})}
                      className="bg-zinc-900 border border-white/5 rounded-2xl p-4 text-zinc-100 text-sm outline-none focus:border-brand-blue/50 focus:bg-zinc-800/50 transition-all placeholder:text-zinc-600" 
                      placeholder="Nome da sua empresa" 
                    />
                  </div>

                  <div className="flex flex-col gap-2 relative z-10">
                    <label className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 pl-2">WhatsApp / Telefone</label>
                    <input 
                      type="tel" 
                      required
                      value={formData.telefone}
                      onChange={e => setFormData({...formData, telefone: e.target.value})}
                      className="bg-zinc-900 border border-white/5 rounded-2xl p-4 text-zinc-100 text-sm outline-none focus:border-brand-blue/50 focus:bg-zinc-800/50 transition-all placeholder:text-zinc-600" 
                      placeholder="(DD) 99999-9999" 
                    />
                  </div>
                </div>
                
                <div className="flex flex-col gap-2 relative z-10">
                  <label className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 pl-2">Como podemos ajudar?</label>
                  <textarea 
                    rows={3} 
                    value={formData.mensagem}
                    onChange={e => setFormData({...formData, mensagem: e.target.value})}
                    className="bg-zinc-900 border border-white/5 rounded-2xl p-4 text-zinc-100 text-sm outline-none focus:border-brand-blue/50 focus:bg-zinc-800/50 transition-all resize-none placeholder:text-zinc-600" 
                    placeholder="Descreva brevemente sua necessidade..." 
                  />
                </div>
                
                <button 
                  type="submit" 
                  disabled={status === "loading"}
                  className="mt-4 w-full px-8 py-5 rounded-full bg-zinc-100 hover:bg-white text-zinc-950 font-black tracking-wide transition-all shadow-[0_0_30px_-5px_rgba(255,255,255,0.2)] hover:scale-[1.02] active:scale-[0.98] relative z-10 disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-3"
                >
                  {status === "loading" ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Processando...
                    </>
                  ) : (
                    "Solicitar Contato Comercial"
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-zinc-950 py-10 border-t border-white/5 text-center text-zinc-600 text-sm font-medium relative z-10">
        &copy; {new Date().getFullYear()} HuginFlow Inteligência em Movimento. Todos os direitos reservados.
      </footer>
    </div>
  );
}
