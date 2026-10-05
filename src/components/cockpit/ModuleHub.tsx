import Link from 'next/link'
import { Lock } from 'lucide-react'
import BackTextButton from '@/components/BackTextButton'
import type { CockpitNavItem } from '@/app/(app)/cockpit/cockpit-nav'

type Props = {
  title: string
  description?: string
  cards: CockpitNavItem[]
  emptyMessage?: string
}

/** Hub de módulo no estilo Bifrost Admin (cards). */
export default function ModuleHub({
  title,
  description,
  cards,
  emptyMessage = 'Nenhuma área disponível com suas permissões atuais.',
}: Props) {
  if (cards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Lock className="mb-4 h-10 w-10 text-red-500" />
        <h2 className="mb-2 text-2xl font-semibold tracking-tight text-white">{title}</h2>
        <p className="mb-8 max-w-md text-sm text-gray-400">{emptyMessage}</p>
        <BackTextButton className="text-[#2BAADF]">Voltar</BackTextButton>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 pb-20">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-white">{title}</h2>
        {description && <p className="mt-1 text-sm text-gray-400">{description}</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            data-testid={card.testId}
            className="group rounded-xl border border-[#ffffff12] bg-[#111111]/90 p-5 transition hover:border-[#2BAADF]/40 hover:bg-[#151515]"
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-base font-medium text-white group-hover:text-[#2BAADF]">
                {card.name}
              </h3>
              <card.icon className="h-5 w-5 shrink-0 text-[#2BAADF]/80" aria-hidden />
            </div>
            {card.description && (
              <p className="mt-3 text-sm leading-relaxed text-gray-500">{card.description}</p>
            )}
          </Link>
        ))}
      </div>
    </div>
  )
}
