import {
  bestChords,
  chordPitchClasses,
  chordRootPitchClass,
  samePitchClasses,
  type BestChord,
} from '../audio/chord-math'
import {
  isMicrophoneSupported,
  MicrophoneError,
  startMicrophone,
  type MicrophoneFrame,
  type MicrophoneOptions,
  type MicrophoneSession,
} from '../audio/microphone'
import {
  FOLLOW_PRESETS,
  PracticeEngine,
  type PracticeFeedback,
  type PracticeResult,
} from '../audio/practice-engine'
import { renderSong } from '../chords/render'
import { inferAccidentalPreference, transposeChord } from '../chords/transpose'
import { db, loadSettings } from '../db'
import { goBack } from '../router'
import { keyLabel } from '../song-utils'
import {
  DEFAULT_FOLLOW_SENSITIVITY,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
} from '../types'
import { el, icon, iconButton, toast } from '../ui'
import { releaseWakeLock, requestWakeLock } from '../wake-lock'

interface PracticeEvent {
  displayed: string
  sounding: string
  pitchClasses: number[]
  profile?: number[]
  root?: number
  token: HTMLElement
  line: HTMLElement | null
  lineIndex: number
}

export async function renderPractice(
  root: HTMLElement,
  id: string,
): Promise<(() => void) | void> {
  const found = await db.songs.get(id)
  if (!found) {
    toast('Песня не найдена')
    goBack('/')
    return
  }
  const song = found
  const settings = await loadSettings()
  const preference = inferAccidentalPreference(song.key, song.content)
  const font = Math.max(
    MIN_FONT_SIZE,
    Math.min(MAX_FONT_SIZE, song.fontSize ?? settings.fontSize),
  )
  const keyText = keyLabel(song.key, song.transpose, preference)

  document.title = `${song.title} — тренировка`

  const content = el('div', { class: 'perform-content practice-content' })
  content.style.setProperty('--song-font-size', `${font}px`)
  content.append(renderSong(song.content, { transpose: song.transpose, preference }))

  const events: PracticeEvent[] = []
  for (const token of Array.from(content.querySelectorAll<HTMLElement>('.chord-token'))) {
    const displayed = token.dataset.chord ?? ''
    const pitchClasses = chordPitchClasses(displayed, song.capo)
    if (!pitchClasses) continue
    const sounding = transposeChord(displayed, song.capo, preference)
    const lineIndex = Number(token.dataset.chordLineIndex ?? '0')
    events.push({
      displayed,
      sounding,
      pitchClasses,
      profile: settings.mic.profiles[sounding],
      root: chordRootPitchClass(sounding) ?? undefined,
      token,
      line: content.querySelector<HTMLElement>(`[data-line-index="${lineIndex}"]`),
      lineIndex,
    })
  }

  let focusIndex = 0
  const engine = createEngine()
  engine.setFocus(focusIndex)

  let micOn = false
  let micStarting = false
  let micSession: MicrophoneSession | null = null
  let follow = false
  let feedback: PracticeFeedback = 'idle'
  let disposed = false
  let latestBest: BestChord[] = []

  const micSupported = isMicrophoneSupported()
  const micOptions: MicrophoneOptions = {
    noiseFloor: settings.mic.noiseFloor,
    threshold: settings.mic.threshold,
    a4: settings.mic.a4,
  }

  const statusChord = el('span', { class: 'practice-status-chord' })
  const statusHint = el('span', { class: 'practice-status-hint' })
  const status = el(
    'div',
    { class: 'practice-status', 'aria-live': 'polite' },
    statusChord,
    statusHint,
  )

  const micButton = iconButton('mic', 'Включить микрофон', () => void toggleMic(), 'practice-mic')
  micButton.setAttribute('aria-pressed', 'false')

  const startButton = el(
    'button',
    {
      class: 'practice-tool',
      type: 'button',
      onClick: () => focusTo(0, true),
    },
    icon('arrowUp', 17),
    el('span', {}, 'В начало'),
  )

  const followButton = el(
    'button',
    {
      class: 'practice-tool',
      type: 'button',
      'aria-pressed': 'false',
      onClick: () => toggleFollow(),
    },
    icon('arrowDown', 17),
    el('span', {}, 'Следовать'),
  )

  const nextButton = el(
    'button',
    {
      class: 'practice-tool',
      type: 'button',
      onClick: () => focusTo(focusIndex + 1, true),
    },
    el('span', {}, 'Далее'),
    icon('forward', 17),
  )

  const subtitleParts = ['Тренировка', keyText, song.capo > 0 ? `капо ${song.capo}` : ''].filter(
    Boolean,
  )

  const screen = el(
    'div',
    { class: 'practice-screen' },
    el(
      'header',
      { class: 'perform-top practice-top' },
      iconButton('back', 'Назад', () => goBack('/')),
      el(
        'div',
        { class: 'perform-title' },
        el('div', { class: 'perform-title-main' }, song.title),
        el('div', { class: 'perform-title-sub' }, subtitleParts.join(' · ')),
      ),
      micButton,
    ),
    el(
      'div',
      { class: 'perform-scroll practice-scroll' },
      content,
      el('div', { class: 'practice-spacer' }),
    ),
    el(
      'footer',
      { class: 'practice-controls' },
      status,
      el('div', { class: 'practice-tools' }, startButton, followButton, nextButton),
      el(
        'div',
        { class: 'practice-note' },
        'Калибровка аккордов и диагностика микрофона находятся в настройках приложения.',
      ),
    ),
  )

  root.append(screen)
  document.body.classList.add('is-practice')

  const onContentClick = (event: Event): void => {
    if (!events.length) return
    const target = event.target as Element | null
    if (!target) return
    const token = target.closest<HTMLElement>('.chord-token')
    let index = token ? events.findIndex((item) => item.token === token) : -1
    if (index < 0) {
      const line = target.closest<HTMLElement>('[data-line-index]')
      if (!line) return
      const lineIndex = Number(line.dataset.lineIndex ?? '0')
      index = events.findIndex((item) => item.lineIndex >= lineIndex)
      if (index < 0) index = events.length - 1
    }
    if (index >= 0) focusTo(index, true)
  }

  const onVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden' && micOn) stopMic()
  }

  content.addEventListener('click', onContentClick)
  document.addEventListener('visibilitychange', onVisibilityChange)
  void requestWakeLock()

  if (micSupported) {
    micButton.title = 'Включить микрофон'
  } else {
    micButton.disabled = true
    followButton.disabled = true
    micButton.title = window.isSecureContext
      ? 'Микрофон не поддерживается'
      : 'Микрофон доступен только по HTTPS или localhost'
  }

  if (events.length === 0) {
    micButton.disabled = true
    followButton.disabled = true
    startButton.disabled = true
    nextButton.disabled = true
  }

  focusTo(0, false)
  updateStatus()

  return () => {
    disposed = true
    stopMic()
    releaseWakeLock()
    document.body.classList.remove('is-practice')
    content.removeEventListener('click', onContentClick)
    document.removeEventListener('visibilitychange', onVisibilityChange)
  }

  function createEngine(): PracticeEngine {
    const sensitivity = song.followSensitivity ?? DEFAULT_FOLLOW_SENSITIVITY
    return new PracticeEngine(
      events.map((event) => ({
        displayed: event.displayed,
        pitchClasses: event.pitchClasses,
        profile: event.profile,
        root: event.root,
      })),
      {
        minEnergy: settings.mic.threshold,
        ...FOLLOW_PRESETS[sensitivity],
      },
    )
  }

  function focusTo(index: number, scroll: boolean): void {
    if (events.length === 0) {
      updateStatus()
      return
    }
    focusIndex = Math.max(0, Math.min(events.length - 1, index))
    engine.setFocus(focusIndex)
    for (const item of events) {
      item.token.classList.remove('is-current', 'is-matched', 'is-mismatch')
      item.line?.classList.remove('is-current-line', 'is-matched-line', 'is-mismatch-line')
    }
    const current = events[focusIndex]
    current.token.classList.add('is-current')
    current.line?.classList.add('is-current-line')
    if (scroll) {
      current.line?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
    feedback = 'idle'
    updateStatus()
    updateControls()
  }

  function toggleFollow(): void {
    follow = !follow
    followButton.classList.toggle('is-active', follow)
    followButton.setAttribute('aria-pressed', String(follow))
    updateStatus()
  }

  async function toggleMic(): Promise<void> {
    if (disposed || micStarting) return
    if (micOn) {
      stopMic()
      return
    }
    if (events.length === 0) {
      toast('В песне нет аккордов')
      return
    }
    if (!micSupported) {
      toast(
        window.isSecureContext
          ? 'Браузер не поддерживает микрофон'
          : 'Микрофон доступен только по HTTPS или localhost',
        { duration: 4500 },
      )
      return
    }

    micStarting = true
    micButton.disabled = true
    statusHint.textContent = 'Запрашиваю доступ к микрофону…'
    try {
      const session = await startMicrophone(processFrame, micOptions)
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
      micButton.title = 'Выключить микрофон'
      updateStatus()
    } catch (error) {
      const message =
        error instanceof MicrophoneError ? error.message : 'Не удалось включить микрофон'
      toast(message, { duration: 4500 })
      updateStatus()
    } finally {
      micStarting = false
      micButton.disabled = !micSupported || events.length === 0
      updateControls()
    }
  }

  function stopMic(): void {
    micOn = false
    micSession?.stop()
    micSession = null
    micButton.classList.remove('is-active')
    micButton.replaceChildren(icon('mic', 20))
    micButton.setAttribute('aria-pressed', 'false')
    micButton.setAttribute('aria-label', 'Включить микрофон')
    micButton.title = 'Включить микрофон'
    clearFeedback()
    feedback = 'idle'
    latestBest = []
    updateStatus()
    updateControls()
  }

  function processFrame(frame: MicrophoneFrame): void {
    if (!micOn) return
    latestBest = bestChords(frame.chroma, settings.mic.profiles, 3)

    const result = engine.update(frame.chroma, frame.energy, frame.timestamp, follow)
    applyFeedback(result)
    if (result.advanced) focusTo(result.focusIndex, true)
  }

  function applyFeedback(result: PracticeResult): void {
    feedback = result.feedback
    for (const item of events) {
      item.token.classList.remove('is-matched', 'is-mismatch')
      item.line?.classList.remove('is-matched-line', 'is-mismatch-line')
    }
    if (result.feedback === 'matched') {
      const current = events[result.focusIndex]
      current?.token.classList.add('is-matched')
      current?.line?.classList.add('is-matched-line')
    } else if (result.feedback === 'mismatch') {
      const current = events[result.focusIndex]
      current?.token.classList.add('is-mismatch')
      current?.line?.classList.add('is-mismatch-line')
    }
    updateStatus()
  }

  function clearFeedback(): void {
    for (const item of events) {
      item.token.classList.remove('is-matched', 'is-mismatch')
      item.line?.classList.remove('is-matched-line', 'is-mismatch-line')
    }
  }

  function updateStatus(): void {
    status.classList.remove('is-success', 'is-warning')
    const current = events[focusIndex]
    if (!current) {
      statusChord.textContent = 'Нет аккордов'
      statusHint.textContent = 'Этот режим работает для песен с аккордами.'
      return
    }

    if (!micOn) {
      statusChord.textContent = `Ожидается ${current.displayed}`
      if (!micSupported) {
        statusHint.textContent = window.isSecureContext
          ? 'Микрофон не поддерживается этим браузером.'
          : 'Микрофон доступен только по HTTPS или localhost.'
      } else {
        statusHint.textContent = follow
          ? 'Включите микрофон, чтобы следовать за игрой.'
          : 'Тапните по аккорду или включите микрофон.'
      }
      return
    }

    const best = latestBest[0]
    const bestPitchClasses = best ? chordPitchClasses(best.name) : null
    const bestIsExpected = Boolean(
      bestPitchClasses && samePitchClasses(bestPitchClasses, current.pitchClasses),
    )
    const heard =
      best && best.score >= 0.35 && !bestIsExpected ? `Слышу ${best.name}. ` : ''
    const expectedLabel =
      song.capo > 0 ? `${current.sounding} (${current.displayed})` : current.displayed

    if (feedback === 'matched') {
      statusChord.textContent = `Совпадает: ${current.displayed}`
      statusHint.textContent = resultHint('Так держать.')
      status.classList.add('is-success')
    } else if (feedback === 'mismatch') {
      statusChord.textContent = `Ожидается ${current.displayed}`
      statusHint.textContent = `${heard}Сейчас ожидается ${expectedLabel}.`
      status.classList.add('is-warning')
    } else if (feedback === 'idle') {
      statusChord.textContent = `Слушаю · ${current.displayed}`
      statusHint.textContent =
        settings.mic.lastCalibratedAt === null
          ? 'Тишина. Если играете — откалибруйте микрофон в настройках.'
          : 'Тишина. Играйте аккорд.'
    } else {
      statusChord.textContent = `Слушаю · ${current.displayed}`
      statusHint.textContent = heard
        ? `${heard}Ожидается ${expectedLabel}.`
        : 'Сравниваю с текущим аккордом.'
    }
  }

  function resultHint(text: string): string {
    return follow ? `${text} Следующий аккорд прокрутится сам.` : text
  }

  function updateControls(): void {
    nextButton.disabled = events.length === 0 || focusIndex >= events.length - 1
    startButton.disabled = events.length === 0
  }
}
