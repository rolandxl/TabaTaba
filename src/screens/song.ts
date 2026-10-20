import { missingChordProfiles } from '../chords/inventory'
import { renderSong } from '../chords/render'
import { inferAccidentalPreference } from '../chords/transpose'
import { db, loadSettings, toggleFavorite, updateSongPreferences } from '../db'
import {
  calibrationPath,
  editPath,
  goBack,
  navigate,
  performPath,
  practicePath,
} from '../router'
import { keyLabel, transposeLabel } from '../song-utils'
import {
  DEFAULT_FOLLOW_SENSITIVITY,
  FOLLOW_SENSITIVITIES,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
  type FollowSensitivity,
} from '../types'
import {
  button,
  el,
  icon,
  iconButton,
  plural,
  toast,
} from '../ui'

const FOLLOW_LABELS: Record<FollowSensitivity, string> = {
  careful: 'Осторожно',
  balanced: 'Баланс',
  responsive: 'Отзывчиво',
}

export async function renderSongScreen(root: HTMLElement, id: string): Promise<void> {
  const found = await db.songs.get(id)
  if (!found) {
    toast('Песня не найдена')
    navigate('/')
    return
  }
  const song = found

  const settings = await loadSettings()
  const preference = inferAccidentalPreference(song.key, song.content)
  let transpose = song.transpose
  let fontSize = Math.max(
    MIN_FONT_SIZE,
    Math.min(MAX_FONT_SIZE, song.fontSize ?? settings.fontSize),
  )
  let followSensitivity = song.followSensitivity ?? DEFAULT_FOLLOW_SENSITIVITY

  document.title = `${song.title} — TabaTaba`

  const content = el('div', { class: 'song-content' })
  content.style.setProperty('--song-font-size', `${fontSize}px`)

  const keyChip = el('span', { class: 'meta-chip meta-key' })
  const transposeValue = el('span', { class: 'transpose-value' }, transposeLabel(transpose))

  const resetButton = el(
    'button',
    {
      class: 'toolbar-button reset-button',
      type: 'button',
      title: 'Сбросить транспонирование',
      'aria-label': 'Сбросить транспонирование',
      onClick: () => void changeTranspose(-transpose),
    },
    icon('refresh', 17),
  )
  resetButton.hidden = transpose === 0

  const favoriteButton = iconButton(
    'star',
    song.favorite ? 'Убрать из избранного' : 'В избранное',
    () => void toggleFavorite(song.id).then((updated) => {
      if (!updated) return
      song.favorite = updated.favorite
      favoriteButton.classList.toggle('is-active', updated.favorite)
      favoriteButton.setAttribute('aria-pressed', String(updated.favorite))
      favoriteButton.setAttribute(
        'aria-label',
        updated.favorite ? 'Убрать из избранного' : 'В избранное',
      )
    }),
    `star-button${song.favorite ? ' is-active' : ''}`,
  )
  favoriteButton.setAttribute('aria-pressed', String(song.favorite))

  const editButton = iconButton('edit', 'Редактировать', () => navigate(editPath(song.id)))
  let chordsHidden = false
  const chordsButton = iconButton('eye', 'Скрыть аккорды', () => toggleChords(), 'chords-button')
  chordsButton.setAttribute('aria-pressed', 'false')

  const transposeGroup = el(
    'div',
    { class: 'toolbar-group' },
    el('span', { class: 'toolbar-label' }, 'Аккорды'),
    el(
      'div',
      { class: 'stepper' },
      el(
        'button',
        {
          class: 'toolbar-button',
          type: 'button',
          'aria-label': 'Транспонировать на полтона вниз',
          onClick: () => void changeTranspose(-1),
        },
        icon('minus', 17),
      ),
      transposeValue,
      el(
        'button',
        {
          class: 'toolbar-button',
          type: 'button',
          'aria-label': 'Транспонировать на полтона вверх',
          onClick: () => void changeTranspose(1),
        },
        icon('plus', 17),
      ),
      resetButton,
    ),
  )

  const fontGroup = el(
    'div',
    { class: 'toolbar-group' },
    el('span', { class: 'toolbar-label' }, 'Шрифт'),
    el(
      'div',
      { class: 'stepper' },
      el(
        'button',
        {
          class: 'toolbar-button font-button',
          type: 'button',
          'aria-label': 'Уменьшить шрифт',
          onClick: () => void changeFont(fontSize - 1),
        },
        'A−',
      ),
      el(
        'button',
        {
          class: 'toolbar-button font-button font-button-large',
          type: 'button',
          'aria-label': 'Увеличить шрифт',
          onClick: () => void changeFont(fontSize + 1),
        },
        'A+',
      ),
    ),
  )

  const followButtons = new Map<FollowSensitivity, HTMLButtonElement>()
  const followSegmented = el('div', {
    class: 'segmented follow-segmented',
    role: 'group',
    'aria-label': 'Агрессивность следования',
  })
  for (const value of FOLLOW_SENSITIVITIES) {
    const followButton = el(
      'button',
      {
        class: 'segment-button',
        type: 'button',
        title: `Следование: ${FOLLOW_LABELS[value]}`,
        onClick: () => void changeFollowSensitivity(value),
      },
      FOLLOW_LABELS[value],
    )
    followButtons.set(value, followButton)
    followSegmented.append(followButton)
  }
  const followGroup = el(
    'div',
    { class: 'toolbar-group' },
    el('span', { class: 'toolbar-label' }, 'Следование'),
    followSegmented,
  )

  const calibrationNotice = el('div', { class: 'song-calibration-notice' })

  const head = el(
    'div',
    { class: 'song-head' },
    el('h1', { class: 'song-title' }, song.title),
    song.artist ? el('p', { class: 'song-artist' }, song.artist) : null,
    el(
      'div',
      { class: 'song-tags' },
      keyChip,
      song.capo > 0 ? el('span', { class: 'meta-chip' }, `Капо ${song.capo}`) : null,
      ...song.tags.map((tag) => el('span', { class: 'meta-chip meta-tag' }, tag)),
    ),
    el('div', { class: 'song-toolbar' }, transposeGroup, followGroup, fontGroup),
  )

  const playBar = el(
    'div',
    { class: 'play-bar' },
    el(
      'button',
      {
        class: 'play-button',
        type: 'button',
        onClick: () => navigate(performPath(song.id)),
      },
      icon('play', 22),
      el('span', {}, 'Играть'),
      el('span', { class: 'play-button-hint' }, 'автоскролл'),
    ),
    el(
      'button',
      {
        class: 'practice-open-button',
        type: 'button',
        onClick: () => navigate(practicePath(song.id)),
      },
      icon('mic', 18),
      el('span', {}, 'Тренировка'),
    ),
  )

  const screen = el(
    'div',
    { class: 'screen song-screen' },
    el(
      'header',
      { class: 'topbar' },
      iconButton('back', 'Назад', () => goBack('/')),
      el('div', { class: 'topbar-title' }, song.artist || 'Песня'),
      el('div', { class: 'topbar-actions' }, chordsButton, favoriteButton, editButton),
    ),
    head,
    calibrationNotice,
    el('div', { class: 'song-body' }, content),
    playBar,
  )

  root.append(screen)

  function updateMeta(): void {
    const label = keyLabel(song.key, transpose, preference)
    keyChip.textContent = label
    keyChip.hidden = !label
    transposeValue.textContent = transposeLabel(transpose)
    resetButton.hidden = transpose === 0
    renderCalibrationNotice()
  }

  function renderCalibrationNotice(): void {
    if (!settings.calibrationMode) {
      calibrationNotice.replaceChildren()
      return
    }
    const missing = missingChordProfiles(song, settings.mic.profiles)
    if (missing.length === 0) {
      calibrationNotice.replaceChildren()
      return
    }

    const names = missing.slice(0, 4).map((chord) => chord.sounding).join(', ')
    const rest = missing.length > 4 ? ` и ещё ${missing.length - 4}` : ''
    calibrationNotice.replaceChildren(
      el(
        'div',
        { class: 'notice' },
        el(
          'div',
          { class: 'notice-text' },
          el(
            'strong',
            {},
            `Не откалибровано ${missing.length} ${plural(
              missing.length,
              'аккорд',
              'аккорда',
              'аккордов',
            )}`,
          ),
          el('span', {}, `${names}${rest}`),
        ),
        button(
          'Докалибровать',
          () => navigate(calibrationPath(song.id)),
          'ghost',
        ),
      ),
    )
  }

  function renderContent(): void {
    if (!song.content.trim()) {
      content.replaceChildren(
        el(
          'div',
          { class: 'empty-state compact' },
          el('p', {}, 'В песне пока нет текста.'),
          el('button', { class: 'btn btn-ghost', type: 'button', onClick: () => navigate(editPath(song.id)) }, 'Добавить текст'),
        ),
      )
      return
    }
    content.replaceChildren(renderSong(song.content, { transpose, preference }))
  }

  async function changeTranspose(delta: number): Promise<void> {
    const next = Math.max(-11, Math.min(11, transpose + delta))
    if (next === transpose) return
    transpose = next
    song.transpose = next
    updateMeta()
    renderContent()
    await updateSongPreferences(song.id, { transpose: next })
  }

  async function changeFont(next: number): Promise<void> {
    const clamped = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, next))
    if (clamped === fontSize) return
    fontSize = clamped
    content.style.setProperty('--song-font-size', `${clamped}px`)
    await updateSongPreferences(song.id, { fontSize: clamped })
  }

  async function changeFollowSensitivity(next: FollowSensitivity): Promise<void> {
    if (next === followSensitivity) return
    followSensitivity = next
    song.followSensitivity = next
    syncFollowButtons()
    await updateSongPreferences(song.id, { followSensitivity: next })
  }

  function syncFollowButtons(): void {
    for (const [value, buttonElement] of followButtons) {
      buttonElement.classList.toggle('is-active', followSensitivity === value)
      buttonElement.setAttribute(
        'aria-pressed',
        String(followSensitivity === value),
      )
    }
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
  }

  syncFollowButtons()
  updateMeta()
  renderContent()
}
