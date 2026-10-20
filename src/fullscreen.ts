type FullscreenListener = () => void

const listeners = new Set<FullscreenListener>()
let listening = false

function notify(): void {
  for (const listener of [...listeners]) listener()
}

function ensureListener(): void {
  if (listening || typeof document === 'undefined') return
  listening = true
  document.addEventListener('fullscreenchange', notify)
}

export function isFullscreenSupported(): boolean {
  if (typeof document === 'undefined') return false
  return (
    document.fullscreenEnabled !== false &&
    typeof document.documentElement.requestFullscreen === 'function'
  )
}

export function isFullscreen(): boolean {
  return Boolean(document.fullscreenElement)
}

export function onFullscreenChange(listener: FullscreenListener): () => void {
  ensureListener()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export async function toggleFullscreen(): Promise<boolean> {
  if (!isFullscreenSupported()) return false
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen()
    } else {
      await document.documentElement.requestFullscreen()
    }
    return true
  } catch {
    return false
  }
}
