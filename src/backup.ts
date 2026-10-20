import { db, loadSettings, saveSettings } from './db'
import {
  buildBackup,
  parseBackup,
  serializeBackup,
  type BackupData,
} from './backup-format'

export type ImportMode = 'merge' | 'replace'

export async function downloadBackup(): Promise<{ songs: number; filename: string }> {
  const [songs, setlists, settings] = await Promise.all([
    db.songs.toArray(),
    db.setlists.toArray(),
    loadSettings(),
  ])
  const data = buildBackup(songs, setlists, settings)
  const blob = new Blob([serializeBackup(data)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const filename = `tabataba-${localDateStamp()}.json`
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
  await saveSettings({ lastBackupAt: Date.now() })
  return { songs: songs.length, filename }
}

export async function readBackupFile(file: File): Promise<BackupData> {
  return parseBackup(await file.text())
}

export async function importBackup(
  data: BackupData,
  mode: ImportMode,
): Promise<{ songs: number; setlists: number }> {
  await db.transaction('rw', db.songs, db.setlists, async () => {
    if (mode === 'replace') {
      await db.songs.clear()
      await db.setlists.clear()
    }
    if (data.songs.length > 0) await db.songs.bulkPut(data.songs)
    if (data.setlists.length > 0) await db.setlists.bulkPut(data.setlists)
  })
  return { songs: data.songs.length, setlists: data.setlists.length }
}

function localDateStamp(): string {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
