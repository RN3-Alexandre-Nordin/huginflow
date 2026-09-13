'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { goBack } from '@/lib/navigation/goBack'

const DEFAULT_ICON_CLASS = 'h-5 w-5'
const DEFAULT_BUTTON_CLASS =
  'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#ffffff10] bg-[#ffffff05] text-gray-400 transition-colors hover:bg-[#ffffff10] hover:text-white'

export type BackButtonProps = {
  fallbackHref?: string
  className?: string
  iconClassName?: string
  label?: string
  'aria-label'?: string
}

function BackButton({
  fallbackHref = '/cockpit',
  className = DEFAULT_BUTTON_CLASS,
  iconClassName = DEFAULT_ICON_CLASS,
  label,
  'aria-label': ariaLabel = 'Voltar',
}: BackButtonProps) {
  const router = useRouter()

  return (
    <button
      type="button"
      onClick={() => goBack(router, fallbackHref)}
      className={className}
      aria-label={ariaLabel}
    >
      <ArrowLeft className={iconClassName} />
      {label ? <span>{label}</span> : null}
    </button>
  )
}

export default BackButton
export { BackButton, goBack }
