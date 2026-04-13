'use client'
import { useRef, useCallback } from 'react'

export function useWakeLock() {
  const lockRef = useRef<WakeLockSentinel | null>(null)

  const acquire = useCallback(async () => {
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return
    try {
      lockRef.current = await (navigator as Navigator & { wakeLock: { request(type: string): Promise<WakeLockSentinel> } }).wakeLock.request('screen')
    } catch {
      // WakeLock not supported or permission denied
    }
  }, [])

  const release = useCallback(() => {
    lockRef.current?.release().catch(() => {})
    lockRef.current = null
  }, [])

  return { acquire, release }
}
