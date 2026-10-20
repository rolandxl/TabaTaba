import { bestChords, type BestChord } from '../audio/chord-math'
import {
  isMicrophoneSupported,
  MicrophoneError,
  startMicrophone,
  type MicrophoneFrame,
  type MicrophoneSession,
} from '../audio/microphone'
import { loadSettings } from '../db'
import { calibrationPath, goBack, navigate } from '../router'
import { button, el, icon, iconButton, toast } from '../ui'

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export async function renderDiagnostics(root: HTMLElement): Promise<(() => void) | void> {
  const settings = await loadSettings()
  document.title = 'Диагностика микрофона — TabaTaba'

  let micOn = false
  let micStarting = false
  let micSession: MicrophoneSession | null = null
  let disposed = false
  let latestFrame: MicrophoneFrame | null = null
  let latestBest: BestChord[] = []

  const micSupported = isMicrophoneSupported()

  const micButton = iconButton('mic', 'Включить микрофон', () => void toggleMic(), 'practice-mic')
  micButton.setAttribute('aria-pressed', 'false')

  const levelFill = el('div', { class: 'level-fill' })
  const levelText = el('div', { class: 'level-text' }, 'Микрофон выключен')

  const debugLevel = el('span', { class: 'debug-value' }, '—')
  const debugThreshold = el('span', { class: 'debug-value' }, '—')
  const debugTuning = el('span', { class: 'debug-value' }, '—')
  const debugBest = el('span', { class: 'debug-value' }, '—')
  const debugState = el('span', { class: 'debug-value' }, '—')
  const debugProfiles = el('span', { class: 'debug-value' }, '—')

  const chromaFills: HTMLElement[] = []
  const chromaBars = el('div', { class: 'chroma-bars' })
  for (let index = 0; index < 12; index++) {
    const fill = document.createElement('i')
    const bar = el(
      'span',
      { class: 'chroma-bar', title: NOTE_NAMES[index] },
      fill,
      el('b', {}, NOTE_NAMES[index]),
    )
    chromaFills.push(fill)
    chromaBars.append(bar)
  }

  const copyButton = button(
    'Скопировать диагностику',
    () => void copyDiagnostics(),
    'primary',
    'download',
  )
  copyButton.disabled = true

  const calibrationButton = button(
    'Калибровка аккордов',
    () => navigate(calibrationPath()),
    'ghost',
    'mic',
  )

  const status = el(
    'div',
    { class: 'calibration-status' },
    'Диагностика показывает только текущий сигнал. Аудио не записывается и не отправляется.',
  )

  const screen = el(
    'div',
    { class: 'screen calibration-screen diagnostics-screen' },
    el(
      'header',
      { class: 'topbar' },
      iconButton('back', 'Назад', () => goBack('/settings')),
      el('div', { class: 'topbar-title' }, 'Диагностика микрофона'),
      micButton,
    ),
    el(
      'div',
      { class: 'calibration-content' },
      el(
        'section',
        { class: 'calibration-card' },
        el('h2', { class: 'calibration-heading' }, 'Микрофон'),
        el('div', { class: 'level-meter' }, levelFill),
        levelText,
        el(
          'p',
          { class: 'calibration-hint' },
          'Включите микрофон и сыграйте аккорд. Уровень, хрома и лучшие совпадения обновляются в реальном времени.',
        ),
      ),
      el(
        'section',
        { class: 'calibration-card' },
        el('h2', { class: 'calibration-heading' }, 'Сигнал'),
        el(
          'div',
          { class: 'debug-grid' },
          debugRow('Уровень', debugLevel),
          debugRow('Порог / фон', debugThreshold),
          debugRow('Строй / формат', debugTuning),
          debugRow('Лучшие', debugBest),
          debugRow('Профили', debugProfiles),
          debugRow('Состояние', debugState),
        ),
        chromaBars,
      ),
      el(
        'section',
        { class: 'calibration-card' },
        el('h2', { class: 'calibration-heading' }, 'Действия'),
        el(
          'p',
          { class: 'calibration-hint' },
          'Скопируйте JSON с текущими данными для разбора или перейдите к обучению профилей аккордов.',
        ),
        el(
          'div',
          { class: 'calibration-actions' },
          copyButton,
          calibrationButton,
          button('Очистить', () => clearData(), 'ghost'),
        ),
      ),
      status,
    ),
  )

  root.append(screen)
  updateView()

  if (!micSupported) {
    micButton.disabled = true
    levelText.textContent = window.isSecureContext
      ? 'Микрофон не поддерживается этим браузером.'
      : 'Микрофон доступен только по HTTPS или localhost.'
  }

  const onVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden' && micOn) stopMic()
  }
  document.addEventListener('visibilitychange', onVisibilityChange)

  return () => {
    disposed = true
    stopMic()
    document.removeEventListener('visibilitychange', onVisibilityChange)
  }

  async function toggleMic(): Promise<void> {
    if (disposed || micStarting) return
    if (micOn) {
      stopMic()
      return
    }
    if (!micSupported) {
      toast(
        window.isSecureContext
          ? 'Браузер не поддерживает микрофон'
          : 'Микрофон доступен только по HTTPS или localhost',
      )
      return
    }

    micStarting = true
    micButton.disabled = true
    levelText.textContent = 'Запрашиваю доступ к микрофону…'
    try {
      const session = await startMicrophone(processFrame, {
        noiseFloor: settings.mic.noiseFloor,
        threshold: settings.mic.threshold,
        a4: settings.mic.a4,
      })
      if (disposed) {
        session.stop()
        return
      }
      micSession = session
      micOn = true
      micButton.classList.add('is-active')
      micButton.replaceChildren(icon('micOff', 20))
      micButton.setAttribute('aria-pressed', 'true')
      micButton.setAttribute('aria-label', 'Выключить микрофон')
      levelText.textContent = 'Микрофон включён.'
      status.textContent = 'Слушаю микрофон. Аудио обрабатывается локально.'
    } catch (error) {
      const message =
        error instanceof MicrophoneError ? error.message : 'Не удалось включить микрофон'
      toast(message)
      levelText.textContent = 'Микрофон выключен.'
    } finally {
      micStarting = false
      micButton.disabled = false
      updateView()
    }
  }

  function stopMic(): void {
    micOn = false
    micSession?.stop()
    micSession = null
    latestFrame = null
    latestBest = []
    micButton.classList.remove('is-active')
    micButton.replaceChildren(icon('mic', 20))
    micButton.setAttribute('aria-pressed', 'false')
    micButton.setAttribute('aria-label', 'Включить микрофон')
    levelFill.style.width = '0%'
    levelText.textContent = 'Микрофон выключен.'
    status.textContent =
      'Диагностика показывает только текущий сигнал. Аудио не записывается и не отправляется.'
    updateView()
  }

  function processFrame(frame: MicrophoneFrame): void {
    if (!micOn) return
    latestFrame = frame
    latestBest = bestChords(frame.chroma, settings.mic.profiles, 3)

    const ratio = frame.threshold > 0 ? frame.rawEnergy / (frame.threshold * 4) : 0
    levelFill.style.width = `${Math.max(0, Math.min(100, ratio * 100))}%`
    levelFill.classList.toggle('is-active', frame.rawEnergy >= frame.threshold)
    levelText.textContent =
      frame.rawEnergy >= frame.threshold ? 'Сигнал есть.' : 'Тихо — играйте ближе к микрофону.'

    const max = Math.max(0.001, ...frame.chroma)
    for (let index = 0; index < chromaFills.length; index++) {
      chromaFills[index].style.height = `${Math.round((frame.chroma[index] / max) * 100)}%`
    }

    updateView()
  }

  function updateView(): void {
    const frame = latestFrame
    if (!frame) {
      debugLevel.textContent = '—'
      debugThreshold.textContent = '—'
      debugTuning.textContent = '—'
      debugBest.textContent = '—'
      debugState.textContent = micOn ? 'жду звук' : 'микрофон выключен'
    } else {
      debugLevel.textContent = `${frame.rawEnergy.toFixed(4)} / ${frame.energy.toFixed(4)}`
      debugThreshold.textContent = `${frame.threshold.toFixed(4)} / ${frame.noiseFloor.toFixed(4)}`
      debugTuning.textContent =
        `A4 ${settings.mic.a4} Гц · ${frame.sampleRate} Гц · FFT 8192`
      debugBest.textContent = latestBest.length
        ? latestBest.map((item) => `${item.name} ${item.score.toFixed(2)}`).join(' · ')
        : '—'
      debugState.textContent = frame.onset ? 'удар' : micOn ? 'слушаю' : 'микрофон выключен'
    }

    const profileNames = Object.keys(settings.mic.profiles)
    debugProfiles.textContent = profileNames.length
      ? `${profileNames.length}: ${profileNames.join(', ')}`
      : 'нет'
    copyButton.disabled = !latestFrame
  }

  function clearData(): void {
    latestFrame = null
    latestBest = []
    for (const fill of chromaFills) fill.style.height = '0%'
    levelFill.style.width = '0%'
    status.textContent = 'Показания очищены.'
    updateView()
  }

  async function copyDiagnostics(): Promise<void> {
    if (!latestFrame) {
      toast('Пока нет данных с микрофона')
      return
    }
    const payload = {
      time: new Date().toISOString(),
      best: latestBest,
      level: {
        raw: latestFrame.rawEnergy,
        output: latestFrame.energy,
        threshold: latestFrame.threshold,
        noiseFloor: latestFrame.noiseFloor,
      },
      chroma: Array.from(latestFrame.chroma).map((value) => Number(value.toFixed(4))),
      calibration: {
        a4: settings.mic.a4,
        lastCalibratedAt: settings.mic.lastCalibratedAt,
        profiles: Object.keys(settings.mic.profiles),
      },
      audio: {
        sampleRate: latestFrame.sampleRate,
        fftSize: 8192,
        onset: latestFrame.onset,
      },
    }

    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
      toast('Диагностика скопирована в буфер')
    } catch {
      toast('Не удалось скопировать диагностику')
    }
  }
}

function debugRow(label: string, value: HTMLElement): HTMLElement {
  return el(
    'div',
    { class: 'debug-row' },
    el('span', { class: 'debug-label' }, label),
    value,
  )
}
