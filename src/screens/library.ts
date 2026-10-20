import { db, loadSettings, toggleFavorite } from '../db'
import { createFullscreenControl } from '../fullscreen-button'
import { navigate, performPath, songPath } from '../router'
import { pickRandom } from '../random'
import type { Song } from '../types'
import {
  button,
  el,
  formatDate,
  icon,
  iconButton,
  openDialog,
  plural,
  toast,
} from '../ui'

let query = ''
let favoritesOnly = false
const DAY = 24 * 60 * 60 * 1000

export async function renderLibrary(root: HTMLElement): Promise<() => void> {
  document.title = 'TabaTaba — песни с аккордами'
  const [initialSongs, settings] = await Promise.all([db.songs.toArray(), loadSettings()])
  let songs = initialSongs

  const screen = el('div', { class: 'screen library-screen' })
  const list = el('div', { class: 'song-list' })
  const summary = el('div', { class: 'list-summary' })
  let randomButton: HTMLButtonElement | null = null

  const settingsButton = iconButton('settings', 'Настройки', () => navigate('/settings'))
  const fullscreenControl = createFullscreenControl()

  screen.append(
    el(
      'header',
      { class: 'topbar library-topbar' },
      el(
        'div',
        { class: 'brand' },
        el('div', { class: 'brand-mark' }, icon('music', 22)),
        el(
          'div',
          { class: 'brand-text' },
          el('h1', {}, 'TabaTaba'),
          el('p', {}, 'Песни с аккордами'),
        ),
      ),
      el('div', { class: 'topbar-actions' }, fullscreenControl.button, settingsButton),
    ),
  )

  if (songs.length > 0) {
    const searchInput = el('input', {
      class: 'search-input',
      type: 'search',
      placeholder: 'Поиск песен',
      'aria-label': 'Поиск песен',
      autocomplete: 'off',
      value: query,
      onInput: (event: Event) => {
        query = (event.target as HTMLInputElement).value
        clearButton.hidden = query.length === 0
        renderList()
      },
    })

    const clearButton = iconButton('close', 'Очистить поиск', () => {
      searchInput.value = ''
      query = ''
      clearButton.hidden = true
      renderList()
      searchInput.focus()
    })
    clearButton.classList.add('search-clear')
    clearButton.hidden = query.length === 0

    const favoriteFilter = el(
      'button',
      {
        class: `filter-button${favoritesOnly ? ' is-active' : ''}`,
        type: 'button',
        'aria-pressed': String(favoritesOnly),
        onClick: () => {
          favoritesOnly = !favoritesOnly
          favoriteFilter.classList.toggle('is-active', favoritesOnly)
          favoriteFilter.setAttribute('aria-pressed', String(favoritesOnly))
          renderList()
        },
      },
      icon('star', 18),
      el('span', {}, 'Избранное'),
    )

    randomButton = el(
      'button',
      {
        class: 'filter-button random-button',
        type: 'button',
        title: 'Случайный сет',
        'aria-label': 'Случайный сет',
        onClick: () => void openRandomDialog(),
      },
      icon('shuffle', 18),
      el('span', {}, 'Случайно'),
    )

    screen.append(
      el(
        'div',
        { class: 'library-tools' },
        el(
          'div',
          { class: 'search-box' },
          el('span', { class: 'search-icon' }, icon('search', 18)),
          searchInput,
          clearButton,
        ),
        favoriteFilter,
        randomButton,
      ),
    )

    const needsBackup =
      songs.length > 0 &&
      (settings.lastBackupAt === null || Date.now() - settings.lastBackupAt > 14 * DAY)
    if (needsBackup) {
      screen.append(
        el(
          'div',
          { class: 'notice' },
          el(
            'div',
            { class: 'notice-text' },
            el('strong', {}, 'Сделайте бэкап'),
            el('span', {}, 'Песни хранятся только в этом браузере. Сохраните копию.'),
          ),
          button('В настройки', () => navigate('/settings'), 'ghost'),
        ),
      )
    }

    screen.append(summary, list)
  } else {
    screen.append(
      el(
        'div',
        { class: 'empty-state' },
        el('div', { class: 'empty-art' }, icon('music', 38)),
        el('h2', {}, 'Пока нет песен'),
        el(
          'p',
          {},
          'Добавьте песню вручную или вставьте готовый текст с аккордами. Всё хранится на телефоне.',
        ),
        el(
          'div',
          { class: 'empty-actions' },
          button('Добавить песню', () => navigate('/new'), 'primary', 'plus'),
        ),
      ),
    )
  }

  const fab = el(
    'button',
    {
      class: 'fab',
      type: 'button',
      'aria-label': 'Добавить песню',
      title: 'Добавить песню',
      onClick: () => navigate('/new'),
    },
    icon('plus', 26),
  )
  if (songs.length > 0) {
    screen.append(fab)
  }
  root.append(screen)

  function filteredSongs(): Song[] {
    const normalizedQuery = query.trim().toLocaleLowerCase('ru')
    return songs
      .filter((song) => !favoritesOnly || song.favorite)
      .filter((song) => {
        if (!normalizedQuery) return true
        const haystack = [song.title, song.artist, song.tags.join(' ')]
          .join(' ')
          .toLocaleLowerCase('ru')
        return haystack.includes(normalizedQuery)
      })
      .sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.updatedAt - a.updatedAt)
  }

  function renderList(): void {
    const filtered = filteredSongs()

    if (randomButton) {
      randomButton.disabled = filtered.length === 0
      randomButton.title =
        filtered.length === 0 ? 'Нет песен по текущему фильтру' : 'Случайный сет'
    }

    summary.replaceChildren(
      el(
        'span',
        {},
        `${filtered.length} ${plural(filtered.length, 'песня', 'песни', 'песен')}`,
      ),
    )
    if (query) {
      summary.append(
        el('span', { class: 'list-summary-query' }, `по запросу «${query.trim()}»`),
      )
    }

    list.replaceChildren()
    if (filtered.length === 0) {
      list.append(
        el(
          'div',
          { class: 'empty-state compact' },
          el('h2', {}, favoritesOnly ? 'В избранном пусто' : 'Ничего не найдено'),
          el(
            'p',
            {},
            favoritesOnly
              ? 'Отметьте песню звездой, чтобы она появилась здесь.'
              : 'Попробуйте другой запрос или очистите поиск.',
          ),
          query
            ? button(
                'Очистить поиск',
                () => {
                  query = ''
                  const input = screen.querySelector<HTMLInputElement>('.search-input')
                  if (input) {
                    input.value = ''
                    input.focus()
                  }
                  const clear = screen.querySelector<HTMLButtonElement>('.search-clear')
                  if (clear) clear.hidden = true
                  renderList()
                },
                'ghost',
              )
            : null,
        ),
      )
      return
    }

    for (const song of filtered) {
      list.append(renderSongItem(song, () => void reloadAfterChange()))
    }
  }

  async function reloadAfterChange(): Promise<void> {
    songs = await db.songs.toArray()
    renderList()
  }

  async function openRandomDialog(): Promise<void> {
    const pool = filteredSongs()
    if (pool.length === 0) {
      toast('Нет песен по текущему фильтру')
      return
    }

    let count = Math.min(5, pool.length)
    const countValue = el('span', { class: 'stepper-value random-count-value' })
    const minusButton = el(
      'button',
      {
        class: 'toolbar-button',
        type: 'button',
        'aria-label': 'Меньше песен',
        onClick: () => changeCount(-1),
      },
      icon('minus', 17),
    )
    const plusButton = el(
      'button',
      {
        class: 'toolbar-button',
        type: 'button',
        'aria-label': 'Больше песен',
        onClick: () => changeCount(1),
      },
      icon('plus', 17),
    )
    const allButton = el(
      'button',
      {
        class: 'btn btn-ghost random-all-button',
        type: 'button',
        onClick: () => {
          count = pool.length
          updateCount()
        },
      },
      'Все',
    )

    const sourceLabel = (query.trim() || favoritesOnly)
      ? `Доступно ${pool.length} ${plural(pool.length, 'песня', 'песни', 'песен')} по текущему фильтру.`
      : `Доступно ${pool.length} ${plural(pool.length, 'песня', 'песни', 'песен')}.`

    const body = el(
      'div',
      { class: 'random-form' },
      el('p', { class: 'setting-note' }, sourceLabel),
      el(
        'div',
        { class: 'random-count-row' },
        el('span', { class: 'field-label' }, 'Сколько песен'),
        el(
          'div',
          { class: 'random-count-controls' },
          el('div', { class: 'stepper' }, minusButton, countValue, plusButton),
          allButton,
        ),
      ),
    )

    function changeCount(delta: number): void {
      count = Math.max(1, Math.min(pool.length, count + delta))
      updateCount()
    }

    function updateCount(): void {
      countValue.textContent = `${count} из ${pool.length}`
      minusButton.disabled = count <= 1
      plusButton.disabled = count >= pool.length
      allButton.disabled = count >= pool.length
    }

    updateCount()

    const result = await openDialog({
      title: 'Случайный сет',
      description: 'Песни будут идти в случайном порядке, без повторов.',
      body,
      actions: [
        { label: 'Отмена', value: 'cancel' },
        { label: 'Собрать', value: 'start', kind: 'primary' },
      ],
    })
    if (result !== 'start') return

    const ids = pickRandom(pool, count).map((song) => song.id)
    if (ids.length === 0) return
    navigate(performPath(ids[0]), {
      queue: { songIds: ids, index: 0, label: 'Случайный сет' },
    })
  }

  renderList()
  return fullscreenControl.cleanup
}

