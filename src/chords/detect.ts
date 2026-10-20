export interface ChordToken {
  text: string
  col: number
}

export type SongLineKind = 'blank' | 'header' | 'lyric' | 'instrumental'

export interface SongLine {
  kind: SongLineKind
  text: string
  chords?: ChordToken[]
}

const ROOT = '[A-H](?:#|b|♯|♭)?'
const QUALITY = '(?:maj|min|dim|aug|sus|add|m|M|°|ø|\\+|-)?'
const EXTENSION = '(?:\\d+)?'
const ALTERATIONS = '(?:(?:sus|add|maj|min|dim|aug|[#b])\\d+)*'
const BASS = '(?:\\/' + ROOT + ')?'
const CHORD_RE = new RegExp(`^${ROOT}${QUALITY}${EXTENSION}${ALTERATIONS}${BASS}$`)

const SECTION_RE =
  /^(?:припев|куплет|бридж|вступление|интро|проигрыш|соло|кода|аутро|финал|запев|переход|intro|verse|chorus|bridge|pre[- ]?chorus|solo|instrumental|outro|interlude|ending|breakdown)(?:\s*[0-9ivxlcdm]+)?$/i

const IGNORABLE_RE = /^(?:x\d+|\d+x|\.{2,}|[-–—]+)$/i

export function normalizeContent(content: string): string {
  return content
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/\t/g, '    ')
    .replace(/[\u200b-\u200d\ufeff]/g, '')
}

export function cleanToken(raw: string): string {
  return raw
    .trim()
    .replace(/^[|:()[\]{},]+/, '')
    .replace(/[|:()[\]{},]+$/, '')
    .trim()
}

export function isChord(text: string): boolean {
  const token = cleanToken(text)
  if (!token) return false
  if (token === 'N.C.' || token === 'NC') return true
  return CHORD_RE.test(token)
}

export function isChordLine(line: string): boolean {
  return extractChordTokens(line) !== null
}

export function extractChordTokens(line: string): ChordToken[] | null {
  const tokens: ChordToken[] = []
  let foundChord = false

  for (const match of line.matchAll(/\S+/g)) {
    const raw = match[0]
    const token = cleanToken(raw)
    if (!token || IGNORABLE_RE.test(token)) continue
    if (!isChord(token)) return null

    const contentOffset = raw.search(/[^\s|:()[\]{},]/)
    tokens.push({
      text: token,
      col: match.index + Math.max(0, contentOffset),
    })
    foundChord = true
  }

  return foundChord ? tokens : null
}

export function isSectionHeader(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) return false
  if (/^\[[^\]]{1,40}\]$/.test(trimmed)) return true
  const text = trimmed.replace(/:$/, '').trim()
  if (text.length > 40) return false
  return SECTION_RE.test(text)
}

export function parseSong(content: string): SongLine[] {
  const rawLines = normalizeContent(content).split('\n')
  const lines: SongLine[] = []

  for (let index = 0; index < rawLines.length; index++) {
    const raw = rawLines[index]
    const trimmed = raw.trim()

    if (!trimmed) {
      if (lines.length > 0 && lines[lines.length - 1].kind !== 'blank') {
        lines.push({ kind: 'blank', text: '' })
      }
      continue
    }

    if (isSectionHeader(raw)) {
      const header = trimmed.startsWith('[')
        ? trimmed.slice(1, -1).trim()
        : trimmed.replace(/:$/, '').trim()
      lines.push({ kind: 'header', text: header })
      continue
    }

    const chords = extractChordTokens(raw)
    if (chords) {
      const next = rawLines[index + 1]
      const hasLyricNext =
        next !== undefined &&
        next.trim().length > 0 &&
        !isSectionHeader(next) &&
        extractChordTokens(next) === null

      if (hasLyricNext) {
        lines.push({
          kind: 'lyric',
          text: next.replace(/\s+$/, ''),
          chords,
        })
        index++
      } else {
        lines.push({ kind: 'instrumental', text: trimmed, chords })
      }
      continue
    }

    lines.push({ kind: 'lyric', text: raw, chords: [] })
  }

  while (lines.length > 0 && lines[0].kind === 'blank') lines.shift()
  while (lines.length > 0 && lines[lines.length - 1].kind === 'blank') lines.pop()

  return lines
}
