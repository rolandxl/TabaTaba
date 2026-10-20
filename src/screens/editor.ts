import { renderSong } from '../chords/render'
import { addSong, db, deleteSong, loadSettings, updateSong } from '../db'
import { getSourceRoute, goBack, navigate, replace, songPath } from '../router'
import { inferTitle } from '../song-utils'
import { MAX_FONT_SIZE, MIN_FONT_SIZE } from '../types'
import {
  button,
  confirmDialog,
  el,
  icon,
  iconButton,
  toast,
} from '../ui'

const KEY_SUGGESTIONS = [
  'C',
  'G',
  'D',
  'A',
  'E',
  'F',
  'Bb',
  'Eb',
  'Am',
  'Em',
  'Bm',
  'Dm',
  'F#m',
  'C#m',
  'Gm',
  'Cm',
]

export async function renderEditor(root: HTMLElement, id?: string): Promise<(() => void) | void> {
  const existing = id ? await db.songs.get(id) : undefined
  if (id && !existing) {
    toast('Песня не найдена')
    navigate('/')
    return
  }

  const settings = await loadSettings()
  document.title = existing ? `Редактирование — ${existing.title}` : 'Новая песня'

  let dirty = false
  const screen = el('div', { class: 'screen editor-screen' })

  const backButton = iconButton('back', 'Назад', () => void leave())
  const saveButton = el(
    'button',
    {
      class: 'topbar-text-button topbar-save',
      type: 'button',
      onClick: (event: Event) => {
        event.preventDefault()
        void save()
      },
    },
    icon('check', 18),
    el('span', {}, 'Сохранить'),
  )

  const titleInput = el('input', {
    class: 'input',
    type: 'text',
    placeholder: 'Например, «Пой со мной»',
    autocomplete: 'off',
    autofocus: true,
    value: existing?.title ?? '',
  })
  const artistInput = el('input', {
    class: 'input',
    type: 'text',
    placeholder: 'Исполнитель или автор',
    autocomplete: 'off',
    value: existing?.artist ?? '',
  })
  const keyInput = el('input', {
    class: 'input',
    type: 'text',
    placeholder: 'Am',
    autocomplete: 'off',
    list: 'key-suggestions',
    maxlength: '8',
    value: existing?.key ?? '',
  })
  const capoSelect = el(
    'select',
    { class: 'input select' },
    ...Array.from({ length: 13 }, (_, index) =>
      el(
        'option',
        { value: String(index), selected: (existing?.capo ?? 0) === index },
        index === 0 ? 'Без капо' : `${index} лад`,
      ),
    ),
  )
  const tagsInput = el('input', {
    class: 'input',
    type: 'text',
    placeholder: 'рок, акустика, любимое',
    autocomplete: 'off',
    value: existing?.tags.join(', ') ?? '',
  })
  const contentInput = el('textarea', {
    class: 'input textarea song-input editor-textarea',
    placeholder: 'Am        C\nТекст песни\nG         D\nЕщё одна строка',
    spellcheck: 'false',
    autocapitalize: 'off',
    autocorrect: 'off',
    wrap: 'off',
  })
  contentInput.value = existing?.content ?? ''

  const datalist = el(
    'datalist',
    { id: 'key-suggestions' },
    ...KEY_SUGGESTIONS.map((key) => el('option', { value: key })),
  )

  const textTab = el(
    'button',
    {
      class: 'tab-button is-active',
      type: 'button',
      role: 'tab',
      'aria-selected': 'true',
      onClick: () => showTab('text'),
    },
    'Текст',
  )
  const previewTab = el(
    'button',
    {
      class: 'tab-button',
      type: 'button',
      role: 'tab',
      'aria-selected': 'false',
      onClick: () => showTab('preview'),
    },
    'Просмотр',
  )

  const canPaste = typeof navigator.clipboard?.readText === 'function'
  const pasteButton = canPaste
    ? el(
        'button',
        {
          class: 'btn btn-ghost paste-button',
          type: 'button',
          onClick: () => void pasteFromClipboard(),
        },
        'Вставить',
      )
    : null

  const editorPanel = el(
    'div',
    { class: 'editor-panel' },
    el(
      'div',
      { class: 'editor-panel-head' },
      el('span', { class: 'field-label' }, 'Текст с аккордами'),
      pasteButton,
    ),
    contentInput,
    el(
      'p',
      { class: 'field-hint' },
      'Аккорды пишите отдельной строкой над словами. Пробелы важны для выравнивания.',
    ),
  )
  const previewPanel = el(
    'div',
    { class: 'editor-panel preview-panel', hidden: true },
    el('div', { class: 'song-content preview-content' }),
  )
  previewPanel.style.setProperty(
    '--song-font-size',
    `${Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, existing?.fontSize ?? settings.fontSize))}px`,
  )

  const form = el(
    'div',
    { class: 'form editor-form' },
    el(
      'label',
      { class: 'field' },
      el('span', { class: 'field-label' }, 'Название'),
      titleInput,
    ),
    el(
      'label',
      { class: 'field' },
      el('span', { class: 'field-label' }, 'Исполнитель'),
      artistInput,
    ),
    el(
      'div',
      { class: 'field-row' },
      el(
        'label',
        { class: 'field' },
        el('span', { class: 'field-label' }, 'Тональность'),
        keyInput,
      ),
      el(
        'label',
        { class: 'field field-narrow' },
        el('span', { class: 'field-label' }, 'Капо'),
        capoSelect,
      ),
    ),
    el(
      'label',
      { class: 'field' },
      el('span', { class: 'field-label' }, 'Теги'),
      tagsInput,
    ),
    el('div', { class: 'tabs', role: 'tablist' }, textTab, previewTab),
    editorPanel,
    previewPanel,
    datalist,
    existing
      ? el(
          'div',
          { class: 'danger-zone' },
          button('Удалить песню', () => void remove(), 'danger', 'trash'),
        )
      : null,
  )

  screen.append(
    el(
      'header',
      { class: 'topbar' },
      backButton,
      el('div', { class: 'topbar-title' }, existing ? 'Редактирование' : 'Новая песня'),
      saveButton,
    ),
    form,
  )
  root.append(screen)

  const markDirty = (): void => {
    dirty = true
  }
  for (const control of [titleInput, artistInput, keyInput, capoSelect, tagsInput]) {
    control.addEventListener('input', markDirty)
    control.addEventListener('change', markDirty)
  }
  contentInput.addEventListener('input', () => {
    markDirty()
    if (!previewPanel.hidden) renderPreview()
  })

  function showTab(tab: 'text' | 'preview'): void {
    const isPreview = tab === 'preview'
    textTab.classList.toggle('is-active', !isPreview)
    textTab.setAttribute('aria-selected', String(!isPreview))
    previewTab.classList.toggle('is-active', isPreview)
    previewTab.setAttribute('aria-selected', String(isPreview))
    editorPanel.hidden = isPreview
    previewPanel.hidden = !isPreview
    if (isPreview) renderPreview()
  }

  function renderPreview(): void {
    const container = previewPanel.querySelector<HTMLElement>('.preview-content')
    if (!container) return
    const content = contentInput.value
    if (!content.trim()) {
      container.replaceChildren(
        el('p', { class: 'muted preview-empty' }, 'Здесь появится текст с аккордами.'),
      )
      return
    }
    container.replaceChildren(renderSong(content))
  }

  async function pasteFromClipboard(): Promise<void> {
    try {
      const text = await navigator.clipboard.readText()
      if (!text) {
        toast('Буфер обмена пуст')
        return
      }
      const start = contentInput.selectionStart ?? contentInput.value.length
      const end = contentInput.selectionEnd ?? start
      contentInput.value =
        contentInput.value.slice(0, start) + text + contentInput.value.slice(end)
      const cursor = start + text.length
      contentInput.dispatchEvent(new Event('input', { bubbles: true }))
      contentInput.focus()
      contentInput.setSelectionRange(cursor, cursor)
    } catch {
      toast('Не удалось прочитать буфер обмена')
    }
  }

  async function save(): Promise<void> {
    const title = titleInput.value.trim() || inferTitle(contentInput.value)
    if (!title || title === 'Без названия') {
      toast('Введите название песни')
      titleInput.focus()
      return
    }

    const payload = {
      title,
      artist: artistInput.value.trim(),
      key: keyInput.value.trim(),
      capo: Number(capoSelect.value) || 0,
      tags: tagsInput.value
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
      content: contentInput.value,
    }

    if (existing) {
      await updateSong(existing.id, payload)
      dirty = false
      toast('Изменения сохранены')
      const source = getSourceRoute()
      const cameFromSong = source?.name === 'song' && source.id === existing.id
      if (cameFromSong) {
        goBack(songPath(existing.id))
      } else {
        replace(songPath(existing.id))
      }
    } else {
      const song = await addSong(payload)
      dirty = false
      toast('Песня добавлена')
      replace(songPath(song.id))
    }
  }

  async function remove(): Promise<void> {
    if (!existing) return
    const confirmed = await confirmDialog({
      title: 'Удалить песню?',
      message: `«${existing.title}» будет удалена без возможности отмены.`,
      confirmLabel: 'Удалить',
      danger: true,
    })
    if (!confirmed) return
    await deleteSong(existing.id)
    dirty = false
    toast('Песня удалена')
    navigate('/')
  }

  async function leave(): Promise<void> {
    if (dirty) {
      const confirmed = await confirmDialog({
        title: 'Выйти без сохранения?',
        message: 'Введённые изменения не сохранятся.',
        confirmLabel: 'Выйти',
        danger: true,
      })
      if (!confirmed) return
      dirty = false
    }
    goBack(existing ? songPath(existing.id) : '/')
  }

  const onBeforeUnload = (event: BeforeUnloadEvent): void => {
    if (!dirty) return
    event.preventDefault()
    event.returnValue = ''
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault()
      void save()
    }
  }

  window.addEventListener('beforeunload', onBeforeUnload)
  window.addEventListener('keydown', onKeyDown)

  return () => {
    window.removeEventListener('beforeunload', onBeforeUnload)
    window.removeEventListener('keydown', onKeyDown)
  }
}
