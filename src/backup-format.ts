import { newId } from './id'
import {
  DEFAULT_MIC_CALIBRATION,
  DEFAULT_SETTINGS,
  MAX_FONT_SIZE,
  MAX_SCROLL_SPEED,
  MIN_FONT_SIZE,
  MIN_SCROLL_SPEED,
  isFollowSensitivity,
  type AppSettings,
  type MicCalibration,
  type Setlist,
  type Song,
  type Theme,
} from './types'

export const BACKUP_APP = 'TabaTaba'
export const BACKUP_VERSION = 1

export interface BackupData {
  app: typeof BACKUP_APP
  version: number
  exportedAt: string
  songs: Song[]
  setlists: Setlist[]
  settings: AppSettings
}

export function buildBackup(
  songs: Song[],
  setlists: Setlist[],
  settings: AppSettings,
): BackupData {
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    songs,
    setlists,
    settings,
  }
}

export function serializeBackup(data: BackupData): string {
  return JSON.stringify(data, null, 2)
}

export function parseBackup(text: string): BackupData {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('Файл не похож на JSON-бэкап TabaTaba.')
  }

  if (!isRecord(parsed)) {
    throw new Error('Некорректный формат бэкапа.')
  }
  if (parsed.app !== BACKUP_APP) {
    throw new Error('Это не бэкап TabaTaba.')
  }
  if (!Array.isArray(parsed.songs)) {
    throw new Error('В бэкапе нет списка песен.')
  }
  const version = asInteger(parsed.version, BACKUP_VERSION)
  if (version > BACKUP_VERSION) {
    throw new Error('Бэкап создан более новой версией приложения.')
  }

  const songs = parsed.songs.map(normalizeSong)
  const setlists = Array.isArray(parsed.setlists)
    ? parsed.setlists.filter(isRecord).map(normalizeSetlist)
    : []
  const settings = isRecord(parsed.settings)
    ? normalizeSettings(parsed.settings)
    : { ...DEFAULT_SETTINGS }

  return {
    app: BACKUP_APP,
    version,
    exportedAt: asString(parsed.exportedAt, new Date().toISOString()),
    songs,
    setlists,
    settings,
  }
}

function normalizeSong(value: unknown): Song {
  if (!isRecord(value)) {
    throw new Error('В бэкапе есть повреждённая песня.')
  }
  const now = Date.now()
  const createdAt = asTimestamp(value.createdAt, now)
  const fontSize = optionalNumber(value.fontSize, MIN_FONT_SIZE, MAX_FONT_SIZE)
  const scrollSpeed = optionalNumber(value.scrollSpeed, MIN_SCROLL_SPEED, MAX_SCROLL_SPEED)
  return {
    id: asString(value.id, '') || newId(),
    title: asString(value.title, '').trim() || 'Без названия',
    artist: asString(value.artist, '').trim(),
    tags: Array.isArray(value.tags)
      ? Array.from(
          new Set(
            value.tags
              .filter((tag): tag is string => typeof tag === 'string')
              .map((tag) => tag.trim())
              .filter(Boolean),
          ),
        )
      : [],
    key: asString(value.key, '').trim(),
    capo: asNumber(value.capo, 0, 0, 12),
    content: asString(value.content, ''),
    transpose: asNumber(value.transpose, 0, -11, 11),
    favorite: value.favorite === true,
    createdAt,
    updatedAt: asTimestamp(value.updatedAt, createdAt),
    ...(fontSize !== undefined ? { fontSize } : {}),
    ...(scrollSpeed !== undefined ? { scrollSpeed } : {}),
    ...(isFollowSensitivity(value.followSensitivity)
      ? { followSensitivity: value.followSensitivity }
      : {}),
  }
}

function normalizeSetlist(value: Record<string, unknown>): Setlist {
  const now = Date.now()
  const createdAt = asTimestamp(value.createdAt, now)
  return {
    id: asString(value.id, '') || newId(),
    name: asString(value.name, '').trim() || 'Без названия',
    songIds: Array.isArray(value.songIds)
      ? value.songIds.filter((id): id is string => typeof id === 'string')
      : [],
    createdAt,
    updatedAt: asTimestamp(value.updatedAt, createdAt),
  }
}

function normalizeSettings(value: Record<string, unknown>): AppSettings {
  const theme = value.theme
  const validTheme: Theme =
    theme === 'light' || theme === 'system' || theme === 'dark' ? theme : 'dark'
  return {
    id: 'app',
    theme: validTheme,
    fontSize: asNumber(value.fontSize, DEFAULT_SETTINGS.fontSize, MIN_FONT_SIZE, MAX_FONT_SIZE),
    scrollSpeed: asNumber(
      value.scrollSpeed,
      DEFAULT_SETTINGS.scrollSpeed,
      MIN_SCROLL_SPEED,
      MAX_SCROLL_SPEED,
    ),
    lastBackupAt:
      typeof value.lastBackupAt === 'number' && Number.isFinite(value.lastBackupAt)
        ? value.lastBackupAt
        : null,
    seeded: value.seeded === true,
    calibrationMode:
      typeof value.calibrationMode === 'boolean'
        ? value.calibrationMode
        : DEFAULT_SETTINGS.calibrationMode,
    mic: normalizeMic(value.mic),
  }
}

function normalizeMic(value: unknown): MicCalibration {
  if (!isRecord(value)) {
    return { ...DEFAULT_MIC_CALIBRATION, profiles: {} }
  }
  return {
    noiseFloor: asFloat(value.noiseFloor, DEFAULT_MIC_CALIBRATION.noiseFloor, 0, 0.1),
    threshold: asFloat(value.threshold, DEFAULT_MIC_CALIBRATION.threshold, 0.0005, 0.2),
    a4: asFloat(value.a4, DEFAULT_MIC_CALIBRATION.a4, 400, 480),
    profiles: normalizeProfiles(value.profiles),
    lastCalibratedAt:
      typeof value.lastCalibratedAt === 'number' && Number.isFinite(value.lastCalibratedAt)
        ? value.lastCalibratedAt
        : null,
  }
}

function normalizeProfiles(value: unknown): Record<string, number[]> {
  if (!isRecord(value)) return {}
  const profiles: Record<string, number[]> = {}
  for (const [name, rawProfile] of Object.entries(value)) {
    if (!name || !Array.isArray(rawProfile) || rawProfile.length !== 12) continue
    const values = rawProfile.map((item) =>
      typeof item === 'number' && Number.isFinite(item) ? Math.max(0, item) : 0,
    )
    let norm = 0
    for (const item of values) norm += item * item
    if (norm === 0) continue
    const scale = 1 / Math.sqrt(norm)
    profiles[name] = values.map((item) => item * scale)
  }
  return profiles
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function asNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.round(value)))
}

function asFloat(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

function asInteger(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.round(value)
}

function asTimestamp(value: unknown, fallback: number): number {
  return Math.max(0, asInteger(value, fallback))
}

function optionalNumber(value: unknown, min: number, max: number): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return Math.min(max, Math.max(min, Math.round(value)))
}
