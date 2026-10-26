'use client'

import { useCallback, useEffect, useRef } from 'react'

/**
 * Agenda uma recarga com debounce e no máximo uma execução em voo.
 * Pedidos que chegam durante a execução viram uma única rodada extra ao final —
 * uma rajada de eventos realtime nunca vira uma rajada de requisições.
 */
export function useCoalescedRefresh(run: () => Promise<unknown> | unknown, delayMs = 500) {
  const runRef = useRef(run)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inFlightRef = useRef(false)
  const pendingRef = useRef(false)
  const disposedRef = useRef(false)

  useEffect(() => {
    runRef.current = run
  }, [run])

  useEffect(() => {
    disposedRef.current = false
    return () => {
      disposedRef.current = true
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  return useCallback(() => {
    if (disposedRef.current) return

    const fire = () => {
      timerRef.current = null
      if (disposedRef.current) return
      if (inFlightRef.current) {
        pendingRef.current = true
        return
      }
      inFlightRef.current = true
      void Promise.resolve()
        .then(() => runRef.current())
        .catch((err) => console.error('[useCoalescedRefresh]', err))
        .finally(() => {
          inFlightRef.current = false
          if (pendingRef.current && !disposedRef.current) {
            pendingRef.current = false
            timerRef.current = setTimeout(fire, delayMs)
          }
        })
    }

    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(fire, delayMs)
  }, [delayMs])
}
