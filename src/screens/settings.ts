import { downloadBackup, importBackup, readBackupFile, type ImportMode } from '../backup'
import type { BackupData } from '../backup-format'
import { loadSettings, saveSettings } from '../db'
import { canInstall, isStandalone, onInstallChange, promptInstall } from '../install'
import { calibrationPath, diagnosticsPath, goBack, navigate } from '../router'
import { applyTheme } from '../theme'
import {
  MAX_FONT_SIZE,
  MAX_SCROLL_SPEED,
  MIN_FONT_SIZE,
  MIN_SCROLL_SPEED,
  type Theme,
} from '../types'
import {
  button,
  el,
  formatDateTime,
  iconButton,
  openDialog,
  plural,
  toast,
} from '../ui'

interface StorageLike {
  persisted?: () => Promise<boolean>
  persist?: () => Promise<boolean>
  estimate?: () => Promise<{ usage?: number; quota?: number }>
}

export async function renderSettings(root: HTMLElement): Promise<() => void> {
  let settings = await loadSettings()
  document.title = 'Настройки — TabaTaba'

  const screen = el('div', { class: 'screen settings-screen' })
  const columns = el('div', { class: 'settings-columns' })

  const themeButtons = new Map<Theme, HTMLButtonElement>()
  const themeGroup = el('div', { class: 'segmented' })
  const themeOptions: Array<{ value: Theme; label: string }> = [
    { value: 'dark', label: 'Тёмная' },
    { value: 'light', label: 'Светлая' },
    { value: 'system', label: 'Системная' },
  ]
  for (const option of themeOptions) {
    const themeButton = el(
      'button',
      {
        class: 'segment-button',
        type: 'button',
        onClick: () => void selectTheme(option.value),
      },
      option.label,
    )
    themeButtons.set(option.value, themeButton)
    themeGroup.append(themeButton)
  }

  const fontSizeValue = el('span', { class: 'stepper-value' }, `${settings.fontSize} px`)
  const fontSizeStepper = el(
    'div',
    { class: 'stepper' },
    el(
      'button',
      {
        class: 'toolbar-button',
        type: 'button',
        'aria-label': 'Уменьшить шрифт',
        onClick: () => void changeFontSize(-1),
      },
      'A−',
    ),
    fontSizeValue,
    el(
      'button',
      {
        class: 'toolbar-button',
        type: 'button',
        'aria-label': 'Увеличить шрифт',
        onClick: () => void changeFontSize(1),
      },
      'A+',
    ),
  )

  const speedValue = el('span', { class: 'stepper-value' }, `${settings.scrollSpeed} px/с`)
  const speedStepper = el(
    'div',
    { class: 'stepper' },
    el(
      'button',
      {
        class: 'toolbar-button',
        type: 'button',
        'aria-label': 'Медленнее',
        onClick: () => void changeScrollSpeed(-5),
      },
      '−',
    ),
    speedValue,
    el(
      'button',
      {
        class: 'toolbar-button',
        type: 'button',
        'aria-label': 'Быстрее',
        onClick: () => void changeScrollSpeed(5),
      },
      '+',
    ),
  )

  const appearance = el(
    'section',
    { class: 'settings-section' },
    el('h2', { class: 'settings-heading' }, 'Оформление'),
    settingRow('Тема', 'Тёмная, светлая или как в системе.', themeGroup),
    settingRow(
      'Размер текста по умолчанию',
      'Для песен без индивидуальной настройки.',
      fontSizeStepper,
    ),
    settingRow(
      'Скорость автоскролла по умолчанию',
      'Для песен без индивидуальной настройки.',
      speedStepper,
    ),
    el(
      'p',
      { class: 'setting-note' },
      'Изменения шрифта, скорости и тональности внутри песни сохраняются только для неё.',
    ),
  )

  const calibrationToggle = el(
    'button',
    {
      class: 'switch',
      type: 'button',
      role: 'switch',
      'aria-checked': String(settings.calibrationMode),
      'aria-label': 'Режим калибровки',
      onClick: () => void toggleCalibrationMode(),
    },
    el('span', { class: 'switch-knob' }),
  )

  const calibrationSection = el(
    'section',
    { class: 'settings-section' },
    el('h2', { class: 'settings-heading' }, 'Микрофон и калибровка'),
    settingRow(
      'Режим калибровки',
      'Показывать в песнях, какие аккорды ещё не откалиброваны.',
      calibrationToggle,
    ),
    el(
      'p',
      { class: 'setting-note' },
      'Профили аккордов хранятся только на устройстве. Диагностика и калибровка работают отдельно от тренировки.',
    ),
    el(
      'div',
      { class: 'setting-actions' },
      button('Калибровка аккордов', () => navigate(calibrationPath()), 'primary', 'mic'),
      button('Диагностика микрофона', () => navigate(diagnosticsPath()), 'ghost', 'settings'),
    ),
  )

  const lastBackup = el(
    'div',
    { class: 'setting-desc' },
    settings.lastBackupAt
      ? `Последний бэкап: ${formatDateTime(settings.lastBackupAt)}`
      : 'Бэкап ещё не делали.',
  )
  const backupStatus = el(
    'div',
    { class: 'setting-value' },
    settings.lastBackupAt ? 'Есть копия' : 'Копии нет',
  )

  const downloadButton = button(
    'Скачать бэкап',
    () => void exportBackup(),
    'primary',
    'download',
  )

  const fileInput = el('input', {
    type: 'file',
    accept: 'application/json,.json',
    hidden: true,
    onChange: (event: Event) => void handleFile(event),
  })

  const importButton = button(
    'Загрузить бэкап',
    () => fileInput.click(),
    'ghost',
    'upload',
  )

  const backupSection = el(
    'section',
    { class: 'settings-section' },
    el('h2', { class: 'settings-heading' }, 'Данные'),
    el(
      'div',
      { class: 'setting-row setting-row-stacked' },
      el(
        'div',
        { class: 'setting-copy' },
        el('div', { class: 'setting-title' }, 'Резервная копия'),
        lastBackup,
      ),
      el('div', { class: 'setting-control' }, backupStatus),
    ),
    el(
      'p',
      { class: 'setting-note' },
      'Песни хранятся только в этом браузере. Экспортируйте JSON-файл, чтобы не потерять их.',
    ),
    el('div', { class: 'setting-actions' }, downloadButton, importButton),
    fileInput,
  )

  const storageStatus = el('div', { class: 'setting-value' }, 'Проверяем…')
  const storageDetail = el('div', { class: 'setting-desc' }, '')
  const protectButton = button('Защитить', () => void protectStorage(), 'ghost')

  const storageSection = el(
    'section',
    { class: 'settings-section' },
    el('h2', { class: 'settings-heading' }, 'Хранилище'),
    el(
      'div',
      { class: 'setting-row' },
      el(
        'div',
        { class: 'setting-copy' },
        el('div', { class: 'setting-title' }, 'Защита от автоочистки'),
        storageDetail,
      ),
      el('div', { class: 'setting-control setting-control-row' }, storageStatus, protectButton),
    ),
  )

  const installStatus = el('div', { class: 'setting-value' }, '')
  const installDetail = el('div', { class: 'setting-desc' }, '')
  const installActions = el('div', { class: 'setting-actions' })

  const installSection = el(
    'section',
    { class: 'settings-section' },
    el('h2', { class: 'settings-heading' }, 'Приложение'),
    el(
      'div',
      { class: 'setting-row' },
      el(
        'div',
        { class: 'setting-copy' },
        el('div', { class: 'setting-title' }, 'Установка на телефон'),
        installDetail,
      ),
      el('div', { class: 'setting-control' }, installStatus),
    ),
    installActions,
  )

  const aboutSection = el(
    'section',
    { class: 'settings-section' },
    el('h2', { class: 'settings-heading' }, 'О приложении'),
    el(
      'p',
      { class: 'setting-note' },
      'TabaTaba — локальная библиотека песен с аккордами. Без аккаунтов, рекламы и облака. Работает офлайн.',
    ),
    el(
      'div',
      { class: 'about-meta' },
      el('span', {}, `Версия ${__APP_VERSION__}`),
      el('span', {}, 'Данные не покидают устройство'),
    ),
  )

  columns.append(
    appearance,
    calibrationSection,
    backupSection,
    storageSection,
    installSection,
    aboutSection,
  )
  screen.append(
    el(
      'header',
      { class: 'topbar' },
      iconButton('back', 'Назад', () => goBack('/')),
      el('div', { class: 'topbar-title' }, 'Настройки'),
    ),
    columns,
  )
  root.append(screen)

  syncThemeButtons()
  syncCalibrationToggle()
  refreshInstall()
  void refreshStorage()

  const unsubscribe = onInstallChange(refreshInstall)

  return () => {
    unsubscribe()
  }

  async function selectTheme(theme: Theme): Promise<void> {
    settings = await saveSettings({ theme })
    applyTheme(theme)
    syncThemeButtons()
  }

  function syncThemeButtons(): void {
    for (const [value, themeButton] of themeButtons) {
      themeButton.classList.toggle('is-active', settings.theme === value)
      themeButton.setAttribute('aria-pressed', String(settings.theme === value))
    }
  }

  async function toggleCalibrationMode(): Promise<void> {
    settings = await saveSettings({ calibrationMode: !settings.calibrationMode })
    syncCalibrationToggle()
  }

  function syncCalibrationToggle(): void {
    calibrationToggle.classList.toggle('is-on', settings.calibrationMode)
    calibrationToggle.setAttribute('aria-checked', String(settings.calibrationMode))
  }

  async function changeFontSize(delta: number): Promise<void> {
    const next = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, settings.fontSize + delta))
    if (next === settings.fontSize) return
    settings = await saveSettings({ fontSize: next })
    fontSizeValue.textContent = `${next} px`
  }

  async function changeScrollSpeed(delta: number): Promise<void> {
    const next = Math.max(
      MIN_SCROLL_SPEED,
      Math.min(MAX_SCROLL_SPEED, settings.scrollSpeed + delta),
    )
    if (next === settings.scrollSpeed) return
    settings = await saveSettings({ scrollSpeed: next })
    speedValue.textContent = `${next} px/с`
  }

  async function exportBackup(): Promise<void> {
    downloadButton.disabled = true
    try {
      const result = await downloadBackup()
      settings = await loadSettings()
      updateBackupStatus()
      toast(
        `Бэкап сохранён: ${result.songs} ${plural(result.songs, 'песня', 'песни', 'песен')}`,
      )
    } catch (error) {
      console.error(error)
      toast('Не удалось сохранить бэкап')
    } finally {
      downloadButton.disabled = false
    }
  }

  async function handleFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file) return

    let data: BackupData
    try {
      data = await readBackupFile(file)
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Не удалось прочитать бэкап')
      return
    }

    const songsLabel = `${data.songs.length} ${plural(
      data.songs.length,
      'песня',
      'песни',
      'песен',
    )}`
    const choice = await openDialog({
      title: 'Импорт бэкапа',
      description: `В файле ${songsLabel}. «Добавить» обновит совпадающие записи, «Заменить» удалит текущие песни.`,
      actions: [
        { label: 'Отмена', value: 'cancel' },
        { label: 'Заменить', value: 'replace', kind: 'danger' },
        { label: 'Добавить', value: 'merge', kind: 'primary' },
      ],
    })
    if (choice !== 'merge' && choice !== 'replace') return

    try {
      const result = await importBackup(data, choice as ImportMode)
      toast(
        `Импортировано: ${result.songs} ${plural(
          result.songs,
          'песня',
          'песни',
          'песен',
        )}`,
        {
          action: { label: 'К песням', onClick: () => navigate('/') },
        },
      )
    } catch (error) {
      console.error(error)
      toast('Не удалось импортировать бэкап')
    }
  }

  function updateBackupStatus(): void {
    lastBackup.textContent = settings.lastBackupAt
      ? `Последний бэкап: ${formatDateTime(settings.lastBackupAt)}`
      : 'Бэкап ещё не делали.'
    backupStatus.textContent = settings.lastBackupAt ? 'Есть копия' : 'Копии нет'
  }

  async function refreshStorage(): Promise<void> {
    const storage = navigator.storage as unknown as StorageLike | undefined
    let persisted = false
    try {
      persisted = (await storage?.persisted?.()) ?? false
    } catch {
      persisted = false
    }
    storageStatus.textContent = persisted ? 'Защищено' : 'Не защищено'
    storageStatus.classList.toggle('is-success', persisted)
    protectButton.hidden = persisted || !storage?.persist

    let usage = ''
    try {
      const estimate = await storage?.estimate?.()
      if (estimate?.usage) usage = `Занято ${formatBytes(estimate.usage)}. `
    } catch {
      usage = ''
    }

    storageDetail.textContent = persisted
      ? `${usage}Браузер не будет удалять данные без вашего участия.`
      : `${usage}Браузер может очистить данные при нехватке места.`
  }

  async function protectStorage(): Promise<void> {
    const storage = navigator.storage as unknown as StorageLike | undefined
    if (!storage?.persist) return
    try {
      const persisted = await storage.persist()
      toast(
        persisted
          ? 'Данные защищены от автоочистки'
          : 'Браузер пока не дал защиту. Сделайте бэкап.',
      )
    } catch {
      toast('Не удалось запросить защиту хранилища')
    }
    await refreshStorage()
  }

  function refreshInstall(): void {
    installActions.replaceChildren()
    if (isStandalone()) {
      installStatus.textContent = 'Установлено'
      installStatus.classList.add('is-success')
      installDetail.textContent = 'Приложение запущено в отдельном окне.'
      return
    }

    installStatus.textContent = canInstall() ? 'Можно установить' : 'Через браузер'
    installStatus.classList.remove('is-success')
    installDetail.textContent = canInstall()
      ? 'Добавьте TabaTaba на главный экран и запускайте без адресной строки.'
      : 'Откройте в Chrome меню ⋮ и выберите «Добавить на главный экран».'

    if (canInstall()) {
      installActions.append(
        button(
          'Установить',
          () => {
            void promptInstall().then((accepted) => {
              if (accepted) toast('TabaTaba установлена')
              refreshInstall()
            })
          },
          'primary',
          'install',
        ),
      )
    }
  }
}

function settingRow(title: string, description: string, control: Node): HTMLElement {
  return el(
    'div',
    { class: 'setting-row' },
    el(
      'div',
      { class: 'setting-copy' },
      el('div', { class: 'setting-title' }, title),
      el('div', { class: 'setting-desc' }, description),
    ),
    el('div', { class: 'setting-control' }, control),
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`
}
