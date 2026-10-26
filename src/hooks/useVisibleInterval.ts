'use client'

import { useEffect, useRef } from 'react'

/**
 * Intervalo que só roda com a aba visível; ao voltar para a aba, executa uma vez.
 * Abas em segundo plano não podem gerar carga no servidor.
 */
export function useVisibleInterval(callback: () => void, intervalMs: number, enabled = true) {
  const callbackRef = useRef(callback)

  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  useEffect(() => {
    if (!enabled) return

    let timer: ReturnType<typeof setInterval> | null = null
    const start = () => {
      if (timer) return
      timer = setInterval(() => callbackRef.current(), intervalMs)
    }
    const stop = () => {
      if (timer) clearInterval(timer)
      timer = null
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        callbackRef.current()
        start()
      } else {
        stop()
      }
    }

    if (document.visibilityState === 'visible') start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [intervalMs, enabled])
}
