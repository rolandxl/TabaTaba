import { buildChordProfile, computeNoiseCalibration } from '../audio/calibration'
import {
  isMicrophoneSupported,
  MicrophoneError,
  startMicrophone,
  type MicrophoneFrame,
  type MicrophoneOptions,
  type MicrophoneSession,
} from '../audio/microphone'
import { collectLibraryChords, type LibraryChord } from '../chords/inventory'
import { db, loadSettings, saveSettings } from '../db'
import { goBack } from '../router'
import { DEFAULT_MIC_CALIBRATION, type MicCalibration } from '../types'
import {
  button,
  confirmDialog,
  el,
  icon,
  iconButton,
  plural,
  toast,
} from '../ui'
import { releaseWakeLock, requestWakeLock } from '../wake-lock'

type ChordFilter = 'all' | 'missing' | 'ready'
type SourceFilter = 'library' | 'song'
type BulkMode = 'missing' | 'all'
type WaitAction = 'advance' | 'retry'

interface CaptureTask {
  chord: LibraryChord
  bulk: boolean
  startedAt: number
  captureStartedAt: number | null
  chromas: Float32Array[]
}

interface WaitTask {
  action: WaitAction
  chord: LibraryChord
  successAt: number
  silenceSince: number | null
}

interface BulkState {
  mode: BulkMode
  queue: LibraryChord[]
  index: number
}

const CAPTURE_DURATION = 2800
const CAPTURE_WINDOW = 1800
const NOISE_DURATION = 2000
const SILENCE_HOLD = 650
const SILENCE_MIN_GAP = 500

