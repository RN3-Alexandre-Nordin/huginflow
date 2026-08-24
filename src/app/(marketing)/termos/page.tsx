import Link from "next/link";
import type { Metadata } from "next";
import { PLATFORM_NAME, PLATFORM_TAGLINE } from "@/lib/branding/platform";

export const metadata: Metadata = {
  title: `Termos de Uso | ${PLATFORM_NAME}`,
  description: `Termos de Uso da ${PLATFORM_NAME}.`,
};

export default function TermosPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 px-6 py-16">
      <div className="max-w-3xl mx-auto space-y-6">
        <Link href="/" className="text-sm text-brand-blue hover:underline">
          ← Voltar ao site
        </Link>
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight">Termos de Uso</h1>
        <p className="text-zinc-400 leading-relaxed">
          Esta página é um placeholder institucional da {PLATFORM_NAME} — {PLATFORM_TAGLINE}.
          Os termos definitivos devem ser revisados juridicamente antes da publicação em produção.
        </p>
        <p className="text-zinc-400 leading-relaxed">
          O uso da plataforma pressupõe aceite das condições comerciais e operacionais aplicáveis
          à conta da sua organização, incluindo responsabilidades de acesso, permissões e dados.
        </p>
        <p className="text-sm text-zinc-500">
          Em caso de conflito entre este placeholder e contratos assinados, prevalecem os documentos oficiais.
        </p>
      </div>
    </main>
  );
}
