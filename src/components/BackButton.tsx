'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { goBack } from '@/lib/navigation/goBack'

const DEFAULT_ICON_CLASS = 'w-5 h-5'
const DEFAULT_BUTTON_CLASS =
  'p-2 rounded-lg bg-[#ffffff05] hover:bg-[#ffffff0a] text-gray-400 hover:text-white transition-colors'

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
