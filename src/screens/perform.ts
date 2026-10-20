import { renderSong } from '../chords/render'
import { inferAccidentalPreference, transposeChord } from '../chords/transpose'
import { db, loadSettings, updateSongPreferences } from '../db'
import { createFullscreenControl } from '../fullscreen-button'
import { getNavigationState, goBack, performPath, replace } from '../router'
import { keyLabel, transposeLabel } from '../song-utils'
import {
  DEFAULT_FOLLOW_SENSITIVITY,
  MAX_FONT_SIZE,
  MAX_SCROLL_SPEED,
  MIN_FONT_SIZE,
  MIN_SCROLL_SPEED,
} from '../types'
import { el, icon, iconButton, toast } from '../ui'
import { isWakeLockSupported, releaseWakeLock, requestWakeLock } from '../wake-lock'
import { chordPitchClasses, chordRootPitchClass } from '../audio/chord-math'
import {
  FOLLOW_PRESETS,
  PracticeEngine,
  type PracticeResult,
} from '../audio/practice-engine'
import {
  isMicrophoneSupported,
  MicrophoneError,
  startMicrophone,
  type MicrophoneSession,
} from '../audio/microphone'

const SPEED_STEP = 5
type ScrollMode = 'timer' | 'chords'
let preferredScrollMode: ScrollMode = 'timer'

interface FollowEvent {
  displayed: string
  sounding: string
  pitchClasses: number[]
  profile?: number[]
  root?: number
  token: HTMLElement
  line: HTMLElement | null
  lineIndex: number
}

