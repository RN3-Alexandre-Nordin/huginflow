'use client'

import type { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { goBack } from '@/lib/navigation/goBack'

function BackTextButton({
  children = 'Voltar',
  fallbackHref = '/cockpit',
  className,
}: {
  children?: ReactNode
  fallbackHref?: string
  className?: string
}) {
  const router = useRouter()

  return (
    <button type="button" onClick={() => goBack(router, fallbackHref)} className={className}>
      {children}
    </button>
  )
}

export default BackTextButton
export { BackTextButton }
