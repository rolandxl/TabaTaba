interface WakeLockSentinelLike {
  release(): Promise<void>
  addEventListener(type: 'release', listener: () => void): void
}

type WakeLockNavigator = Navigator & {
  wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> }
}

let sentinel: WakeLockSentinelLike | null = null
let wanted = false
let pending: Promise<boolean> | null = null

export function isWakeLockSupported(): boolean {
  return 'wakeLock' in navigator
}

export async function requestWakeLock(): Promise<boolean> {
  wanted = true
  return acquire()
}

export function releaseWakeLock(): void {
  wanted = false
  const current = sentinel
  sentinel = null
  if (current) {
    void current.release().catch(() => undefined)
  }
}

async function acquire(): Promise<boolean> {
  if (sentinel) return true
  if (pending) return pending
  const wakeLock = (navigator as WakeLockNavigator).wakeLock
  if (!wakeLock) return false
  pending = wakeLock
    .request('screen')
    .then((lock) => {
      sentinel = lock
      lock.addEventListener('release', () => {
        if (sentinel === lock) sentinel = null
        if (wanted && document.visibilityState === 'visible') void acquire()
      })
      return true
    })
    .catch(() => false)
    .finally(() => {
      pending = null
    })
  return pending
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && wanted) {
    void acquire()
  }
})