export async function renderPerform(root: HTMLElement, id: string): Promise<(() => void) | void> {
  const found = await db.songs.get(id)
  if (!found) {
    toast('Песня не найдена')
    goBack('/')
    return
  }
  const song = found

  const settings = await loadSettings()
  const preference = inferAccidentalPreference(song.key, song.content)
  const navigationQueue = getNavigationState()?.queue
  const queueIndex = navigationQueue ? navigationQueue.songIds.indexOf(song.id) : -1
  const queue =
    navigationQueue && queueIndex >= 0 && navigationQueue.songIds.length > 1
      ? navigationQueue
      : null
  let transpose = song.transpose
  let speed = Math.max(
    MIN_SCROLL_SPEED,
    Math.min(MAX_SCROLL_SPEED, song.scrollSpeed ?? settings.scrollSpeed),
  )
  let fontSize = Math.max(
    MIN_FONT_SIZE,
    Math.min(MAX_FONT_SIZE, song.fontSize ?? settings.fontSize),
  )
  let playing = false
  let disposed = false
  let frame = 0
  let lastFrame = 0
  let scrollPosition = 0
  let chordsHidden = false
  let mode: ScrollMode = preferredScrollMode
  let following = false
  let followStarting = false
  let followSession: MicrophoneSession | null = null
  let followToken = 0
  let followIndex = 0
  let followEvents: FollowEvent[] = []
  let profilesHintShown = false

  document.title = `${song.title} — исполнение`

  const content = el('div', { class: 'perform-content' })
  content.style.setProperty('--song-font-size', `${fontSize}px`)
  const title = el('div', { class: 'perform-title-main' }, song.title)
  const subtitle = el('div', { class: 'perform-title-sub' })
  const transposeValue = el(
    'button',
    {
      class: 'transpose-mini-value',
      type: 'button',
      title: 'Сбросить транспонирование',
      onClick: () => void changeTranspose(-transpose),
    },
    transposeLabel(transpose),
  )

  const playButton = el('button', {
    class: 'scroll-toggle',
    type: 'button',
    'aria-label': 'Начать автоскролл',
    title: 'Автоскролл',
    onClick: () => togglePlayback(),
  })
  playButton.append(icon('play', 26))

  const chordsButton = iconButton(
    'eye',
    'Скрыть аккорды',
    () => toggleChords(),
    'chords-button',
  )
  chordsButton.setAttribute('aria-pressed', 'false')

  const speedValue = el('span', { class: 'speed-value' }, `${speed} px/с`)
  const hintRest = el('span', {}, ' · тап по тексту — пауза')
  const timerModeButton = el(
    'button',
    {
      class: 'scroll-mode',
      type: 'button',
      'aria-pressed': 'true',
      onClick: () => setMode('timer'),
    },
    'Таймер',
  )
  const chordsModeButton = el(
    'button',
    {
      class: 'scroll-mode',
      type: 'button',
      'aria-pressed': 'false',
      onClick: () => setMode('chords'),
    },
    'Аккорды',
  )
  const fullscreenControl = createFullscreenControl({ className: 'fullscreen-button' })
  const fullscreenButton = fullscreenControl.button
  const slowerButton = el(
    'button',
    {
      class: 'control-button',
      type: 'button',
      'aria-label': 'Медленнее',
      title: 'Медленнее',
      onClick: () => changeSpeed(-SPEED_STEP),
    },
    icon('minus', 20),
  )
  const fasterButton = el(
    'button',
    {
      class: 'control-button',
      type: 'button',
      'aria-label': 'Быстрее',
      title: 'Быстрее',
      onClick: () => changeSpeed(SPEED_STEP),
    },
    icon('plus', 20),
  )
  const queueBar = queue
    ? el(
        'div',
        { class: 'perform-queue' },
        el(
          'button',
          {
            class: 'queue-button',
            type: 'button',
            disabled: queueIndex <= 0,
            'aria-label': 'Предыдущая песня сета',
            onClick: () => goToQueue(queueIndex - 1),
          },
          icon('back', 18),
          el('span', {}, 'Назад'),
        ),
        el(
          'div',
          { class: 'queue-position' },
          el(
            'span',
            { class: 'queue-position-main' },
            `${queueIndex + 1} / ${queue.songIds.length}`,
          ),
          el('span', { class: 'queue-position-label' }, queue.label ?? 'Случайный сет'),
        ),
        el(
          'button',
          {
            class: 'queue-button',
            type: 'button',
            disabled: queueIndex >= queue.songIds.length - 1,
            'aria-label': 'Следующая песня сета',
            onClick: () => goToQueue(queueIndex + 1),
          },
          el('span', {}, 'Далее'),
          icon('forward', 18),
        ),
      )
    : null

  const scroller = el(
    'div',
    { class: 'perform-scroll' },
    content,
    el('div', { class: 'perform-spacer' }),
  )

  const screen = el(
    'div',
    { class: 'perform-screen' },
    el(
      'header',
      { class: 'perform-top' },
      iconButton('back', 'Назад', () => goBack('/')),
      el('div', { class: 'perform-title' }, title, subtitle),
      el(
        'div',
        { class: 'perform-transpose' },
        el(
          'button',
          {
            class: 'transpose-mini-button',
            type: 'button',
            'aria-label': 'Транспонировать на полтона вниз',
            onClick: () => void changeTranspose(-1),
          },
          '−',
        ),
        transposeValue,
        el(
          'button',
          {
            class: 'transpose-mini-button',
            type: 'button',
            'aria-label': 'Транспонировать на полтона вверх',
            onClick: () => void changeTranspose(1),
          },
          '+',
        ),
      ),
      chordsButton,
    ),
    scroller,
    el(
      'footer',
      { class: 'perform-controls' },
      queueBar,
      el(
        'div',
        { class: 'scroll-modes-row' },
        el('div', { class: 'scroll-modes' }, timerModeButton, chordsModeButton),
        fullscreenButton,
      ),
      el(
        'div',
        { class: 'scroll-controls' },
        iconButton('arrowUp', 'В начало', () => resetScroll(), 'control-button'),
        slowerButton,
        playButton,
        fasterButton,
        el(
          'button',
          {
            class: 'control-button font-control',
            type: 'button',
            'aria-label': 'Уменьшить шрифт',
            onClick: () => changeFont(fontSize - 1),
          },
          'A−',
        ),
        el(
          'button',
          {
            class: 'control-button font-control font-control-large',
            type: 'button',
            'aria-label': 'Увеличить шрифт',
            onClick: () => changeFont(fontSize + 1),
          },
          'A+',
        ),
      ),
      el('div', { class: 'scroll-hint' }, speedValue, hintRest),
    ),
  )

  root.append(screen)
  document.body.classList.add('is-perform')
  renderContent()
  buildFollowEvents()
  updateMeta()
  updateModeUI()

  const onPointerDown = (event: PointerEvent): void => {
    pointerStartY = event.clientY
    pointerStartTime = performance.now()
    pointerMoved = false
  }
  const onPointerMove = (event: PointerEvent): void => {
    if (Math.abs(event.clientY - pointerStartY) > 8) {
      pointerMoved = true
      if (playing) stopPlayback()
      if (following) stopFollow()
    }
  }
  const onPointerUp = (event: PointerEvent): void => {
    const target = event.target as Element | null
    if (pointerMoved) return
    if (target?.closest('button, a, input, textarea, select')) return
    if (performance.now() - pointerStartTime > 450) return
    if (Math.abs(event.clientY - pointerStartY) > 8) return
    togglePlayback()
  }
  const onWheel = (): void => {
    if (playing) stopPlayback()
    if (following) stopFollow()
  }
  const onVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden' && following) stopFollow()
  }
  let pointerStartY = 0
  let pointerStartTime = 0
  let pointerMoved = false
  scroller.addEventListener('pointerdown', onPointerDown)
  scroller.addEventListener('pointermove', onPointerMove)
  scroller.addEventListener('pointerup', onPointerUp)
  scroller.addEventListener('wheel', onWheel, { passive: true })
  document.addEventListener('visibilitychange', onVisibilityChange)

  void startWakeLock()

  return () => {
    disposed = true
    stopPlayback()
    stopFollow()
    document.removeEventListener('visibilitychange', onVisibilityChange)
    fullscreenControl.cleanup()
    releaseWakeLock()
    document.body.classList.remove('is-perform')
    scroller.removeEventListener('pointerdown', onPointerDown)
    scroller.removeEventListener('pointermove', onPointerMove)
    scroller.removeEventListener('pointerup', onPointerUp)
    scroller.removeEventListener('wheel', onWheel)
  }

  async function startWakeLock(): Promise<void> {
    if (!isWakeLockSupported()) return
    const ok = await requestWakeLock()
    if (disposed) {
      releaseWakeLock()
      return
    }
    if (!ok) {
      toast('Браузер не разрешил удержать экран включённым', { duration: 2600 })
    }
  }

  function renderContent(): void {
    const scrollTop = scroller.scrollTop
    content.replaceChildren(renderSong(song.content, { transpose, preference }))
    scroller.scrollTop = scrollTop
    scrollPosition = scrollTop
  }

  function updateMeta(): void {
    const label = keyLabel(song.key, transpose, preference)
    const parts = [song.artist, song.capo > 0 ? `капо ${song.capo}` : '', label].filter(Boolean)
    subtitle.textContent = parts.join(' · ')
    transposeValue.textContent = transposeLabel(transpose)
  }

  async function changeTranspose(delta: number): Promise<void> {
    const next = Math.max(-11, Math.min(11, transpose + delta))
    if (next === transpose) return
    if (following) stopFollow()
    transpose = next
    song.transpose = next
    updateMeta()
    renderContent()
    buildFollowEvents()
    await updateSongPreferences(song.id, { transpose: next })
  }

  function changeSpeed(delta: number): void {
    speed = Math.max(MIN_SCROLL_SPEED, Math.min(MAX_SCROLL_SPEED, speed + delta))
    speedValue.textContent = `${speed} px/с`
    void updateSongPreferences(song.id, { scrollSpeed: speed })
  }

  async function changeFont(next: number): Promise<void> {
    const clamped = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, next))
    if (clamped === fontSize) return
    fontSize = clamped
    content.style.setProperty('--song-font-size', `${clamped}px`)
    await updateSongPreferences(song.id, { fontSize: clamped })
  }

  function toggleChords(): void {
    chordsHidden = !chordsHidden
    content.classList.toggle('hide-chords', chordsHidden)
    chordsButton.replaceChildren(icon(chordsHidden ? 'eyeOff' : 'eye'))
    chordsButton.classList.toggle('is-active', chordsHidden)
    chordsButton.setAttribute('aria-pressed', String(chordsHidden))
    chordsButton.setAttribute(
      'aria-label',
      chordsHidden ? 'Показать аккорды' : 'Скрыть аккорды',
    )
    if (playing) stopPlayback()
  }

  function updatePlayButton(): void {
    const active = mode === 'timer' ? playing : following
    const label =
      mode === 'timer'
        ? active
          ? 'Пауза'
          : 'Начать автоскролл'
        : active
          ? 'Остановить микрофон'
          : 'Слушать и следовать'
    playButton.replaceChildren(icon(active ? 'pause' : 'play', 26))
    playButton.classList.toggle('is-playing', active)
    playButton.setAttribute('aria-label', label)
    playButton.title = label
  }

  function setMode(nextMode: ScrollMode): void {
    if (mode === nextMode) return
    if (playing) stopPlayback()
    if (following) stopFollow()
    followToken++
    mode = nextMode
    preferredScrollMode = nextMode
    updateModeUI()
  }

  function updateModeUI(): void {
    timerModeButton.classList.toggle('is-active', mode === 'timer')
    chordsModeButton.classList.toggle('is-active', mode === 'chords')
    timerModeButton.setAttribute('aria-pressed', String(mode === 'timer'))
    chordsModeButton.setAttribute('aria-pressed', String(mode === 'chords'))
    slowerButton.disabled = mode === 'chords'
    fasterButton.disabled = mode === 'chords'

    if (mode === 'timer') {
      speedValue.textContent = `${speed} px/с`
      hintRest.textContent = ' · тап по тексту — пауза'
    } else {
      speedValue.textContent = 'по аккордам'
      if (!isMicrophoneSupported()) {
        hintRest.textContent = ' · микрофон недоступен'
      } else if (following) {
        hintRest.textContent = ' · слушаю, тап — пауза'
      } else {
        hintRest.textContent = ' · ▶ — слушать'
      }
    }
    updatePlayButton()
  }

  function buildFollowEvents(): void {
    followEvents = []
    for (const token of Array.from(content.querySelectorAll<HTMLElement>('.chord-token'))) {
      const displayed = token.dataset.chord ?? ''
      const sounding = transposeChord(displayed, song.capo, preference)
      const pitchClasses = chordPitchClasses(sounding)
      if (!pitchClasses) continue
      const lineIndex = Number(token.dataset.chordLineIndex ?? '0')
      followEvents.push({
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
    followIndex = Math.min(followIndex, Math.max(0, followEvents.length - 1))
  }

  function visibleFollowIndex(): number {
    if (followEvents.length === 0) return 0
    const top = scroller.getBoundingClientRect().top + 8
    const index = followEvents.findIndex(
      (event) => event.line && event.line.getBoundingClientRect().bottom > top,
    )
    return index >= 0 ? index : 0
  }

  function clearFollowHighlight(): void {
    for (const event of followEvents) {
      event.token.classList.remove('is-current', 'is-matched')
      event.line?.classList.remove('is-current-line', 'is-matched-line')
    }
  }

  function setFollowFocus(index: number, scroll: boolean): void {
    if (followEvents.length === 0) return
    clearFollowHighlight()
    followIndex = Math.max(0, Math.min(followEvents.length - 1, index))
    const current = followEvents[followIndex]
    current?.token.classList.add('is-current')
    current?.line?.classList.add('is-current-line')
    if (scroll) {
      current?.line?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  function applyFollowFeedback(result: PracticeResult): void {
    for (const event of followEvents) {
      event.token.classList.remove('is-matched')
      event.line?.classList.remove('is-matched-line')
    }
    if (result.feedback !== 'matched') return
    const current = followEvents[result.focusIndex]
    current?.token.classList.add('is-matched')
    current?.line?.classList.add('is-matched-line')
  }

  async function startFollow(): Promise<void> {
    if (following || followStarting) return
    if (followEvents.length === 0) buildFollowEvents()
    if (followEvents.length === 0) {
      toast('В песне нет аккордов')
      return
    }
    if (!isMicrophoneSupported()) {
      toast(
        window.isSecureContext
          ? 'Браузер не поддерживает микрофон'
          : 'Микрофон доступен только по HTTPS или localhost',
      )
      return
    }
    if (playing) stopPlayback()
    if (Object.keys(settings.mic.profiles).length === 0 && !profilesHintShown) {
      profilesHintShown = true
      toast('Профили не найдены. Откройте «Настройки → Микрофон и калибровка».', {
        duration: 4500,
      })
    }

    const token = ++followToken
    followStarting = true
    followIndex = visibleFollowIndex()
    const sensitivity = song.followSensitivity ?? DEFAULT_FOLLOW_SENSITIVITY
    const engine = new PracticeEngine(
      followEvents.map((event) => ({
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
    engine.setFocus(followIndex)

    try {
      const session = await startMicrophone(
        (frame) => {
          if (!following) return
          const result = engine.update(frame.chroma, frame.energy, frame.timestamp, true)
          if (result.advanced) {
            setFollowFocus(result.focusIndex, true)
          }
          applyFollowFeedback(result)
        },
        {
          noiseFloor: settings.mic.noiseFloor,
          threshold: settings.mic.threshold,
          a4: settings.mic.a4,
        },
      )
      if (disposed || token !== followToken || mode !== 'chords') {
        session.stop()
        return
      }
      followSession = session
      following = true
      setFollowFocus(followIndex, false)
      updateModeUI()
    } catch (error) {
      const message =
        error instanceof MicrophoneError ? error.message : 'Не удалось включить микрофон'
      toast(message)
      updateModeUI()
    } finally {
      followStarting = false
      updatePlayButton()
    }
  }

  function stopFollow(): void {
    following = false
    followToken++
    followSession?.stop()
    followSession = null
    clearFollowHighlight()
    updateModeUI()
  }

  function goToQueue(nextIndex: number): void {
    if (!queue || nextIndex < 0 || nextIndex >= queue.songIds.length) return
    stopPlayback()
    stopFollow()
    replace(performPath(queue.songIds[nextIndex]), {
      queue: { ...queue, index: nextIndex },
    })
  }

  function togglePlayback(): void {
    if (mode === 'timer') {
      if (playing) {
        stopPlayback()
      } else {
        startPlayback()
      }
      return
    }
    if (following) {
      stopFollow()
    } else {
      void startFollow()
    }
  }

  function startPlayback(): void {
    if (playing) return
    const maxScroll = scroller.scrollHeight - scroller.clientHeight
    if (maxScroll <= 2) {
      toast('Текст уже помещается на экране')
      return
    }
    scrollPosition = scroller.scrollTop
    if (scrollPosition >= maxScroll - 1) {
      scrollPosition = 0
      scroller.scrollTop = 0
    }
    playing = true
    lastFrame = 0
    updatePlayButton()
    frame = requestAnimationFrame(tick)
  }

  function stopPlayback(): void {
    if (!playing && frame === 0) return
    playing = false
    cancelAnimationFrame(frame)
    frame = 0
    lastFrame = 0
    updatePlayButton()
  }

  function tick(now: number): void {
    if (!playing) return
    if (lastFrame === 0) lastFrame = now
    const delta = Math.min((now - lastFrame) / 1000, 0.12)
    lastFrame = now

    const maxScroll = scroller.scrollHeight - scroller.clientHeight
    scrollPosition = Math.min(scrollPosition + speed * delta, maxScroll)
    scroller.scrollTop = scrollPosition

    if (scrollPosition >= maxScroll - 0.5) {
      stopPlayback()
      toast('Конец песни')
      return
    }
    frame = requestAnimationFrame(tick)
  }

  function resetScroll(): void {
    stopPlayback()
    stopFollow()
    scrollPosition = 0
    scroller.scrollTo({ top: 0, behavior: 'smooth' })
  }
}
