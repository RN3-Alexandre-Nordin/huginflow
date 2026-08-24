"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useId, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Banknote,
  CheckCircle2,
  ClipboardList,
  GitBranch,
  Headphones,
  Link2,
  Loader2,
  Menu,
  Package,
  Scale,
  ShieldCheck,
  Sparkles,
  Users,
  Workflow,
  X,
} from "lucide-react";

const NAV_ITEMS = [
  { id: "como-funciona", label: "Como funciona" },
  { id: "casos-de-uso", label: "Na prática" },
  { id: "integracoes", label: "Com o que você já usa" },
  { id: "governanca", label: "Você no comando" },
  { id: "contato", label: "Fale conosco" },
] as const;

const FLOW_STEPS = [
  "Disparo",
  "Contexto",
  "Decisão",
  "Ação",
  "Acompanhamento",
] as const;

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Dispara",
    description: "Um pedido, formulário, e-mail, sistema ou canal inicia o fluxo — do jeito que a sua operação já trabalha.",
    icon: Link2,
  },
  {
    step: "02",
    title: "Entende",
    description: "A Hugin Flow reúne o contexto necessário para o time agir sem caçar informação em planilha e e-mail.",
    icon: Sparkles,
  },
  {
    step: "03",
    title: "Decide",
    description: "Aplica as regras da empresa: prioridade, responsável, aprovação e o que pode seguir sozinho.",
    icon: Scale,
  },
  {
    step: "04",
    title: "Executa",
    description: "Cria tarefas, atualiza registros, aciona outras áreas e dispara o próximo passo do workflow.",
    icon: Workflow,
  },
  {
    step: "05",
    title: "Acompanha",
    description: "Gestores e times veem status, donos e pendências — do início ao encerramento do processo.",
    icon: ClipboardList,
  },
] as const;

const USE_CASES = [
  {
    title: "Vendas e CRM",
    description: "Do lead ao fechamento, cada etapa tem dono, prazo e histórico — sem oportunidade esquecida no meio do caminho.",
    icon: Users,
    actions: [
      "Qualificação e distribuição do lead",
      "Próximo contato com contexto completo",
      "Atualização do CRM no andamento",
      "Follow-up no momento certo",
    ],
  },
  {
    title: "Atendimento",
    description: "Solicitações entram no fluxo certo, com prioridade e encaminhamento claros — inclusive por canais como WhatsApp.",
    icon: Headphones,
    actions: [
      "Triagem e classificação do pedido",
      "Histórico visível para o atendente",
      "Respostas e handoff padronizados",
      "Escalonamento quando precisa de gente",
    ],
  },
  {
    title: "Operações e logística",
    description: "Pedidos, status e handoffs entre áreas deixam de viver em planilha solta ou conversa privada.",
    icon: Package,
    actions: [
      "Status do pedido sempre atualizado",
      "Alerta quando algo atrasa",
      "Responsável de cada pendência",
      "Acionamento de equipes e parceiros",
    ],
  },
  {
    title: "Financeiro",
    description: "Cobranças e pendências ganham um caminho com dono e prazo — sem depender de lembrete manual.",
    icon: Banknote,
    actions: [
      "Cobranças por prioridade",
      "Avisos antes do vencimento",
      "Pendências fáceis de encontrar",
      "Escalonamento para análise humana",
    ],
  },
  {
    title: "Onboarding e CS",
    description: "Do contrato ao primeiro uso, cada marco do cliente tem etapa, responsável e acompanhamento.",
    icon: CheckCircle2,
    actions: [
      "Checklist por etapa",
      "Documentos e pendências no radar",
      "Alertas do que ainda falta",
      "Cliente informado do progresso",
    ],
  },
  {
    title: "Processos internos",
    description: "Compras, aprovações e chamados internos param de virar e-mail infinito entre departamentos.",
    icon: GitBranch,
    actions: [
      "Solicitação com responsável",
      "Aprovações no fluxo",
      "Chamados com histórico",
      "Handoff entre áreas sem retrabalho",
    ],
  },
] as const;

const PILLARS = [
  {
    title: "Contexto",
    description: "O time decide com o que precisa na mão — menos retrabalho e menos “me manda de novo”.",
  },
  {
    title: "Regras do negócio",
    description: "Prioridades, permissões e aprovações que a sua empresa já usa no dia a dia.",
  },
  {
    title: "Próxima ação",
    description: "O workflow empurra a etapa seguinte: tarefa, atualização, alerta ou handoff.",
  },
] as const;

const INTEGRATION_GROUPS = [
  {
    title: "Canais",
    items: ["WhatsApp", "Instagram", "E-mail", "Formulários"],
  },
  {
    title: "Sistemas",
    items: ["CRM", "ERP", "Ferramentas internas"],
  },
  {
    title: "Conexões",
    items: ["APIs", "Webhooks", "Automações"],
  },
] as const;

