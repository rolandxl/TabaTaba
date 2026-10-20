import {
  isFullscreen,
  isFullscreenSupported,
  onFullscreenChange,
  toggleFullscreen,
} from './fullscreen'
import { icon, iconButton, toast } from './ui'

export interface FullscreenControl {
  button: HTMLButtonElement
  cleanup: () => void
}

export function createFullscreenControl(options: {
  className?: string
  label?: string
} = {}): FullscreenControl {
  const label = options.label ?? 'На весь экран'
  const button = iconButton(
    'fullscreen',
    label,
    () => {
      void toggleFullscreen().then((ok) => {
        if (!ok) toast('Не удалось переключить полноэкранный режим')
      })
    },
    options.className ?? '',
  )
  button.classList.add('fullscreen-action')
  button.setAttribute('aria-pressed', 'false')

  if (!isFullscreenSupported()) {
    button.hidden = true
    return { button, cleanup: () => undefined }
  }

  const sync = (): void => {
    const active = isFullscreen()
    button.replaceChildren(icon(active ? 'fullscreenExit' : 'fullscreen'))
    button.classList.toggle('is-active', active)
    button.setAttribute('aria-pressed', String(active))
    const text = active ? 'Выйти из полноэкранного режима' : label
    button.setAttribute('aria-label', text)
    button.title = text
  }

  const unsubscribe = onFullscreenChange(sync)
  sync()

  return { button, cleanup: unsubscribe }
}
