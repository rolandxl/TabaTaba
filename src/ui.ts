const SVG_NS = 'http://www.w3.org/2000/svg'

export type IconName =
  | 'back'
  | 'plus'
  | 'play'
  | 'pause'
  | 'settings'
  | 'star'
  | 'edit'
  | 'trash'
  | 'search'
  | 'close'
  | 'minus'
  | 'check'
  | 'upload'
  | 'download'
  | 'install'
  | 'refresh'
  | 'arrowUp'
  | 'arrowDown'
  | 'music'
  | 'folder'
  | 'share'
  | 'shuffle'
  | 'forward'
  | 'eye'
  | 'eyeOff'
  | 'mic'
  | 'micOff'
  | 'fullscreen'
  | 'fullscreenExit'

const ICONS: Record<IconName, string> = {
  back: '<path d="M15 18l-6-6 6-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  play: '<path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/>',
  pause:
    '<rect x="7" y="5" width="4" height="14" rx="1.2" fill="currentColor" stroke="none"/><rect x="14" y="5" width="4" height="14" rx="1.2" fill="currentColor" stroke="none"/>',
  settings:
    '<path d="M4 7h8M16 7h4M4 17h4M12 17h8"/><circle cx="14" cy="7" r="2.4"/><circle cx="10" cy="17" r="2.4"/>',
  star: '<path d="M12 3.6l2.6 5.3 5.8.85-4.2 4.1 1 5.75L12 16.9l-5.2 2.7 1-5.75-4.2-4.1 5.8-.85z"/>',
  edit: '<path d="M4 20h4.5L19 9.5a2.1 2.1 0 0 0-3-3L5.5 17z"/><path d="M14.5 8.5l3 3"/>',
  trash:
    '<path d="M4 7h16M9 7V5h6v2M7 7l1 13h8l1-13M10 11v5M14 11v5"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  minus: '<path d="M5 12h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M5 20h14"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5M5 20h14"/>',
  install:
    '<rect x="7" y="3" width="10" height="18" rx="2.4"/><path d="M12 7v7M9.5 11.5L12 14l2.5-2.5"/>',
  refresh:
    '<path d="M20 11a8 8 0 1 0-.7 4.5M20 4v7h-7"/>',
  arrowUp: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  arrowDown: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  music:
    '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
  folder:
    '<path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h4l2 2h8a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z"/>',
  share:
    '<circle cx="6" cy="12" r="2.2"/><circle cx="18" cy="6" r="2.2"/><circle cx="18" cy="18" r="2.2"/><path d="M8 11l8-4M8 13l8 4"/>',
  shuffle:
    '<path d="M4 6h3c2 0 3.2 1 4.4 2.8l3.2 4.4c1.2 1.8 2.4 2.8 4.4 2.8h1"/><path d="M17 4l3 2-3 2"/><path d="M17 14l3 2-3 2"/><path d="M4 18h3c1.3 0 2.3-.4 3.2-1.3"/><path d="M15.6 7.3C16.5 6.4 17.5 6 18.8 6H21"/>',
  forward: '<path d="M9 18l6-6-6-6"/>',
  eye: '<path d="M2.7 12S6.2 6 12 6s9.3 6 9.3 6-3.5 6-9.3 6S2.7 12 2.7 12z"/><circle cx="12" cy="12" r="2.8"/>',
  eyeOff:
    '<path d="M3 3l18 18"/><path d="M10.6 6.3A9.6 9.6 0 0 1 12 6c5.8 0 9.3 6 9.3 6a17.5 17.5 0 0 1-3.2 3.9M6.1 6.7A17.6 17.6 0 0 0 2.7 12s3.5 6 9.3 6c1.2 0 2.3-.3 3.3-.7"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/>',
  micOff:
    '<path d="M4 4l16 16"/><path d="M9 9v2a3 3 0 0 0 4.6 2.5M15 10V6a3 3 0 0 0-5.7-1.3"/><path d="M5 11a7 7 0 0 0 10.8 5.9M19 11a7 7 0 0 1-.6 2.8M12 18v3M9 21h6"/>',
  fullscreen: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
  fullscreenExit: '<path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5"/>',
}

export function icon(name: IconName, size = 20): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width', String(size))
  svg.setAttribute('height', String(size))
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '1.9')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('aria-hidden', 'true')
  svg.classList.add('icon')
  svg.innerHTML = ICONS[name]
  return svg
}

