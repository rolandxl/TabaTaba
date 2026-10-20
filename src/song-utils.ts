import { isChord, isChordLine, isSectionHeader } from './chords/detect'
import { transposeKey, type AccidentalPreference } from './chords/transpose'

export function inferTitle(content: string): string {
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (isChordLine(line) || isSectionHeader(line)) continue
    return trimmed.slice(0, 70)
  }
  return 'Без названия'
}

export function keyLabel(
  key: string,
  semitones: number,
  preference: AccidentalPreference,
): string {
  const trimmed = key.trim()
  if (!trimmed) return ''
  if (semitones === 0 || !isChord(trimmed)) return trimmed
  return `${trimmed} → ${transposeKey(trimmed, semitones, preference)}`
}

export function transposeLabel(value: number): string {
  if (value > 0) return `+${value}`
  if (value < 0) return `−${Math.abs(value)}`
  return '0'
}
