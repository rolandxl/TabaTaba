import type { SongLine } from './detect'

export type AccidentalPreference = 'sharp' | 'flat'

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
const NATURAL_PITCH: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
  H: 11,
}

const FLAT_MAJOR_KEYS = new Set(['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb'])
const SHARP_MAJOR_KEYS = new Set(['G', 'D', 'A', 'E', 'B', 'F#', 'C#'])
const FLAT_MINOR_KEYS = new Set(['D', 'G', 'C', 'F', 'Bb', 'Eb', 'Ab'])
const SHARP_MINOR_KEYS = new Set(['E', 'B', 'F#', 'C#', 'G#', 'D#', 'A#'])

interface ParsedChord {
  root: string
  accidental: string
  rest: string
  bass: string
  bassAccidental: string
}

export function transposeChord(
  chord: string,
  semitones: number,
  preference: AccidentalPreference = 'sharp',
): string {
  const normalized = chord.replace(/♯/g, '#').replace(/♭/g, 'b')
  if (normalized === 'N.C.' || normalized === 'NC') return chord
  const parsed = parseChord(normalized)
  if (!parsed) return chord

  const rootPitch = pitchOf(parsed.root, parsed.accidental)
  if (rootPitch === null) return chord
  const rootPreference = preferenceForAccidental(parsed.accidental, preference)
  const root = spell((rootPitch + semitones + 1200) % 12, rootPreference)

  let bass = ''
  if (parsed.bass) {
    const bassPitch = pitchOf(parsed.bass, parsed.bassAccidental)
    if (bassPitch === null) return chord
    const bassPreference = preferenceForAccidental(parsed.bassAccidental, preference)
    bass = `/${spell((bassPitch + semitones + 1200) % 12, bassPreference)}`
  }

  return `${root}${parsed.rest}${bass}`
}

export function transposeKey(
  key: string,
  semitones: number,
  preference: AccidentalPreference = 'sharp',
): string {
  if (!key.trim()) return key
  return transposeChord(key.trim(), semitones, preference)
}

export function transposeLines(
  lines: SongLine[],
  semitones: number,
  preference: AccidentalPreference = 'sharp',
): SongLine[] {
  if (semitones === 0) return lines
  return lines.map((line) => {
    if (!line.chords || line.chords.length === 0) return line
    return {
      ...line,
      chords: line.chords.map((chord) => ({
        ...chord,
        text: transposeChord(chord.text, semitones, preference),
      })),
    }
  })
}

export function inferAccidentalPreference(key: string, content: string): AccidentalPreference {
  const trimmed = key.trim()
  if (trimmed) {
    if (trimmed.includes('b') || trimmed.includes('♭')) return 'flat'
    if (trimmed.includes('#') || trimmed.includes('♯')) return 'sharp'

    const isMinor = /m$/.test(trimmed) && !/maj$/.test(trimmed)
    const root = trimmed.replace(/m$/, '')
    if (isMinor) {
      if (FLAT_MINOR_KEYS.has(root)) return 'flat'
      if (SHARP_MINOR_KEYS.has(root)) return 'sharp'
    } else {
      if (FLAT_MAJOR_KEYS.has(root)) return 'flat'
      if (SHARP_MAJOR_KEYS.has(root)) return 'sharp'
    }
  }

  const flats = (content.match(/[A-H][b♭]/g) ?? []).length
  const sharps = (content.match(/[A-H][#♯]/g) ?? []).length
  return flats > sharps ? 'flat' : 'sharp'
}

function parseChord(chord: string): ParsedChord | null {
  const slash = chord.indexOf('/')
  const main = slash > 0 ? chord.slice(0, slash) : chord
  const bassPart = slash > 0 ? chord.slice(slash + 1) : ''
  const match = /^([A-H])([#b]?)(.*)$/.exec(main)
  if (!match) return null

  const [, root, accidental, rest] = match
  if (slash > 0) {
    const bassMatch = /^([A-H])([#b]?)$/.exec(bassPart)
    if (!bassMatch) return null
    return {
      root,
      accidental,
      rest,
      bass: bassMatch[1],
      bassAccidental: bassMatch[2],
    }
  }

  return { root, accidental, rest, bass: '', bassAccidental: '' }
}

function pitchOf(letter: string, accidental: string): number | null {
  const natural = NATURAL_PITCH[letter]
  if (natural === undefined) return null
  const offset = accidental === '#' ? 1 : accidental === 'b' ? -1 : 0
  return (natural + offset + 12) % 12
}

function spell(pitch: number, preference: AccidentalPreference): string {
  return (preference === 'flat' ? FLAT_NAMES : SHARP_NAMES)[pitch]
}

function preferenceForAccidental(
  accidental: string,
  fallback: AccidentalPreference,
): AccidentalPreference {
  if (accidental === '#') return 'sharp'
  if (accidental === 'b') return 'flat'
  return fallback
}