type AttrValue = string | number | boolean | null | undefined | EventListener
type Child = Node | string | null | undefined | false

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, AttrValue> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag)
  for (const [name, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue
    if (name === 'class') {
      element.className = String(value)
      continue
    }
    if (name.startsWith('on') && typeof value === 'function') {
      element.addEventListener(name.slice(2).toLowerCase(), value)
      continue
    }
    if (value === true) {
      element.setAttribute(name, '')
      continue
    }
    element.setAttribute(name, String(value))
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue
    element.append(child instanceof Node ? child : document.createTextNode(child))
  }
  return element
}

export function iconButton(
  name: IconName,
  label: string,
  onClick: (event: MouseEvent) => void,
  className = '',
): HTMLButtonElement {
  return el(
    'button',
    {
      class: `icon-button ${className}`.trim(),
      type: 'button',
      'aria-label': label,
      title: label,
      onClick: onClick as EventListener,
    },
    icon(name),
  )
}

export function button(
  label: string,
  onClick: (event: MouseEvent) => void,
  kind: 'primary' | 'ghost' | 'danger' | 'plain' = 'ghost',
  iconName?: IconName,
): HTMLButtonElement {
  const children: Child[] = []
  if (iconName) children.push(icon(iconName, 18))
  children.push(label)
  return el(
    'button',
    {
      class: `btn btn-${kind}`,
      type: 'button',
      onClick: onClick as EventListener,
    },
    ...children,
  )
}

export interface DialogAction {
  label: string
  value: string
  kind?: 'primary' | 'danger' | 'ghost'
  autofocus?: boolean
}

export function openDialog(options: {
  title: string
  description?: string
  body?: Node
  actions: DialogAction[]
}): Promise<string | null> {
  return new Promise((resolve) => {
    const previousFocus = document.activeElement as HTMLElement | null
    const overlay = el('div', { class: 'modal-backdrop' })
    const dialog = el('div', {
      class: 'modal',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': options.title,
    })

    const close = (value: string | null): void => {
      document.removeEventListener('keydown', onKeyDown)
      overlay.remove()
      document.body.classList.remove('modal-open')
      previousFocus?.focus()
      resolve(value)
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close(null)
      }
    }

    dialog.append(el('h2', { class: 'modal-title' }, options.title))
    if (options.description) {
      dialog.append(el('p', { class: 'modal-description' }, options.description))
    }
    if (options.body) {
      dialog.append(options.body)
    }

    const actions = el('div', { class: 'modal-actions' })
    let autofocusButton: HTMLButtonElement | null = null
    for (const action of options.actions) {
      const actionButton = button(
        action.label,
        () => close(action.value),
        action.kind ?? 'ghost',
      )
      if (action.autofocus) autofocusButton = actionButton
      actions.append(actionButton)
    }
    dialog.append(actions)

    overlay.append(dialog)
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close(null)
    })
    document.addEventListener('keydown', onKeyDown)
    document.body.append(overlay)
    document.body.classList.add('modal-open')
    autofocusButton?.focus()
  })
}

export async function confirmDialog(options: {
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
}): Promise<boolean> {
  const result = await openDialog({
    title: options.title,
    description: options.message,
    actions: [
      { label: 'Отмена', value: 'cancel' },
      {
        label: options.confirmLabel ?? 'OK',
        value: 'confirm',
        kind: options.danger ? 'danger' : 'primary',
        autofocus: true,
      },
    ],
  })
  return result === 'confirm'
}

export interface ToastOptions {
  action?: { label: string; onClick: () => void }
  duration?: number
}

let toastTimer: number | undefined

export function toast(message: string, options: ToastOptions = {}): void {
  const root = document.getElementById('toast-root')
  if (!root) return
  window.clearTimeout(toastTimer)

  const box = el('div', { class: 'toast' }, el('span', { class: 'toast-message' }, message))
  if (options.action) {
    box.append(
      el(
        'button',
        {
          class: 'toast-action',
          type: 'button',
          onClick: () => {
            options.action?.onClick()
            dismiss()
          },
        },
        options.action.label,
      ),
    )
  }

  root.replaceChildren(box)
  requestAnimationFrame(() => box.classList.add('is-visible'))

  const dismiss = (): void => {
    box.classList.remove('is-visible')
    window.setTimeout(() => box.remove(), 220)
  }

  const duration = options.duration ?? 3800
  if (duration > 0) {
    toastTimer = window.setTimeout(dismiss, duration)
  }
}

export function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
  })
    .format(timestamp)
    .replace('.', '')
}

export function formatDateTime(timestamp: number): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp)
}

export function plural(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

export function debounce<T extends (...args: never[]) => void>(fn: T, delay: number): T {
  let timer: number | undefined
  return ((...args: never[]) => {
    window.clearTimeout(timer)
    timer = window.setTimeout(() => fn(...args), delay)
  }) as T
}
