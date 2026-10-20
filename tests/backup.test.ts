import { describe, expect, it } from 'vitest'
import {
  buildBackup,
  BACKUP_APP,
  parseBackup,
  serializeBackup,
} from '../src/backup-format'
import { DEFAULT_SETTINGS, type Song } from '../src/types'

const song: Song = {
  id: 'song-1',
  title: 'Тест',
  artist: 'Автор',
  tags: ['рок'],
  key: 'Am',
  capo: 2,
  content: 'Am\nТекст',
  transpose: 1,
  favorite: true,
  createdAt: 1000,
  updatedAt: 2000,
  fontSize: 15,
  scrollSpeed: 28,
}

describe('backup format', () => {
  it('round-trips a backup', () => {
    const data = buildBackup([song], [], { ...DEFAULT_SETTINGS, lastBackupAt: 3000 })
    const parsed = parseBackup(serializeBackup(data))
    expect(parsed.app).toBe(BACKUP_APP)
    expect(parsed.songs).toEqual([song])
    expect(parsed.setlists).toEqual([])
    expect(parsed.settings.lastBackupAt).toBe(3000)
  })

  it('normalizes incomplete songs', () => {
    const raw = JSON.stringify({
      app: BACKUP_APP,
      version: 1,
      songs: [{ title: 'Без полей', content: 'Am\nТекст' }],
      setlists: [],
    })
    const parsed = parseBackup(raw)
    expect(parsed.songs).toHaveLength(1)
    expect(parsed.songs[0].id).toBeTruthy()
    expect(parsed.songs[0].tags).toEqual([])
    expect(parsed.songs[0].capo).toBe(0)
    expect(parsed.songs[0].favorite).toBe(false)
    expect(parsed.songs[0].fontSize).toBeUndefined()
    expect(parsed.songs[0].scrollSpeed).toBeUndefined()
    expect(parsed.settings.theme).toBe('dark')
  })

  it('rejects wrong files', () => {
    expect(() => parseBackup('not json')).toThrow()
    expect(() => parseBackup(JSON.stringify({ app: 'Other', songs: [] }))).toThrow()
    expect(() =>
      parseBackup(JSON.stringify({ app: BACKUP_APP, version: 1 })),
    ).toThrow()
    expect(() =>
      parseBackup(
        JSON.stringify({ app: BACKUP_APP, version: 99, songs: [], setlists: [] }),
      ),
    ).toThrow()
  })

  it('clamps out-of-range values', () => {
    const raw = JSON.stringify({
      app: BACKUP_APP,
      version: 1,
      songs: [{ title: 'X', capo: 99, transpose: -99 }],
      setlists: [],
      settings: { fontSize: 999, scrollSpeed: -5 },
    })
    const parsed = parseBackup(raw)
    expect(parsed.songs[0].capo).toBe(12)
    expect(parsed.songs[0].transpose).toBe(-11)
    expect(parsed.settings.fontSize).toBe(30)
    expect(parsed.settings.scrollSpeed).toBe(5)
  })

  it('clamps the minimum font size', () => {
    const raw = JSON.stringify({
      app: BACKUP_APP,
      version: 1,
      songs: [],
      setlists: [],
      settings: { fontSize: -999 },
    })
    expect(parseBackup(raw).settings.fontSize).toBe(10)
  })

  it('enables calibration mode by default and keeps an explicit value', () => {
    const withoutField = parseBackup(
      JSON.stringify({ app: BACKUP_APP, version: 1, songs: [], setlists: [] }),
    )
    expect(withoutField.settings.calibrationMode).toBe(true)

    const disabled = parseBackup(
      JSON.stringify({
        app: BACKUP_APP,
        version: 1,
        songs: [],
        setlists: [],
        settings: { calibrationMode: false },
      }),
    )
    expect(disabled.settings.calibrationMode).toBe(false)
  })

  it('keeps per-song follow sensitivity', () => {
    const raw = JSON.stringify({
      app: BACKUP_APP,
      version: 1,
      songs: [
        { title: 'A', followSensitivity: 'responsive' },
        { title: 'B', followSensitivity: 'unknown' },
      ],
      setlists: [],
    })
    const parsed = parseBackup(raw)
    expect(parsed.songs[0].followSensitivity).toBe('responsive')
    expect(parsed.songs[1].followSensitivity).toBeUndefined()
  })

  it('keeps microphone calibration and profiles', () => {
    const profile = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    const raw = JSON.stringify({
      app: BACKUP_APP,
      version: 1,
      songs: [],
      setlists: [],
      settings: {
        mic: {
          noiseFloor: 0.002,
          threshold: 0.007,
          a4: 442,
          profiles: { Am: profile },
          lastCalibratedAt: 1234,
        },
      },
    })
    const parsed = parseBackup(raw)
    expect(parsed.settings.mic.noiseFloor).toBe(0.002)
    expect(parsed.settings.mic.threshold).toBe(0.007)
    expect(parsed.settings.mic.a4).toBe(442)
    expect(parsed.settings.mic.profiles.Am).toEqual(profile)
    expect(parsed.settings.mic.lastCalibratedAt).toBe(1234)
  })

  it('keeps and clamps per-song view settings', () => {
    const raw = JSON.stringify({
      app: BACKUP_APP,
      version: 1,
      songs: [
        { title: 'A', fontSize: 15, scrollSpeed: 30 },
        { title: 'B', fontSize: 99, scrollSpeed: 999 },
      ],
      setlists: [],
    })
    const parsed = parseBackup(raw)
    expect(parsed.songs[0].fontSize).toBe(15)
    expect(parsed.songs[0].scrollSpeed).toBe(30)
    expect(parsed.songs[1].fontSize).toBe(30)
    expect(parsed.songs[1].scrollSpeed).toBe(120)
  })
})
