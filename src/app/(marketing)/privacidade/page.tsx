import Link from "next/link";
import type { Metadata } from "next";
import { PLATFORM_NAME, PLATFORM_TAGLINE } from "@/lib/branding/platform";

export const metadata: Metadata = {
  title: `Política de Privacidade | ${PLATFORM_NAME}`,
  description: `Política de Privacidade da ${PLATFORM_NAME}.`,
};

export default function PrivacidadePage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 px-6 py-16">
      <div className="max-w-3xl mx-auto space-y-6">
        <Link href="/" className="text-sm text-brand-blue hover:underline">
          ← Voltar ao site
        </Link>
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight">Política de Privacidade</h1>
        <p className="text-zinc-400 leading-relaxed">
          Esta página é um placeholder institucional da {PLATFORM_NAME} — {PLATFORM_TAGLINE}.
          O texto jurídico completo deve ser revisado e publicado pela área responsável antes do uso em produção.
        </p>
        <p className="text-zinc-400 leading-relaxed">
          Em linhas gerais, tratamos dados de contato enviados por formulários e acessos autenticados
          para operação da plataforma, suporte e melhoria do serviço, conforme a legislação aplicável
          (incluindo a LGPD, quando couber).
        </p>
        <p className="text-sm text-zinc-500">
          Para dúvidas: utilize o formulário de contato do site ou o canal comercial da sua conta.
        </p>
      </div>
    </main>
  );
}
