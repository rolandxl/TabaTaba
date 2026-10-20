export type Route =
  | { name: 'library' }
  | { name: 'song'; id: string }
  | { name: 'perform'; id: string }
  | { name: 'practice'; id: string }
  | { name: 'calibration'; songId?: string }
  | { name: 'diagnostics' }
  | { name: 'edit'; id: string }
  | { name: 'new' }
  | { name: 'settings' }

export interface QueueState {
  songIds: string[]
  index: number
  label?: string
}

export interface NavigationState {
  from?: string
  queue?: QueueState
  depth?: number
}

function currentHash(): string {
  return window.location.hash || '#/'
}

export function parseRoute(hash = window.location.hash): Route {
  const path = hash.replace(/^#/, '').replace(/^\/+/, '')
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent)
  if (parts.length === 0) return { name: 'library' }

  if (parts[0] === 'new' && parts.length === 1) return { name: 'new' }

  if (parts[0] === 'settings') {
    if (parts.length === 1) return { name: 'settings' }
    if (parts.length === 2 && parts[1] === 'calibration') return { name: 'calibration' }
    if (
      parts.length === 4 &&
      parts[1] === 'calibration' &&
      parts[2] === 'song' &&
      parts[3]
    ) {
      return { name: 'calibration', songId: parts[3] }
    }
    if (parts.length === 2 && parts[1] === 'diagnostics') return { name: 'diagnostics' }
  }

  if (parts[0] === 'songs' && parts[1]) {
    const id = parts[1]
    if (parts.length === 2) return { name: 'song', id }
    if (parts.length === 3 && parts[2] === 'play') return { name: 'perform', id }
    if (parts.length === 3 && parts[2] === 'practice') return { name: 'practice', id }
    if (parts.length === 3 && parts[2] === 'calibrate') return { name: 'calibration', songId: id }
    if (parts.length === 3 && parts[2] === 'edit') return { name: 'edit', id }
  }

  return { name: 'library' }
}

export function navigate(
  path: string,
  extraState: Partial<NavigationState> = {},
): void {
  const target = path.startsWith('/') ? path : `/${path}`
  if (window.location.hash === `#${target}`) {
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    return
  }
  const source = currentHash()
  const depth = (getNavigationState()?.depth ?? 0) + 1
  window.location.hash = target
  window.history.replaceState(
    { from: source, ...extraState, depth } satisfies NavigationState,
    '',
    `#${target}`,
  )
}

export function replace(path: string, extraState: Partial<NavigationState> = {}): void {
  const target = path.startsWith('/') ? path : `/${path}`
  const depth = getNavigationState()?.depth ?? 0
  window.history.replaceState(
    { from: currentHash(), ...extraState, depth } satisfies NavigationState,
    '',
    `#${target}`,
  )
  window.dispatchEvent(new HashChangeEvent('hashchange'))
}

export function resetTo(path: string): void {
  const target = path.startsWith('/') ? path : `/${path}`
  window.history.replaceState({ depth: 0 } satisfies NavigationState, '', `#${target}`)
  window.dispatchEvent(new HashChangeEvent('hashchange'))
}

export function getNavigationState(): NavigationState | null {
  const state = window.history.state
  return state && typeof state === 'object' ? (state as NavigationState) : null
}

export function getSourceRoute(): Route | null {
  const state = getNavigationState()
  if (!state || typeof state.from !== 'string') return null
  try {
    return parseRoute(state.from)
  } catch {
    return null
  }
}

export function goBack(fallback = '/'): void {
  const depth = getNavigationState()?.depth ?? 0
  if (depth > 0) {
    const before = currentHash()
    let changed = false
    const onHashChange = (): void => {
      changed = true
    }
    window.addEventListener('hashchange', onHashChange)
    window.history.back()
    window.setTimeout(() => {
      window.removeEventListener('hashchange', onHashChange)
      if (!changed && currentHash() === before) resetTo(fallback)
    }, 300)
    return
  }
  resetTo(fallback)
}

export function songPath(id: string): string {
  return `/songs/${encodeURIComponent(id)}`
}

export function performPath(id: string): string {
  return `/songs/${encodeURIComponent(id)}/play`
}

export function practicePath(id: string): string {
  return `/songs/${encodeURIComponent(id)}/practice`
}

export function calibrationPath(songId?: string): string {
  return songId
    ? `/settings/calibration/song/${encodeURIComponent(songId)}`
    : '/settings/calibration'
}

export function diagnosticsPath(): string {
  return '/settings/diagnostics'
}

export function editPath(id: string): string {
  return `/songs/${encodeURIComponent(id)}/edit`
}