export async function renderCalibration(
  root: HTMLElement,
  songId?: string,
): Promise<(() => void) | void> {
  const [songs, settings] = await Promise.all([db.songs.toArray(), loadSettings()])
  const contextSong = songId ? songs.find((song) => song.id === songId) : undefined
  if (songId && !contextSong) {
    toast('Песня не найдена')
  }

  let micCalibration: MicCalibration = {
    ...DEFAULT_MIC_CALIBRATION,
    ...settings.mic,
    profiles: { ...settings.mic.profiles },
  }
  const inventory = collectLibraryChords(songs, micCalibration.profiles)

  let micOn = false
  let micStarting = false
  let micSession: MicrophoneSession | null = null
  let disposed = false
  let query = ''
  let filter: ChordFilter = contextSong ? 'missing' : 'all'
  let source: SourceFilter = contextSong ? 'song' : 'library'
  let bulkMode: BulkMode = 'missing'
  let bulk: BulkState | null = null
  let capture: CaptureTask | null = null
  let waiting: WaitTask | null = null
  let noiseTask: { startedAt: number; raw: number[] } | null = null
  let persistChain: Promise<void> = Promise.resolve()

  const micSupported = isMicrophoneSupported()
  const micOptions: MicrophoneOptions = {
    noiseFloor: micCalibration.noiseFloor,
    threshold: micCalibration.threshold,
    a4: micCalibration.a4,
  }

  document.title = 'Калибровка аккордов — TabaTaba'

  const micButton = iconButton('mic', 'Включить микрофон', () => void toggleMic(), 'practice-mic')
  micButton.setAttribute('aria-pressed', 'false')

  const levelFill = el('div', { class: 'level-fill' })
  const levelText = el('div', { class: 'level-text' }, 'Микрофон выключен')
  const noiseButton = button('Калибровать тишину', () => startNoise(), 'ghost')

  const searchInput = el('input', {
    class: 'search-input',
    type: 'search',
    placeholder: 'Аккорд, песня или исполнитель',
    'aria-label': 'Поиск аккордов по библиотеке',
    autocomplete: 'off',
    onInput: (event: Event) => {
      query = (event.target as HTMLInputElement).value
      clearSearch.hidden = query.length === 0
      renderList()
    },
  })
  const clearSearch = iconButton('close', 'Очистить поиск', () => {
    searchInput.value = ''
    query = ''
    clearSearch.hidden = true
    renderList()
    searchInput.focus()
  })
  clearSearch.classList.add('search-clear')
  clearSearch.hidden = true
  const searchBox = el(
    'div',
    { class: 'search-box calibration-search' },
    el('span', { class: 'search-icon' }, icon('search', 18)),
    searchInput,
    clearSearch,
  )

  const sourceButtons = new Map<SourceFilter, HTMLButtonElement>()
  const sourceRow = contextSong
    ? el(
        'div',
        { class: 'calibration-filter-row' },
        el('span', { class: 'field-label' }, 'Источник'),
        buildSourceButtons(),
      )
    : null

  const filterButtons = new Map<ChordFilter, HTMLButtonElement>()
  const filterRow = el(
    'div',
    { class: 'calibration-filter-row' },
    el('span', { class: 'field-label' }, 'Показывать'),
    el(
      'div',
      { class: 'segmented' },
      makeFilterButton('all', 'Все'),
      makeFilterButton('missing', 'Без профиля'),
      makeFilterButton('ready', 'С профилем'),
    ),
  )

  const progressText = el('div', { class: 'calibration-progress' })
  const list = el('div', { class: 'calibration-list' })
  const resetButton = button('Сбросить все профили', () => void resetProfiles(), 'ghost', 'trash')
  resetButton.classList.add('calibration-reset')

  const bulkMissingButton = makeBulkButton('missing', 'Только новые')
  const bulkAllButton = makeBulkButton('all', 'Перезаписать всё')
  const bulkStartButton = button(
    'Начать массовую запись',
    () => {
      if (bulk) stopBulk()
      else startBulk()
    },
    'primary',
    'play',
  )
  const bulkSkipButton = button('Пропустить', () => skipBulk(), 'ghost')
  bulkSkipButton.hidden = true
  const bulkStatus = el(
    'div',
    { class: 'calibration-bulk-status' },
    'Выберите режим и запустите запись. После удачного аккорда система сама перейдёт к следующему после тишины.',
  )

  const status = el(
    'div',
    { class: 'calibration-status' },
    'Профили хранятся только на этом устройстве.',
  )

  const screen = el(
    'div',
    { class: 'screen calibration-screen' },
    el(
      'header',
      { class: 'topbar' },
      iconButton('back', 'Назад', () => goBack('/settings')),
      el('div', { class: 'topbar-title' }, 'Калибровка аккордов'),
      micButton,
    ),
    el(
      'div',
      { class: 'calibration-content' },
      el(
        'p',
        { class: 'calibration-lead' },
        contextSong ? contextSong.title : 'Вся библиотека',
      ),
      el(
        'section',
        { class: 'calibration-card' },
        el('h2', { class: 'calibration-heading' }, '1. Уровень микрофона'),
        el('div', { class: 'level-meter' }, levelFill),
        levelText,
        el(
          'p',
          { class: 'calibration-hint' },
          'Включите микрофон, затем нажмите «Калибровать тишину» и не играйте 2 секунды.',
        ),
        noiseButton,
      ),
      el(
        'section',
        { class: 'calibration-card' },
        el('h2', { class: 'calibration-heading' }, '2. Поиск и выбор'),
        el(
          'p',
          { class: 'calibration-hint' },
          'Ищите аккорды по всей библиотеке. Учитываются транспонирование и капо каждой песни.',
        ),
        searchBox,
        sourceRow,
        filterRow,
        progressText,
        list,
        el('div', { class: 'calibration-actions' }, resetButton),
      ),
      el(
        'section',
        { class: 'calibration-card' },
        el('h2', { class: 'calibration-heading' }, '3. Массовая запись'),
        el(
          'div',
          { class: 'calibration-filter-row' },
          el('span', { class: 'field-label' }, 'Режим'),
          el('div', { class: 'segmented' }, bulkMissingButton, bulkAllButton),
        ),
        bulkStatus,
        el('div', { class: 'calibration-bulk-actions' }, bulkStartButton, bulkSkipButton),
      ),
      status,
    ),
  )

  root.append(screen)
  renderList()
  updateControls()

  if (!micSupported) {
    micButton.disabled = true
    noiseButton.disabled = true
    levelText.textContent = window.isSecureContext
      ? 'Микрофон не поддерживается этим браузером.'
      : 'Микрофон доступен только по HTTPS или localhost.'
  }

  const onVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden' && micOn) stopMic()
  }
  document.addEventListener('visibilitychange', onVisibilityChange)
  void requestWakeLock()

  return () => {
    disposed = true
    stopMic()
    releaseWakeLock()
    document.removeEventListener('visibilitychange', onVisibilityChange)
  }

  function buildSourceButtons(): HTMLElement {
    const group = el('div', { class: 'segmented' })
    sourceButtons.set(
      'song',
      el(
        'button',
        {
          class: 'segment-button',
          type: 'button',
          onClick: () => setSource('song'),
        },
        'Эта песня',
      ),
    )
    sourceButtons.set(
      'library',
      el(
        'button',
        {
          class: 'segment-button',
          type: 'button',
          onClick: () => setSource('library'),
        },
        'Вся библиотека',
      ),
    )
    group.append(sourceButtons.get('song')!, sourceButtons.get('library')!)
    return group
  }

  function makeFilterButton(value: ChordFilter, label: string): HTMLButtonElement {
    const element = el(
      'button',
      {
        class: 'segment-button',
        type: 'button',
        onClick: () => setFilter(value),
      },
      label,
    )
    filterButtons.set(value, element)
    return element
  }

  function makeBulkButton(value: BulkMode, label: string): HTMLButtonElement {
    return el(
      'button',
      {
        class: 'segment-button',
        type: 'button',
        onClick: () => {
          if (bulk) return
          bulkMode = value
          syncBulkButtons()
        },
      },
      label,
    )
  }

  function setSource(next: SourceFilter): void {
    if (bulk) return
    source = next
    syncSourceButtons()
    renderList()
  }

  function setFilter(next: ChordFilter): void {
    if (bulk) return
    filter = next
    syncFilterButtons()
    renderList()
  }

  function syncSourceButtons(): void {
    for (const [value, buttonElement] of sourceButtons) {
      buttonElement.classList.toggle('is-active', source === value)
      buttonElement.setAttribute('aria-pressed', String(source === value))
    }
  }

  function syncFilterButtons(): void {
    for (const [value, buttonElement] of filterButtons) {
      buttonElement.classList.toggle('is-active', filter === value)
      buttonElement.setAttribute('aria-pressed', String(filter === value))
    }
  }

  function syncBulkButtons(): void {
    bulkMissingButton.classList.toggle('is-active', bulkMode === 'missing')
    bulkAllButton.classList.toggle('is-active', bulkMode === 'all')
    bulkMissingButton.setAttribute('aria-pressed', String(bulkMode === 'missing'))
    bulkAllButton.setAttribute('aria-pressed', String(bulkMode === 'all'))
  }

  function basePool(): LibraryChord[] {
    if (source === 'song' && contextSong) {
      return inventory.filter((chord) =>
        chord.songs.some((item) => item.id === contextSong.id),
      )
    }
    return inventory
  }

  function filteredChords(): LibraryChord[] {
    const normalizedQuery = query.trim().toLocaleLowerCase('ru')
    return basePool().filter((chord) => {
      if (filter === 'missing' && chord.profile) return false
      if (filter === 'ready' && !chord.profile) return false
      if (!normalizedQuery) return true
      const haystack = [
        chord.sounding,
        chord.displayed,
        ...chord.variants,
        ...chord.songs.flatMap((item) => [item.title, item.artist]),
      ]
        .join(' ')
        .toLocaleLowerCase('ru')
      return haystack.includes(normalizedQuery)
    })
  }

  function renderList(): void {
    const pool = basePool()
    const ready = pool.filter((chord) => chord.profile).length
    const filtered = filteredChords()
    progressText.textContent =
      `${ready} из ${pool.length} ${plural(pool.length, 'аккорд', 'аккорда', 'аккордов')} с профилем. ` +
      `Показано: ${filtered.length}.`

    list.replaceChildren()
    if (filtered.length === 0) {
      list.append(
        el(
          'div',
          { class: 'calibration-empty' },
          pool.length === 0
            ? source === 'song'
              ? 'В песне нет аккордов.'
              : 'В библиотеке нет аккордов.'
            : 'Нет аккордов по текущему поиску и фильтру.',
        ),
      )
      updateControls()
      return
    }

    const active = activeSounding()
    for (const chord of filtered) {
      list.append(renderRow(chord, chord.sounding === active))
    }
    updateControls()
  }

  function renderRow(chord: LibraryChord, isActive: boolean): HTMLElement {
    const songTitle = chord.songs.map((item) => item.title).join(', ')
    const recordButton = button(
      chord.profile ? 'Перезаписать' : 'Записать',
      () => startSingle(chord),
      chord.profile ? 'ghost' : 'primary',
    )
    recordButton.classList.add('calibration-record')
    return el(
      'div',
      {
        class: `calibration-row${isActive ? ' is-selected' : ''}${chord.profile ? ' is-ready' : ''}`,
      },
      el(
        'div',
        { class: 'calibration-chord-info' },
        el('span', { class: 'calibration-chord' }, chord.sounding),
        chord.displayed !== chord.sounding
          ? el('span', { class: 'calibration-sounding' }, `в тексте ${chord.displayed}`)
          : null,
        el(
          'span',
          { class: 'calibration-songs' },
          `${chord.songs.length} ${plural(chord.songs.length, 'песня', 'песни', 'песен')}: ${songTitle}`,
        ),
      ),
      el(
        'span',
        { class: `calibration-profile${chord.profile ? ' is-ready' : ''}` },
        chord.profile ? 'есть профиль' : 'не записан',
      ),
      recordButton,
    )
  }

  function activeSounding(): string | null {
    return capture?.chord.sounding ?? waiting?.chord.sounding ?? null
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
      levelText.textContent = 'Микрофон включён.'
    } catch (error) {
      const message =
        error instanceof MicrophoneError ? error.message : 'Не удалось включить микрофон'
      toast(message)
      levelText.textContent = 'Микрофон выключен.'
    } finally {
      micStarting = false
      micButton.disabled = false
      updateControls()
    }
  }

  function stopMic(): void {
    micOn = false
    stopBulk()
    capture = null
    waiting = null
    noiseTask = null
    micSession?.stop()
    micSession = null
    micButton.classList.remove('is-active')
    micButton.replaceChildren(icon('mic', 20))
    micButton.setAttribute('aria-pressed', 'false')
    micButton.setAttribute('aria-label', 'Включить микрофон')
    levelFill.style.width = '0%'
    levelText.textContent = 'Микрофон выключен.'
    updateControls()
  }

  function processFrame(frame: MicrophoneFrame): void {
    if (!micOn) return
    const ratio = frame.threshold > 0 ? frame.rawEnergy / (frame.threshold * 4) : 0
    levelFill.style.width = `${Math.max(0, Math.min(100, ratio * 100))}%`
    levelFill.classList.toggle('is-active', frame.rawEnergy >= frame.threshold)
    levelText.textContent =
      frame.rawEnergy >= frame.threshold ? 'Сигнал есть.' : 'Тихо — играйте ближе к микрофону.'

    if (noiseTask) {
      noiseTask.raw.push(frame.rawEnergy)
      const elapsed = frame.timestamp - noiseTask.startedAt
      if (elapsed < NOISE_DURATION) {
        const remaining = Math.max(0, Math.ceil((NOISE_DURATION - elapsed) / 1000))
        status.textContent = `Тишина… осталось ${remaining} с`
        return
      }
      void finishNoise(noiseTask)
      noiseTask = null
      return
    }

    if (capture) {
      collectCapture(frame)
      return
    }

    if (waiting) {
      handleSilence(frame)
    }
  }

  function collectCapture(frame: MicrophoneFrame): void {
    if (!capture) return
    const task = capture
    const elapsed = frame.timestamp - task.startedAt

    if (frame.rawEnergy >= micCalibration.threshold * 0.7) {
      if (task.captureStartedAt === null) task.captureStartedAt = frame.timestamp
      if (frame.timestamp - task.captureStartedAt <= CAPTURE_WINDOW) {
        task.chromas.push(new Float32Array(frame.chroma))
      }
    }

    if (elapsed < CAPTURE_DURATION) {
      const remaining = Math.max(0, Math.ceil((CAPTURE_DURATION - elapsed) / 1000))
      status.textContent = `Слушаю ${task.chord.sounding}… осталось ${remaining} с`
      return
    }

    finishCapture(task, frame.timestamp)
  }

  function finishCapture(task: CaptureTask, now: number): void {
    capture = null
    const profile = buildChordProfile(task.chromas)

    if (!profile) {
      status.textContent = `Недостаточно звука для ${task.chord.sounding}.`
      if (task.bulk) {
        beginWait('retry', task.chord, now)
      } else {
        toast('Недостаточно звука для профиля')
        updateControls()
        renderList()
      }
      return
    }

    applyProfile(task.chord, profile)

    if (task.bulk) {
      beginWait('advance', task.chord, now)
    } else {
      status.textContent = `Профиль ${task.chord.sounding} сохранён.`
      toast(`Профиль ${task.chord.sounding} сохранён`)
      renderList()
      updateControls()
    }
  }

  function applyProfile(chord: LibraryChord, profile: number[]): void {
    chord.profile = profile
    micCalibration = {
      ...micCalibration,
      profiles: { ...micCalibration.profiles, [chord.sounding]: profile },
      lastCalibratedAt: Date.now(),
    }
    void persistMic()
  }

  function beginWait(action: WaitAction, chord: LibraryChord, now: number): void {
    waiting = {
      action,
      chord,
      successAt: now,
      silenceSince: null,
    }
    status.textContent =
      action === 'advance'
        ? `Профиль ${chord.sounding} сохранён. Ждём тишины…`
        : `Не услышал ${chord.sounding}. Ждём тишины, затем повторим.`
    bulkStatus.textContent =
      action === 'advance'
        ? `Записан ${chord.sounding}. После тишины — следующий аккорд.`
        : `Не удалось записать ${chord.sounding}. После тишины попробуем снова.`
    renderList()
    updateControls()
  }

  function handleSilence(frame: MicrophoneFrame): void {
    if (!waiting) return
    if (frame.rawEnergy >= micCalibration.threshold * 0.7) {
      waiting.silenceSince = null
      return
    }
    if (waiting.silenceSince === null) {
      waiting.silenceSince = frame.timestamp
      return
    }
    if (
      frame.timestamp - waiting.silenceSince < SILENCE_HOLD ||
      frame.timestamp - waiting.successAt < SILENCE_MIN_GAP
    ) {
      return
    }

    const action = waiting.action
    waiting = null
    if (action === 'advance') advanceBulk()
    else armBulk()
  }

  function startSingle(chord: LibraryChord): void {
    if (!micOn) {
      toast('Сначала включите микрофон')
      return
    }
    if (bulk || capture || waiting || noiseTask) return
    capture = {
      chord,
      bulk: false,
      startedAt: performance.now(),
      captureStartedAt: null,
      chromas: [],
    }
    status.textContent = `Сыграйте ${chord.sounding} 2–3 раза вниз-вверх и дайте прозвучать…`
    renderList()
    updateControls()
  }

  function startBulk(): void {
    if (!micOn) {
      toast('Сначала включите микрофон')
      return
    }
    if (bulk || capture || waiting || noiseTask) return

    const candidates = filteredChords().filter(
      (chord) => bulkMode === 'all' || !chord.profile,
    )
    if (candidates.length === 0) {
      toast(
        bulkMode === 'missing'
          ? 'Нет аккордов без профиля в текущей выборке'
          : 'Нет аккордов в текущей выборке',
      )
      return
    }

    bulk = { mode: bulkMode, queue: candidates, index: 0 }
    bulkSkipButton.hidden = false
    updateControls()
    armBulk()
  }

  function armBulk(): void {
    if (!bulk) return
    const chord = bulk.queue[bulk.index]
    if (!chord) {
      finishBulk()
      return
    }
    if (bulk.mode === 'missing' && chord.profile) {
      bulk.index += 1
      armBulk()
      return
    }

    capture = {
      chord,
      bulk: true,
      startedAt: performance.now(),
      captureStartedAt: null,
      chromas: [],
    }
    status.textContent = `Сыграйте ${chord.sounding} 2–3 раза вниз-вверх и дайте прозвучать…`
    bulkStatus.textContent = `Запись ${bulk.index + 1} из ${bulk.queue.length}: ${chord.sounding}.`
    renderList()
    updateControls()
  }

  function advanceBulk(): void {
    if (!bulk) return
    bulk.index += 1
    armBulk()
  }

  function skipBulk(): void {
    if (!bulk) return
    capture = null
    waiting = null
    advanceBulk()
  }

  function finishBulk(): void {
    status.textContent = 'Массовая запись завершена.'
    bulkStatus.textContent = 'Все выбранные аккорды обработаны.'
    bulk = null
    capture = null
    waiting = null
    bulkSkipButton.hidden = true
    renderList()
    updateControls()
    toast('Массовая запись завершена')
  }

  function stopBulk(): void {
    if (!bulk && !capture?.bulk && !waiting) {
      bulkSkipButton.hidden = true
      return
    }
    bulk = null
    capture = null
    waiting = null
    bulkSkipButton.hidden = true
    bulkStatus.textContent =
      'Выберите режим и запустите запись. После удачного аккорда система сама перейдёт к следующему после тишины.'
    status.textContent = 'Запись остановлена.'
    renderList()
    updateControls()
  }

  function startNoise(): void {
    if (!micOn) {
      toast('Сначала включите микрофон')
      return
    }
    if (bulk || capture || waiting || noiseTask) return
    noiseTask = { startedAt: performance.now(), raw: [] }
    status.textContent = 'Не играйте 2 секунды…'
    updateControls()
  }

  async function finishNoise(task: { startedAt: number; raw: number[] }): Promise<void> {
    const result = computeNoiseCalibration(task.raw)
    micCalibration = {
      ...micCalibration,
      noiseFloor: result.noiseFloor,
      threshold: result.threshold,
      lastCalibratedAt: Date.now(),
    }
    micOptions.noiseFloor = result.noiseFloor
    micOptions.threshold = result.threshold
    await persistMic()
    status.textContent = `Фон: ${result.noiseFloor.toFixed(4)}, порог: ${result.threshold.toFixed(4)}.`
    toast('Порог микрофона обновлён')
    updateControls()
  }

  async function resetProfiles(): Promise<void> {
    if (bulk || capture || waiting) {
      toast('Сначала остановите запись')
      return
    }
    const confirmed = await confirmDialog({
      title: 'Сбросить все профили?',
      message: 'Сохранённые профили аккордов будут удалены. Звук не записывается, только профили.',
      confirmLabel: 'Сбросить',
      danger: true,
    })
    if (!confirmed) return

    micCalibration = {
      ...micCalibration,
      profiles: {},
      lastCalibratedAt: null,
    }
    for (const chord of inventory) chord.profile = undefined
    await persistMic()
    status.textContent = 'Все профили сброшены.'
    toast('Профили сброшены')
    renderList()
    updateControls()
  }

  function persistMic(): Promise<void> {
    const snapshot: MicCalibration = {
      ...micCalibration,
      profiles: { ...micCalibration.profiles },
    }
    persistChain = persistChain
      .catch(() => undefined)
      .then(() => saveSettings({ mic: snapshot }))
      .then(() => undefined)
      .catch(() => {
        toast('Не удалось сохранить калибровку')
      })
    return persistChain
  }

  function updateControls(): void {
    const recording = bulk !== null || capture !== null || waiting !== null || noiseTask !== null
    noiseButton.disabled = !micOn || recording
    resetButton.disabled = recording
    bulkStartButton.disabled = bulk === null ? !micOn || recording : false
    bulkStartButton.replaceChildren(
      icon(bulk ? 'pause' : 'play', 18),
      bulk ? 'Остановить массовую запись' : 'Начать массовую запись',
    )
    bulkStartButton.classList.toggle('is-stop', bulk !== null)
    bulkSkipButton.hidden = bulk === null
    bulkSkipButton.disabled = bulk === null
    bulkMissingButton.disabled = bulk !== null
    bulkAllButton.disabled = bulk !== null
    searchInput.disabled = bulk !== null
    clearSearch.disabled = bulk !== null
    if (sourceRow) {
      for (const buttonElement of sourceButtons.values()) {
        buttonElement.disabled = bulk !== null
      }
    }
    for (const buttonElement of filterButtons.values()) {
      buttonElement.disabled = bulk !== null
    }
    for (const recordButton of list.querySelectorAll<HTMLButtonElement>(
      '.calibration-record',
    )) {
      recordButton.disabled = !micOn || recording
    }
  }

  syncSourceButtons()
  syncFilterButtons()
  syncBulkButtons()
}
