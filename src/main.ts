import './styles.css'
import { registerSW } from 'virtual:pwa-register'
import { loadSettings, seedIfNeeded } from './db'
import { parseRoute, type Route } from './router'
import { renderEditor } from './screens/editor'
import { renderLibrary } from './screens/library'
import { renderPerform } from './screens/perform'
import { renderPractice } from './screens/practice'
import { renderCalibration } from './screens/calibration'
import { renderDiagnostics } from './screens/diagnostics'
import { renderSettings } from './screens/settings'
import { renderSongScreen } from './screens/song'
import { applyTheme, watchSystemTheme } from './theme'
import { toast } from './ui'

type Cleanup = () => void
type ScreenResult = Cleanup | void

let activeCleanup: Cleanup | null = null
let renderToken = 0
let updateServiceWorker: ((reloadPage?: boolean) => Promise<void>) | undefined

async function init(): Promise<void> {
  try {
    await seedIfNeeded()
    const settings = await loadSettings()
    applyTheme(settings.theme)
  } catch (error) {
    console.error(error)
  }
  watchSystemTheme()
  registerServiceWorker()
  window.addEventListener('hashchange', () => {
    void renderCurrentRoute()
  })
  await renderCurrentRoute()
}

async function renderCurrentRoute(): Promise<void> {
  const token = ++renderToken
  activeCleanup?.()
  activeCleanup = null
  document.body.classList.remove('is-perform')
  document.body.classList.remove('is-practice')

  const app = document.getElementById('app')
  if (!app) return

  app.replaceChildren()
  const container = document.createElement('div')
  container.className = 'route'
  app.append(container)

  let route: Route
  try {
    route = parseRoute()
  } catch {
    route = { name: 'library' }
  }
  app.dataset.route = route.name

  let result: ScreenResult
  try {
    result = await renderRoute(container, route)
  } catch (error) {
    console.error(error)
    showError(container, error)
    return
  }

  if (token !== renderToken) {
    if (typeof result === 'function') result()
    container.remove()
    return
  }

  activeCleanup = typeof result === 'function' ? result : null
  window.scrollTo(0, 0)
}

async function renderRoute(container: HTMLElement, route: Route): Promise<ScreenResult> {
  switch (route.name) {
    case 'library':
      return renderLibrary(container)
    case 'song':
      return renderSongScreen(container, route.id)
    case 'perform':
      return renderPerform(container, route.id)
    case 'practice':
      return renderPractice(container, route.id)
    case 'calibration':
      return renderCalibration(container, route.songId)
    case 'diagnostics':
      return renderDiagnostics(container)
    case 'edit':
      return renderEditor(container, route.id)
    case 'new':
      return renderEditor(container)
    case 'settings':
      return renderSettings(container)
  }
}

function registerServiceWorker(): void {
  updateServiceWorker = registerSW({
    immediate: true,
    onNeedRefresh() {
      toast('Доступна новая версия', {
        action: {
          label: 'Обновить',
          onClick: () => {
            void updateServiceWorker?.(true)
          },
        },
        duration: 20000,
      })
    },
    onOfflineReady() {
      toast('Приложение готово к работе офлайн', { duration: 2600 })
    },
  })
}

function showError(container: HTMLElement, error: unknown): void {
  const message = error instanceof Error ? error.message : 'Неизвестная ошибка'
  const screen = document.createElement('div')
  screen.className = 'screen error-screen'
  screen.innerHTML = `
    <div class="empty-art">!</div>
    <h1>Что-то пошло не так</h1>
    <p></p>
    <button class="btn btn-primary" type="button">Перезагрузить</button>
  `
  const paragraph = screen.querySelector('p')
  if (paragraph) paragraph.textContent = message
  screen.querySelector('button')?.addEventListener('click', () => window.location.reload())
  container.replaceChildren(screen)
}

void init()