const GOVERNANCE = [
  "Aprovação humana nas etapas sensíveis",
  "Histórico do que foi feito e por quê",
  "Cada etapa com responsável definido",
  "Acesso certo para cada pessoa",
  "Prazos e compromissos visíveis",
  "Dá para pausar ou revisar um fluxo",
  "Menos surpresa, mais previsibilidade",
] as const;

const EXAMPLE_FLOW = [
  "Uma nova oportunidade entra no comercial",
  "O fluxo reúne histórico, prioridade e dados do CRM",
  "Define o responsável e o próximo passo comercial",
  "Quando fecha, dispara o onboarding ou a logística",
  "Outra área recebe a tarefa com o contexto certo",
  "Pendências e prazos ficam visíveis para o gestor",
  "O processo termina com trilha auditável do início ao fim",
] as const;

const CLARITY_POINTS = [
  "Menos processo perdido entre áreas",
  "Menos “de quem é essa demanda?”",
  "Mais tempo para o que só humano resolve",
] as const;

type FormErrors = Partial<
  Record<"nome" | "email" | "empresa" | "telefone" | "mensagem" | "consentimento", string>
>;

function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function isValidBrazilianPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length === 10 || digits.length === 11;
}

export default function HomePage() {
  const formIds = {
    nome: useId(),
    email: useId(),
    empresa: useId(),
    telefone: useId(),
    mensagem: useId(),
    consentimento: useId(),
    formError: useId(),
  };

  const [formData, setFormData] = useState({
    nome: "",
    email: "",
    empresa: "",
    telefone: "",
    mensagem: "",
  });
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({});
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<string>("");

  useEffect(() => {
    const reduceMotion = prefersReducedMotion();
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
      { threshold: 0.12 }
    );

    document.querySelectorAll(".reveal-on-scroll").forEach((el) => {
      if (reduceMotion) {
        (el as HTMLElement).style.opacity = "1";
        return;
      }
      (el as HTMLElement).style.opacity = "0";
      observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const sections = NAV_ITEMS.map((item) => document.getElementById(item.id)).filter(
      Boolean
    ) as HTMLElement[];
    if (!sections.length) return;

    const spy = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveSection(entry.target.id);
        });
      },
      { rootMargin: "-35% 0px -50% 0px", threshold: 0.1 }
    );

    sections.forEach((section) => spy.observe(section));
    return () => spy.disconnect();
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    setMenuOpen(false);
    el.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "start",
    });
    window.history.replaceState(null, "", `#${id}`);
  };

  const validateForm = (): FormErrors => {
    const errors: FormErrors = {};
    if (!formData.nome.trim()) errors.nome = "Informe seu nome.";
    if (!formData.email.trim()) {
      errors.email = "Informe um e-mail corporativo.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = "Informe um e-mail válido.";
    }
    if (!formData.empresa.trim()) errors.empresa = "Informe o nome da empresa.";
    if (!formData.telefone.trim()) {
      errors.telefone = "Informe WhatsApp ou telefone.";
    } else if (!isValidBrazilianPhone(formData.telefone)) {
      errors.telefone = "Informe um telefone brasileiro válido (DDD + número).";
    }
    if (!formData.mensagem.trim()) {
      errors.mensagem = "Conte um pouco do que quer melhorar no dia a dia.";
    }
    if (!consentAccepted) {
      errors.consentimento = "É necessário aceitar a Política de Privacidade para continuar.";
    }
    return errors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === "loading") return;

    setErrorMessage("");
    const errors = validateForm();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setStatus("error");
      setErrorMessage("Revise os campos destacados para continuar.");
      return;
    }

    setStatus("loading");

    try {
      // Endpoint de contato/inbound — requer NEXT_PUBLIC_LANDING_PAGE_TOKEN e canal configurado.
      const response = await fetch("/api/inbound/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: formData.nome.trim(),
          email: formData.email.trim(),
          telefone: formData.telefone.trim(),
          mensagem: `Empresa: ${formData.empresa.trim()} | Processo: ${formData.mensagem.trim()}`,
          token: process.env.NEXT_PUBLIC_LANDING_PAGE_TOKEN,
        }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || result.message || "Erro ao enviar contato");
      }

      setStatus("success");
      setFieldErrors({});
      setConsentAccepted(false);
      setFormData({ nome: "", email: "", empresa: "", telefone: "", mensagem: "" });
    } catch (err: unknown) {
      // Em caso de erro, preservamos os dados preenchidos.
      const message =
        err instanceof Error
          ? err.message
          : "Não foi possível enviar agora. Tente novamente em instantes.";
      setStatus("error");
      setErrorMessage(message);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 font-sans selection:bg-brand-blue/30 relative overflow-x-clip">
      <div
        className="absolute inset-0 opacity-[0.07] pointer-events-none z-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
        aria-hidden
      />
      <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-brand-blue/20 blur-[160px] rounded-full pointer-events-none z-0" aria-hidden />

      {/* HEADER */}
      <header className="fixed top-0 left-0 right-0 h-20 border-b border-white/5 bg-zinc-950/80 backdrop-blur-md z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-full flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" })}
            className="flex-shrink-0 cursor-pointer rounded-lg"
            aria-label="Hugin Flow — voltar ao topo"
          >
            <img
              src="/logo-principal.png?v=20260824b"
              alt="Hugin Flow"
              className="h-10 sm:h-12 w-auto object-contain"
            />
          </button>

          <nav
            className="hidden lg:flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-1.5 py-1.5"
            aria-label="Seções da página"
          >
            {NAV_ITEMS.map((item) => {
              const active = activeSection === item.id;
              return (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToSection(item.id);
                  }}
                  className={`relative px-3.5 py-2 rounded-full text-sm font-semibold tracking-wide transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue ${
                    active
                      ? "text-white bg-white/10"
                      : "text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.04]"
                  }`}
                >
                  {item.label}
                </a>
              );
            })}
          </nav>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              className="lg:hidden inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-zinc-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"
              aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
              aria-expanded={menuOpen}
              aria-controls="mobile-nav"
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <X className="w-5 h-5" aria-hidden /> : <Menu className="w-5 h-5" aria-hidden />}
            </button>
            <a
              href="#contato"
              onClick={(e) => {
                e.preventDefault();
                scrollToSection("contato");
              }}
              className="hidden sm:inline-flex px-3 lg:px-4 py-2.5 rounded-full border border-white/15 hover:border-brand-blue/40 hover:bg-brand-blue/10 text-zinc-100 text-sm font-semibold tracking-wide transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"
            >
              Falar com a gente
            </a>
            <Link
              href="/login"
              className="px-3 sm:px-4 lg:px-5 py-2.5 rounded-full bg-brand-blue hover:bg-brand-blue-light text-white text-sm font-semibold tracking-wide border border-brand-blue/50 transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue flex items-center gap-2"
            >
              Entrar
              <ArrowRight className="w-3.5 h-3.5" aria-hidden />
            </Link>
          </div>
        </div>

        {menuOpen && (
          <div
            id="mobile-nav"
            className="lg:hidden border-t border-white/5 bg-zinc-950/98 backdrop-blur-xl"
          >
            <nav className="max-w-7xl mx-auto px-4 py-4 flex flex-col gap-1" aria-label="Menu mobile">
              {NAV_ITEMS.map((item) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToSection(item.id);
                  }}
                  className={`px-4 py-3 rounded-xl text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue ${
                    activeSection === item.id
                      ? "text-brand-blue bg-brand-blue/10"
                      : "text-zinc-300 hover:text-white hover:bg-white/[0.04]"
                  }`}
                >
                  {item.label}
                </a>
              ))}
              <a
                href="#contato"
                onClick={(e) => {
                  e.preventDefault();
                  scrollToSection("contato");
                }}
                className="mt-2 px-4 py-3 rounded-xl text-sm font-semibold text-zinc-950 bg-zinc-100 hover:bg-white text-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"
              >
                Falar com a gente
              </a>
            </nav>
          </div>
        )}
      </header>

      <main>
        {/* HERO */}
        <section className="relative pt-24 sm:pt-28 pb-0 px-0 flex flex-col items-center">
          <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 z-10 flex flex-col items-center text-center pt-4 sm:pt-8 pb-10">
            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black tracking-tighter leading-[1.08] mb-5 max-w-5xl">
              <span className="block text-zinc-100">Workflows que o time</span>
              <span className="block text-transparent bg-clip-text bg-gradient-to-r from-white to-brand-blue-light pb-1">
                realmente consegue seguir
              </span>
            </h1>

            <p className="text-lg sm:text-xl text-zinc-300 max-w-2xl leading-relaxed mb-8">
              A Hugin Flow orquestra vendas, atendimento, logística e processos internos — com pessoas no comando e inteligência no caminho.
            </p>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto mb-8">
              <a
                href="#contato"
                onClick={(e) => {
                  e.preventDefault();
                  scrollToSection("contato");
                }}
                className="px-8 py-4 rounded-full bg-zinc-100 hover:bg-white text-zinc-950 font-bold tracking-wide transition-all flex items-center justify-center gap-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"
              >
                Quero conversar
                <ArrowRight className="w-4 h-4" aria-hidden />
              </a>
              <a
                href="#como-funciona"
                onClick={(e) => {
                  e.preventDefault();
                  scrollToSection("como-funciona");
                }}
                className="px-8 py-4 rounded-full border border-white/15 hover:border-brand-blue/40 hover:bg-brand-blue/10 text-zinc-100 font-bold tracking-wide transition-all flex items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"
              >
                Ver como funciona
              </a>
            </div>

            <div
              className="w-full max-w-3xl reveal-on-scroll"
              aria-label="Etapas de um workflow: disparo, contexto, decisão, ação e acompanhamento"
            >
              <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
                {FLOW_STEPS.map((step, index) => (
                  <div key={step} className="flex items-center gap-2 sm:gap-3">
                    <div className="px-3 sm:px-4 py-2 rounded-xl border border-white/15 bg-zinc-900 text-xs sm:text-sm font-semibold text-zinc-100">
                      {step}
                    </div>
                    {index < FLOW_STEPS.length - 1 && (
                      <>
                        <ArrowRight className="w-4 h-4 text-brand-blue/90 hidden sm:block" aria-hidden />
                        <span className="sm:hidden text-brand-blue/80 text-xs" aria-hidden>
                          ·
                        </span>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <figure className="relative z-10 w-full reveal-on-scroll">
            <div className="relative w-full max-h-[min(72vh,720px)] overflow-hidden border-y border-white/10">
              <Image
                src="/images/landing-team-workflow.png"
                alt="Equipe colaborando em torno de um painel de workflows da Hugin Flow"
                width={1920}
                height={1080}
                className="w-full h-full object-cover object-center"
                priority
              />
              <div
                className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-transparent to-zinc-950/40 pointer-events-none"
                aria-hidden
              />
            </div>
            <figcaption className="px-4 sm:px-6 py-4 text-center text-sm text-zinc-400">
              Pessoas conduzindo o processo — a plataforma organiza o caminho.
            </figcaption>
          </figure>
        </section>

        {/* COMO FUNCIONA */}
        <section
          id="como-funciona"
          className="py-20 sm:py-28 px-4 sm:px-6 bg-zinc-900 border-b border-white/5 relative z-10 scroll-mt-24"
        >
          <div className="max-w-7xl mx-auto">
            <div className="max-w-3xl mx-auto text-center mb-14 reveal-on-scroll">
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tighter text-zinc-100 mb-4">
                Do disparo ao encerramento, em um só fluxo
              </h2>
              <p className="text-lg text-zinc-400">
                A Hugin Flow é um sistema de workflows: cada etapa sabe o que veio antes e o que vem depois.
              </p>
            </div>

            <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 sm:gap-5">
              {HOW_IT_WORKS.map((item) => {
                const Icon = item.icon;
                return (
                  <li
                    key={item.step}
                    className="reveal-on-scroll rounded-2xl border border-white/10 bg-zinc-950/60 p-5 sm:p-6"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-xs font-bold tracking-[0.2em] text-brand-blue">
                        {item.step}
                      </span>
                      <Icon className="w-5 h-5 text-brand-blue" aria-hidden />
                    </div>
                    <h3 className="text-xl font-bold text-zinc-100 mb-2">{item.title}</h3>
                    <p className="text-sm text-zinc-400 leading-relaxed">{item.description}</p>
                  </li>
                );
              })}
            </ol>
            <p className="reveal-on-scroll mt-10 text-center text-base sm:text-lg text-zinc-300 max-w-3xl mx-auto">
              Um fluxo pode acionar outro — por exemplo, venda fechada que abre logística ou onboarding.
            </p>
          </div>
        </section>

        {/* PESSOAS + PRODUTO */}
        <section className="py-16 sm:py-24 px-4 sm:px-6 relative z-10">
          <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-14 items-center">
            <figure className="reveal-on-scroll order-2 lg:order-1">
              <div className="relative overflow-hidden rounded-2xl border border-white/10">
                <Image
                  src="/images/landing-manager-cockpit.png"
                  alt="Gestora acompanhando workflows no painel da Hugin Flow"
                  width={1600}
                  height={900}
                  className="w-full h-auto object-cover"
                />
              </div>
            </figure>
            <div className="reveal-on-scroll order-1 lg:order-2">
              <h2 className="text-3xl sm:text-4xl font-black tracking-tighter text-zinc-100 mb-4">
                Feita para quem conduz o processo — não só para quem digita
              </h2>
              <p className="text-lg text-zinc-400 leading-relaxed mb-6">
                Atendentes, comerciais, operações e gestores trabalham no mesmo mapa: o que está em andamento, quem é o dono e o que falta para fechar.
              </p>
              <div className="relative rounded-2xl border border-zinc-800/60 overflow-hidden ring-1 ring-white/[0.03]">
                <div className="h-9 w-full bg-zinc-900/80 border-b border-white/5 flex items-center px-4 gap-2" aria-hidden>
                  <div className="w-2 h-2 rounded-full bg-zinc-700" />
                  <div className="w-2 h-2 rounded-full bg-zinc-700" />
                  <div className="w-2 h-2 rounded-full bg-zinc-700" />
                </div>
                <Image
                  src="/images/cockpit-screenshot.png"
                  alt="Tela do cockpit Hugin Flow com fluxos e tarefas"
                  width={1920}
                  height={1080}
                  className="w-full h-auto"
                />
              </div>
            </div>
          </div>
        </section>

        {/* CASOS DE USO */}
        <section id="casos-de-uso" className="py-20 sm:py-28 px-4 sm:px-6 bg-zinc-900 border-y border-white/5 relative z-10 scroll-mt-24">
          <div className="max-w-7xl mx-auto">
            <div className="max-w-3xl mx-auto text-center mb-14 reveal-on-scroll">
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tighter text-zinc-100 mb-4">
                Um motor de workflow para várias áreas
              </h2>
              <p className="text-lg text-zinc-400">
                Atendimento por canal é uma possibilidade. O mesmo núcleo serve vendas, logística, financeiro, onboarding e processos internos.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {USE_CASES.map((item) => {
                const Icon = item.icon;
                return (
                  <article
                    key={item.title}
                    className="reveal-on-scroll rounded-2xl border border-white/10 bg-zinc-950/60 p-6 flex flex-col"
                  >
                    <div className="w-11 h-11 rounded-xl bg-brand-blue/10 border border-brand-blue/20 flex items-center justify-center mb-4">
                      <Icon className="w-5 h-5 text-brand-blue" aria-hidden />
                    </div>
                    <h3 className="text-xl font-bold text-zinc-100 mb-2">{item.title}</h3>
                    <p className="text-sm text-zinc-400 mb-4 leading-relaxed">{item.description}</p>
                    <ul className="mt-auto space-y-2">
                      {item.actions.map((action) => (
                        <li key={action} className="flex items-start gap-2 text-sm text-zinc-300">
                          <CheckCircle2 className="w-4 h-4 text-brand-green mt-0.5 flex-shrink-0" aria-hidden />
                          <span>{action}</span>
                        </li>
                      ))}
                    </ul>
                  </article>
                );
              })}
            </div>

            <div className="reveal-on-scroll mt-12 text-center max-w-3xl mx-auto">
              <p className="text-sm sm:text-base text-zinc-400 mb-5">
                Conta qual processo da empresa mais precisa de ritmo — a gente ajuda a escolher o primeiro fluxo.
              </p>
              <a
                href="#contato"
                onClick={(e) => {
                  e.preventDefault();
                  scrollToSection("contato");
                }}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full border border-brand-blue/40 bg-brand-blue/10 hover:bg-brand-blue/20 text-brand-blue-light font-semibold transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"
              >
                Quero começar por um fluxo
                <ArrowRight className="w-4 h-4" aria-hidden />
              </a>
            </div>
          </div>
        </section>

        {/* VALOR: CONTEXTO / REGRAS / AÇÕES */}
        <section className="py-20 sm:py-28 px-4 sm:px-6 relative z-10">
          <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div className="reveal-on-scroll">
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tighter text-zinc-100 mb-5">
                Entender ajuda. Fazer o fluxo andar é o que muda o resultado.
              </h2>
              <p className="text-lg text-zinc-400 leading-relaxed mb-8">
                A Hugin Flow junta contexto, aplica as regras do negócio e conduz a próxima ação — com revisão humana nas etapas críticas.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {PILLARS.map((pillar) => (
                  <div
                    key={pillar.title}
                    className="rounded-2xl border border-white/10 bg-zinc-900/50 p-5"
                  >
                    <h3 className="text-lg font-bold text-brand-blue mb-2">{pillar.title}</h3>
                    <p className="text-sm text-zinc-400 leading-relaxed">{pillar.description}</p>
                  </div>
                ))}
              </div>
            </div>
            <figure className="reveal-on-scroll">
              <div className="relative overflow-hidden rounded-2xl border border-white/10">
                <Image
                  src="/images/landing-ops-handoff.png"
                  alt="Colaboradores alinhando o handoff de um processo entre áreas"
                  width={1600}
                  height={1200}
                  className="w-full h-auto object-cover"
                />
              </div>
              <figcaption className="mt-3 text-sm text-zinc-500 text-center lg:text-left">
                Handoff entre áreas com contexto — sem perder o fio do processo.
              </figcaption>
            </figure>
          </div>
        </section>

        {/* INTEGRAÇÕES */}
        <section id="integracoes" className="py-20 sm:py-28 px-4 sm:px-6 bg-zinc-900 border-y border-white/5 relative z-10 scroll-mt-24">
          <div className="max-w-7xl mx-auto">
            <div className="max-w-3xl mx-auto text-center mb-12 reveal-on-scroll">
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tighter text-zinc-100 mb-4">
                Encaixa no ambiente da sua operação
              </h2>
              <p className="text-lg text-zinc-400">
                Canais, CRM, ERP e sistemas internos alimentam o mesmo workflow — sem precisar trocar tudo de uma vez.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 reveal-on-scroll">
              {INTEGRATION_GROUPS.map((group) => (
                <div
                  key={group.title}
                  className="rounded-2xl border border-white/10 bg-zinc-950/50 p-6"
                >
                  <h3 className="text-sm font-bold tracking-[0.18em] uppercase text-brand-blue mb-4">
                    {group.title}
                  </h3>
                  <ul className="flex flex-wrap gap-2" aria-label={group.title}>
                    {group.items.map((item) => (
                      <li
                        key={item}
                        className="px-3 py-1.5 rounded-full border border-white/10 bg-zinc-900/70 text-sm font-semibold text-zinc-200"
                      >
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <p className="reveal-on-scroll mt-8 text-center text-sm text-zinc-500 max-w-2xl mx-auto">
              WhatsApp é um dos canais possíveis — o foco é o fluxo que conecta pessoas e sistemas.
            </p>
          </div>
        </section>

        {/* GOVERNANÇA */}
        <section
          id="governanca"
          className="py-20 sm:py-28 px-4 sm:px-6 relative z-10 scroll-mt-24"
        >
          <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-start">
            <div className="reveal-on-scroll">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-green/10 border border-brand-green/20 text-brand-green text-xs font-bold tracking-widest uppercase mb-6">
                <ShieldCheck className="w-3.5 h-3.5" aria-hidden />
                Automação com gente no comando
              </div>
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tighter text-zinc-100 mb-5">
                Mais ritmo. Sem abrir mão do controle.
              </h2>
              <p className="text-lg text-zinc-400 leading-relaxed">
                A inteligência cuida do repetitivo. Nas decisões sensíveis, quem manda é a sua equipe — com histórico, permissão e possibilidade de pausar o fluxo.
              </p>
            </div>

            <ul className="reveal-on-scroll grid grid-cols-1 sm:grid-cols-2 gap-3">
              {GOVERNANCE.map((item) => (
                <li
                  key={item}
                  className="rounded-xl border border-white/10 bg-zinc-900/50 px-4 py-3 text-sm text-zinc-300 flex items-start gap-2"
                >
                  <CheckCircle2 className="w-4 h-4 text-brand-green mt-0.5 flex-shrink-0" aria-hidden />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* EXEMPLO PRÁTICO */}
        <section className="py-20 sm:py-28 px-4 sm:px-6 bg-zinc-900 border-y border-white/5 relative z-10">
          <div className="max-w-4xl mx-auto reveal-on-scroll">
            <p className="text-xs font-bold tracking-[0.2em] uppercase text-zinc-500 mb-3">
              Exemplo de workflow
            </p>
            <h2 className="text-3xl sm:text-4xl font-black tracking-tighter text-zinc-100 mb-3">
              Da oportunidade comercial à próxima área — sem perder contexto
            </h2>
            <p className="text-zinc-400 mb-8 max-w-2xl">
              Um fluxo ilustrativo. Na sua empresa, as regras, os sistemas e os responsáveis são os de vocês.
            </p>

            <ol className="space-y-3">
              {EXAMPLE_FLOW.map((step, index) => (
                <li
                  key={step}
                  className="flex items-start gap-4 rounded-xl border border-white/10 bg-zinc-950/50 px-4 py-3"
                >
                  <span className="flex-shrink-0 w-8 h-8 rounded-full bg-brand-blue/15 text-brand-blue text-sm font-bold flex items-center justify-center">
                    {index + 1}
                  </span>
                  <span className="text-sm sm:text-base text-zinc-200 pt-1">{step}</span>
                </li>
              ))}
            </ol>

            <div className="mt-8">
              <a
                href="#contato"
                onClick={(e) => {
                  e.preventDefault();
                  scrollToSection("contato");
                }}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full border border-brand-blue/40 bg-brand-blue/10 hover:bg-brand-blue/20 text-brand-blue-light font-semibold transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"
              >
                Quero um fluxo assim na minha empresa
                <ArrowRight className="w-4 h-4" aria-hidden />
              </a>
            </div>
          </div>
        </section>

        {/* CLAREZA */}
        <section className="py-16 sm:py-20 px-4 sm:px-6 relative z-10">
          <div className="max-w-5xl mx-auto reveal-on-scroll text-center">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tighter text-zinc-100 mb-8">
              Feita para quem precisa que o processo ande de ponta a ponta
            </h2>
            <ul className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {CLARITY_POINTS.map((point) => (
                <li
                  key={point}
                  className="rounded-2xl border border-white/10 bg-zinc-900/50 px-5 py-6 text-sm sm:text-base text-zinc-300"
                >
                  {point}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* CONTATO */}
        <section
          id="contato"
          className="py-20 sm:py-28 px-4 sm:px-6 bg-zinc-900 border-t border-white/5 relative z-10 scroll-mt-24"
        >
          <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-start">
            <div className="reveal-on-scroll">
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tighter text-zinc-100 mb-5">
                Qual workflow você quer colocar no ar?
              </h2>
              <p className="text-lg text-zinc-400 leading-relaxed mb-8">
                Conta onde a operação perde ritmo — entre áreas, no comercial, na logística ou no atendimento. A gente ajuda a desenhar o primeiro fluxo.
              </p>
              <ul className="space-y-3 text-sm text-zinc-300">
                {[
                  "Menos retrabalho entre times e sistemas",
                  "Responsáveis e prazos visíveis no fluxo",
                  "Automação com aprovação humana quando precisar",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-brand-green mt-0.5 flex-shrink-0" aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="reveal-on-scroll">
              {status === "success" ? (
                <div
                  className="bg-zinc-950 p-8 sm:p-10 rounded-[2rem] border border-brand-blue/30 flex flex-col items-center text-center gap-4"
                  role="status"
                  aria-live="polite"
                >
                  <CheckCircle2 className="w-12 h-12 text-brand-blue" aria-hidden />
                  <h3 className="text-2xl font-black text-white tracking-tight">Recebemos sua mensagem</h3>
                  <p className="text-zinc-400">
                    Obrigado. Em breve alguém da Hugin Flow fala com você.
                  </p>
                  <button
                    type="button"
                    onClick={() => setStatus("idle")}
                    className="mt-2 px-6 py-3 rounded-full border border-white/10 text-white text-sm font-bold hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"
                  >
                    Enviar outra mensagem
                  </button>
                </div>
              ) : (
                <form
                  onSubmit={handleSubmit}
                  noValidate
                  className="bg-zinc-950 p-6 sm:p-8 rounded-[2rem] border border-white/5 flex flex-col gap-4"
                  aria-describedby={errorMessage ? formIds.formError : undefined}
                >
                  {(status === "error" || errorMessage) && (
                    <div
                      id={formIds.formError}
                      role="alert"
                      className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
                    >
                      <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden />
                      <span>{errorMessage || "Não foi possível enviar. Tente novamente."}</span>
                    </div>
                  )}

                  <div className="flex flex-col gap-1.5">
                    <label htmlFor={formIds.nome} className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 pl-1">
                      Nome <span className="text-brand-blue">*</span>
                    </label>
                    <input
                      id={formIds.nome}
                      name="nome"
                      autoComplete="name"
                      required
                      value={formData.nome}
                      onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                      aria-invalid={Boolean(fieldErrors.nome)}
                      aria-describedby={fieldErrors.nome ? `${formIds.nome}-error` : undefined}
                      className="bg-zinc-900 border border-white/10 rounded-2xl p-4 text-zinc-100 text-sm outline-none focus:border-brand-blue/50"
                      placeholder="Seu nome"
                    />
                    {fieldErrors.nome && (
                      <p id={`${formIds.nome}-error`} className="text-xs text-red-300 pl-1">
                        {fieldErrors.nome}
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor={formIds.email} className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 pl-1">
                        E-mail corporativo <span className="text-brand-blue">*</span>
                      </label>
                      <input
                        id={formIds.email}
                        name="email"
                        type="email"
                        autoComplete="email"
                        required
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        aria-invalid={Boolean(fieldErrors.email)}
                        aria-describedby={fieldErrors.email ? `${formIds.email}-error` : undefined}
                        className="bg-zinc-900 border border-white/10 rounded-2xl p-4 text-zinc-100 text-sm outline-none focus:border-brand-blue/50"
                        placeholder="nome@empresa.com"
                      />
                      {fieldErrors.email && (
                        <p id={`${formIds.email}-error`} className="text-xs text-red-300 pl-1">
                          {fieldErrors.email}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label htmlFor={formIds.empresa} className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 pl-1">
                        Empresa <span className="text-brand-blue">*</span>
                      </label>
                      <input
                        id={formIds.empresa}
                        name="empresa"
                        autoComplete="organization"
                        required
                        value={formData.empresa}
                        onChange={(e) => setFormData({ ...formData, empresa: e.target.value })}
                        aria-invalid={Boolean(fieldErrors.empresa)}
                        aria-describedby={fieldErrors.empresa ? `${formIds.empresa}-error` : undefined}
                        className="bg-zinc-900 border border-white/10 rounded-2xl p-4 text-zinc-100 text-sm outline-none focus:border-brand-blue/50"
                        placeholder="Nome da empresa"
                      />
                      {fieldErrors.empresa && (
                        <p id={`${formIds.empresa}-error`} className="text-xs text-red-300 pl-1">
                          {fieldErrors.empresa}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label htmlFor={formIds.telefone} className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 pl-1">
                      WhatsApp ou telefone <span className="text-brand-blue">*</span>
                    </label>
                    <input
                      id={formIds.telefone}
                      name="telefone"
                      type="tel"
                      autoComplete="tel"
                      inputMode="tel"
                      required
                      value={formData.telefone}
                      onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
                      aria-invalid={Boolean(fieldErrors.telefone)}
                      aria-describedby={fieldErrors.telefone ? `${formIds.telefone}-error` : undefined}
                      className="bg-zinc-900 border border-white/10 rounded-2xl p-4 text-zinc-100 text-sm outline-none focus:border-brand-blue/50"
                      placeholder="(11) 99999-9999"
                    />
                    {fieldErrors.telefone && (
                      <p id={`${formIds.telefone}-error`} className="text-xs text-red-300 pl-1">
                        {fieldErrors.telefone}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label htmlFor={formIds.mensagem} className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 pl-1">
                      O que você quer melhorar? <span className="text-brand-blue">*</span>
                    </label>
                    <textarea
                      id={formIds.mensagem}
                      name="mensagem"
                      rows={3}
                      required
                      value={formData.mensagem}
                      onChange={(e) => setFormData({ ...formData, mensagem: e.target.value })}
                      aria-invalid={Boolean(fieldErrors.mensagem)}
                      aria-describedby={fieldErrors.mensagem ? `${formIds.mensagem}-error` : undefined}
                      className="bg-zinc-900 border border-white/10 rounded-2xl p-4 text-zinc-100 text-sm outline-none focus:border-brand-blue/50 resize-none"
                      placeholder="Ex.: lead que some entre áreas, aprovação lenta, logística sem status, onboarding incompleto…"
                    />
                    {fieldErrors.mensagem && (
                      <p id={`${formIds.mensagem}-error`} className="text-xs text-red-300 pl-1">
                        {fieldErrors.mensagem}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label
                      htmlFor={formIds.consentimento}
                      className="flex items-start gap-3 text-sm text-zinc-400 cursor-pointer"
                    >
                      <input
                        id={formIds.consentimento}
                        name="consentimento"
                        type="checkbox"
                        checked={consentAccepted}
                        onChange={(e) => setConsentAccepted(e.target.checked)}
                        aria-invalid={Boolean(fieldErrors.consentimento)}
                        aria-describedby={
                          fieldErrors.consentimento ? `${formIds.consentimento}-error` : undefined
                        }
                        className="mt-1 h-4 w-4 rounded border-white/20 bg-zinc-900 text-brand-blue focus:ring-brand-blue"
                      />
                      <span>
                        Concordo com o uso dos meus dados para resposta a esta solicitação, conforme a{" "}
                        <Link href="/privacidade" className="text-brand-blue hover:underline">
                          Política de Privacidade
                        </Link>
                        . <span className="text-brand-blue">*</span>
                      </span>
                    </label>
                    {fieldErrors.consentimento && (
                      <p id={`${formIds.consentimento}-error`} className="text-xs text-red-300 pl-1">
                        {fieldErrors.consentimento}
                      </p>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={status === "loading"}
                    className="mt-2 w-full px-8 py-4 rounded-full bg-zinc-100 hover:bg-white text-zinc-950 font-black tracking-wide transition-all disabled:opacity-50 flex items-center justify-center gap-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"
                  >
                    {status === "loading" ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" aria-hidden />
                        Enviando...
                      </>
                    ) : (
                      "Quero conversar com a Hugin Flow"
                    )}
                  </button>
                  <p className="text-[11px] text-zinc-500 text-center leading-relaxed">
                    Seus dados serão usados apenas para responder a esta solicitação. Consulte nossa{" "}
                    <Link href="/privacidade" className="text-zinc-300 hover:underline">
                      Política de Privacidade
                    </Link>
                    .
                  </p>
                </form>
              )}
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-zinc-950 py-10 border-t border-white/5 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col md:flex-row items-center justify-between gap-6 text-sm">
          <p className="text-zinc-500 text-center md:text-left font-medium">
            Hugin Flow — workflows inteligentes, pessoas no comando.
          </p>
          <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-zinc-400" aria-label="Rodapé">
            <Link href="/privacidade" className="hover:text-zinc-200 transition-colors">
              Política de Privacidade
            </Link>
            <Link href="/termos" className="hover:text-zinc-200 transition-colors">
              Termos de Uso
            </Link>
            <a
              href="#contato"
              onClick={(e) => {
                e.preventDefault();
                scrollToSection("contato");
              }}
              className="hover:text-zinc-200 transition-colors"
            >
              Contato
            </a>
            <Link href="/login" className="hover:text-brand-blue transition-colors font-semibold">
              Entrar
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
