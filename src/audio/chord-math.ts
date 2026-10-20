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

export function chordPitchClasses(chord: string, capo = 0): number[] | null {
  const parsed = parseChord(chord)
  if (!parsed) return null
  const classes = new Set<number>()
  for (const interval of intervalsForSuffix(parsed.suffix)) {
    classes.add((parsed.root + capo + interval + 1200) % 12)
  }
  return [...classes].sort((a, b) => a - b)
}

export function chordRootPitchClass(chord: string, capo = 0): number | null {
  const parsed = parseChord(chord)
  if (!parsed) return null
  return (parsed.root + capo + 1200) % 12
}

export function chordTemplate(pitchClasses: readonly number[]): Float32Array {
  const template = new Float32Array(12)
  for (const pitchClass of pitchClasses) {
    if (pitchClass >= 0 && pitchClass < 12) template[pitchClass] = 1
  }
  return template
}

export function matchScore(
  chroma: ArrayLike<number>,
  pitchClasses: readonly number[],
): number {
  if (pitchClasses.length === 0) return 0
  const template = chordTemplate(pitchClasses)
  let dot = 0
  let chromaNorm = 0
  let templateNorm = 0
  let total = 0
  let inChord = 0
  let max = 0

  for (let index = 0; index < 12; index++) {
    const value = Math.max(0, chroma[index] ?? 0)
    dot += value * template[index]
    chromaNorm += value * value
    templateNorm += template[index] * template[index]
    total += value
    max = Math.max(max, value)
    if (template[index] > 0) inChord += value
  }

  if (chromaNorm === 0 || templateNorm === 0) return 0
  const cosine = dot / (Math.sqrt(chromaNorm) * Math.sqrt(templateNorm))
  const coverage = total > 0 ? inChord / total : 0

  const presence = max * 0.12
  let presentNotes = 0
  for (const pitchClass of pitchClasses) {
    if (Math.max(0, chroma[pitchClass] ?? 0) >= presence) presentNotes += 1
  }
  const recall = presentNotes / pitchClasses.length

  return cosine * 0.4 + coverage * 0.3 + recall * 0.3
}

export function samePitchClasses(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false
  return a.every((pitchClass, index) => pitchClass === b[index])
}

export function profileScore(chroma: ArrayLike<number>, profile: ArrayLike<number>): number {
  if (profile.length !== 12) return 0
  let dot = 0
  let chromaNorm = 0
  let profileNorm = 0
  for (let index = 0; index < 12; index++) {
    const value = Math.max(0, chroma[index] ?? 0)
    const profileValue = Math.max(0, profile[index] ?? 0)
    dot += value * profileValue
    chromaNorm += value * value
    profileNorm += profileValue * profileValue
  }
  if (chromaNorm === 0 || profileNorm === 0) return 0
  return dot / (Math.sqrt(chromaNorm) * Math.sqrt(profileNorm))
}

export interface BestChord {
  name: string
  score: number
}

const ROOT_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const QUALITIES = ['', 'm', '7', 'm7', 'maj7', 'sus2', 'sus4', 'dim', 'aug', '6', 'm7b5', 'add9']

export function bestChords(
  chroma: ArrayLike<number>,
  profiles: Record<string, readonly number[]> = {},
  limit = 3,
): BestChord[] {
  const scores = new Map<string, number>()
  let total = 0
  for (let index = 0; index < 12; index++) total += Math.max(0, chroma[index] ?? 0)

  for (const rootName of ROOT_NAMES) {
    for (const quality of QUALITIES) {
      const name = `${rootName}${quality}`
      const pitchClasses = chordPitchClasses(name)
      if (!pitchClasses) continue
      const root = chordRootPitchClass(name)
      const rootShare = root !== null && total > 0 ? Math.max(0, chroma[root] ?? 0) / total : 0
      const base = matchScore(chroma, pitchClasses)
      scores.set(name, base * 0.78 + rootShare * 0.22)
    }
  }

  for (const [name, profile] of Object.entries(profiles)) {
    if (profile.length !== 12) continue
    const root = chordRootPitchClass(name)
    const rootShare = root !== null && total > 0 ? Math.max(0, chroma[root] ?? 0) / total : 0
    const base = profileScore(chroma, profile)
    scores.set(name, base * 0.78 + rootShare * 0.22)
  }

  return [...scores.entries()]
    .map(([name, score]) => ({ name, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, limit))
}

function parseChord(chord: string): { root: number; suffix: string } | null {
  const normalized = chord.replace(/♯/g, '#').replace(/♭/g, 'b').trim()
  if (/^N\.?C\.?$/i.test(normalized)) return null
  const main = normalized.split('/')[0]
  const match = /^([A-H])([#b]?)(.*)$/.exec(main)
  if (!match) return null
  const [, letter, accidental, suffix] = match
  const root = pitchClass(letter, accidental)
  if (root === null) return null
  return { root, suffix }
}

function pitchClass(letter: string, accidental: string): number | null {
  const natural = NATURAL_PITCH[letter]
  if (natural === undefined) return null
  const offset = accidental === '#' ? 1 : accidental === 'b' ? -1 : 0
  return (natural + offset + 12) % 12
}

function intervalsForSuffix(rawSuffix: string): number[] {
  const suffix = rawSuffix.replace(/[()]/g, '')

  if (/^m7b5/.test(suffix) || /^ø/.test(suffix)) return [0, 3, 6, 10]
  if (/^dim7/.test(suffix) || /^°7/.test(suffix)) return [0, 3, 6, 9]
  if (/^dim/.test(suffix) || /^°/.test(suffix)) return [0, 3, 6]
  if (/^aug/.test(suffix) || /^\+/.test(suffix)) return [0, 4, 8]
  if (/^sus2/.test(suffix)) return [0, 2, 7]
  if (/^sus4/.test(suffix) || /^sus/.test(suffix)) return [0, 5, 7]
  if (/^maj7/.test(suffix) || /^M7/.test(suffix)) return [0, 4, 7, 11]
  if (/^maj9/.test(suffix) || /^M9/.test(suffix)) return [0, 4, 7, 11, 2]
  if (/^maj/.test(suffix) || /^M/.test(suffix)) return [0, 4, 7]
  if (/^m7/.test(suffix)) return [0, 3, 7, 10]
  if (/^m6/.test(suffix)) return [0, 3, 7, 9]
  if (/^m/.test(suffix)) return [0, 3, 7]
  if (/^7sus4/.test(suffix)) return [0, 5, 7, 10]
  if (/^9/.test(suffix)) return [0, 4, 7, 10, 2]
  if (/^7/.test(suffix)) return [0, 4, 7, 10]
  if (/^6/.test(suffix)) return [0, 4, 7, 9]
  if (/^add9/.test(suffix)) return [0, 4, 7, 2]
  if (/^5/.test(suffix)) return [0, 7]
  return [0, 4, 7]
}
