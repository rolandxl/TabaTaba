import type { Theme } from './types'

const DARK_COLOR = '#0f1115'
const LIGHT_COLOR = '#f7f5f0'
const media = window.matchMedia('(prefers-color-scheme: dark)')
let currentTheme: Theme = 'dark'

export function applyTheme(theme: Theme): void {
  currentTheme = theme
  document.documentElement.dataset.theme = theme
  updateMeta()
}

export function watchSystemTheme(): void {
  media.addEventListener('change', () => {
    if (currentTheme === 'system') updateMeta()
  })
}

function updateMeta(): void {
  const isDark = currentTheme === 'dark' || (currentTheme === 'system' && media.matches)
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', isDark ? DARK_COLOR : LIGHT_COLOR)
}