function renderSongItem(song: Song, onChange: () => void): HTMLElement {
  const meta = el('div', { class: 'song-item-meta' })
  if (song.key) meta.append(el('span', { class: 'key-badge' }, song.key))
  if (song.tags.length > 0) {
    meta.append(el('span', {}, song.tags.slice(0, 2).join(' · ')))
  }
  meta.append(el('span', { class: 'song-date' }, formatDate(song.updatedAt)))

  const star = iconButton(
    'star',
    song.favorite ? 'Убрать из избранного' : 'В избранное',
    (event) => {
      event.preventDefault()
      event.stopPropagation()
      void toggleFavorite(song.id).then((updated) => {
        if (!updated) return
        onChange()
      })
    },
    `star-button${song.favorite ? ' is-active' : ''}`,
  )
  star.setAttribute('aria-pressed', String(song.favorite))

  return el(
    'div',
    { class: `song-item${song.favorite ? ' is-favorite' : ''}` },
    el(
      'a',
      {
        class: 'song-main',
        href: `#${songPath(song.id)}`,
        onClick: (event) => {
          const mouse = event as MouseEvent
          if (
            mouse.button !== 0 ||
            mouse.metaKey ||
            mouse.ctrlKey ||
            mouse.shiftKey ||
            mouse.altKey
          ) {
            return
          }
          mouse.preventDefault()
          navigate(songPath(song.id))
        },
      },
      el('div', { class: 'song-item-title' }, song.title),
      el('div', { class: 'song-item-sub' }, song.artist || 'Без исполнителя'),
      meta,
    ),
    star,
  )
}


