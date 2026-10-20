import Dexie, { type Table } from 'dexie'
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
  type FollowSensitivity,
  type Setlist,
  type Song,
} from './types'

const DEMO_SONG = `Интро
Am  C  G  D

Куплет 1
Am                 C
Утром город ещё молчит,
G                  D
Кофе стынет на столе.
Am                    C
Мы с тобой начнём с чистого листа,
G                 D
Песню новую споём земле.

Припев
F        G
Пой со мной,
Am       C
Пой со мной,
F          G          Am
Пока рассвет не заберёт нас в путь.

Проигрыш
Am  C  G  D`

class TabaDatabase extends Dexie {
  songs!: Table<Song, string>
  setlists!: Table<Setlist, string>
  settings!: Table<AppSettings, string>

  constructor() {
    super('tabataba')
    this.version(1).stores({
      songs: 'id, title, artist, updatedAt, favorite, *tags',
      setlists: 'id, name, updatedAt',
      settings: 'id',
    })
  }
}

export const db = new TabaDatabase()

export async function loadSettings(): Promise<AppSettings> {
  const stored = await db.settings.get('app')
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    id: 'app',
    calibrationMode: stored?.calibrationMode ?? DEFAULT_SETTINGS.calibrationMode,
    mic: {
      ...DEFAULT_MIC_CALIBRATION,
      ...stored?.mic,
      profiles: { ...(stored?.mic?.profiles ?? {}) },
    },
  }
}

export async function saveSettings(patch: Partial<Omit<AppSettings, 'id'>>): Promise<AppSettings> {
  const current = await loadSettings()
  const next: AppSettings = { ...current, ...patch, id: 'app' }
  await db.settings.put(next)
  return next
}

export interface SongInput {
  title: string
  artist?: string
  tags?: string[]
  key?: string
  capo?: number
  content?: string
}

export function makeSong(input: SongInput): Song {
  const now = Date.now()
  return {
    id: newId(),
    title: input.title.trim() || 'Без названия',
    artist: input.artist?.trim() ?? '',
    tags: cleanTags(input.tags ?? []),
    key: input.key?.trim() ?? '',
    capo: clamp(input.capo ?? 0, 0, 12),
    content: input.content ?? '',
    transpose: 0,
    favorite: false,
    createdAt: now,
    updatedAt: now,
  }
}

export async function addSong(input: SongInput): Promise<Song> {
  const song = makeSong(input)
  await db.songs.add(song)
  return song
}

export async function updateSong(
  id: string,
  patch: Partial<Omit<Song, 'id' | 'createdAt'>>,
): Promise<Song | undefined> {
  const existing = await db.songs.get(id)
  if (!existing) return undefined
  const next: Song = {
    ...existing,
    ...patch,
    id: existing.id,
    createdAt: existing.createdAt,
    tags: patch.tags ? cleanTags(patch.tags) : existing.tags,
    title: patch.title !== undefined ? patch.title.trim() || 'Без названия' : existing.title,
    updatedAt: Date.now(),
  }
  await db.songs.put(next)
  return next
}

export async function deleteSong(id: string): Promise<void> {
  await db.songs.delete(id)
}

export interface SongPreferences {
  fontSize?: number
  scrollSpeed?: number
  transpose?: number
  followSensitivity?: FollowSensitivity
}

export async function updateSongPreferences(
  id: string,
  patch: SongPreferences,
): Promise<Song | undefined> {
  const existing = await db.songs.get(id)
  if (!existing) return undefined
  const next: Song = { ...existing }
  if (patch.fontSize !== undefined) {
    next.fontSize = clamp(patch.fontSize, MIN_FONT_SIZE, MAX_FONT_SIZE)
  }
  if (patch.scrollSpeed !== undefined) {
    next.scrollSpeed = clamp(patch.scrollSpeed, MIN_SCROLL_SPEED, MAX_SCROLL_SPEED)
  }
  if (patch.transpose !== undefined) {
    next.transpose = clamp(patch.transpose, -11, 11)
  }
  if (isFollowSensitivity(patch.followSensitivity)) {
    next.followSensitivity = patch.followSensitivity
  }
  await db.songs.put(next)
  return next
}

export async function toggleFavorite(id: string): Promise<Song | undefined> {
  const song = await db.songs.get(id)
  if (!song) return undefined
  return updateSong(id, { favorite: !song.favorite })
}

export async function seedIfNeeded(): Promise<void> {
  const settings = await loadSettings()
  if (settings.seeded) return
  const count = await db.songs.count()
  if (count === 0) {
    const song = makeSong({
      title: 'Пой со мной',
      artist: 'TabaTaba',
      key: 'Am',
      tags: ['пример', 'акустика'],
      content: DEMO_SONG,
    })
    song.favorite = true
    await db.songs.add(song)
  }
  await saveSettings({ seeded: true })
}

function cleanTags(tags: string[]): string[] {
  return Array.from(
    new Set(
      tags
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, 20),
    ),
  )
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.round(value)))
}
