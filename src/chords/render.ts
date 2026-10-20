import { parseSong, type ChordToken, type SongLine } from './detect'
import { transposeLines, type AccidentalPreference } from './transpose'

export interface RenderChunk {
  text: string
  chords: string[]
  continuation: boolean
}

export interface RenderOptions {
  transpose?: number
  preference?: AccidentalPreference
}

export function buildChunks(text: string, chords: ChordToken[]): RenderChunk[] {
  const words = Array.from(text.matchAll(/\S+/g)).map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }))

  if (words.length === 0) {
    return [
      {
        text,
        chords: chords.map((chord) => chord.text),
        continuation: false,
      },
    ]
  }

  const assigned: ChordToken[][] = words.map(() => [])
  for (const chord of chords) {
    let index = words.findIndex((word) => chord.col < word.end)
    if (index === -1) index = words.length - 1
    assigned[index].push(chord)
  }

  const chunks: RenderChunk[] = []

  words.forEach((word, wordIndex) => {
    const wordChords = assigned[wordIndex].slice().sort((a, b) => a.col - b.col)
    const breaks = Array.from(
      new Set(
        wordChords
          .map((chord) => chord.col)
          .filter((col) => col > word.start && col < word.end),
      ),
    ).sort((a, b) => a - b)

    const boundaries = [word.start, ...breaks, word.end]
    for (let index = 0; index < boundaries.length - 1; index++) {
      const start = boundaries[index]
      const end = boundaries[index + 1]
      const isFirst = index === 0
      const isLast = index === boundaries.length - 2
      const segmentChords = wordChords
        .filter((chord) => {
          if (isFirst && chord.col < start) return true
          if (chord.col >= start && chord.col < end) return true
          if (isLast && chord.col >= end) return true
          return false
        })
        .map((chord) => chord.text)

      chunks.push({
        text: text.slice(start, end),
        chords: segmentChords,
        continuation: !isFirst,
      })
    }
  })

  return chunks
}

export function renderSong(content: string, options: RenderOptions = {}): DocumentFragment {
  const lines = parseSong(content)
  const transposed = transposeLines(
    lines,
    options.transpose ?? 0,
    options.preference ?? 'sharp',
  )
  return renderLines(transposed)
}

export function renderLines(lines: SongLine[]): DocumentFragment {
  const fragment = document.createDocumentFragment()

  lines.forEach((line, lineIndex) => {
    if (line.kind === 'blank') {
      const blank = document.createElement('div')
      blank.className = 'song-blank'
      blank.dataset.lineIndex = String(lineIndex)
      fragment.append(blank)
      return
    }

    if (line.kind === 'header') {
      const header = document.createElement('div')
      header.className = 'song-header'
      header.dataset.lineIndex = String(lineIndex)
      header.textContent = line.text
      fragment.append(header)
      return
    }

    if (line.kind === 'instrumental') {
      fragment.append(renderInstrumental(line, lineIndex))
      return
    }

    fragment.append(renderLyric(line, lineIndex))
  })

  return fragment
}

function renderLyric(line: SongLine, lineIndex: number): HTMLElement {
  if (!line.chords || line.chords.length === 0) {
    const element = document.createElement('div')
    element.className = 'lyric-line'
    element.dataset.lineIndex = String(lineIndex)
    element.textContent = line.text
    return element
  }

  const container = document.createElement('div')
  container.className = 'chord-line'
  container.dataset.lineIndex = String(lineIndex)
  const chunks = buildChunks(line.text, line.chords)
  let word: HTMLElement | null = null

  for (const chunk of chunks) {
    if (!word || !chunk.continuation) {
      word = document.createElement('span')
      word.className = 'word'
      container.append(word)
    }

    const piece = document.createElement('span')
    piece.className = 'chunk'

    const chordRow = document.createElement('span')
    chordRow.className = 'chunk-chords'
    chunk.chords.forEach((chord, index) => {
      if (index > 0) chordRow.append(' ')
      const token = document.createElement('span')
      token.className = 'chord-token'
      token.dataset.chord = chord
      token.dataset.chordLineIndex = String(lineIndex)
      token.textContent = chord
      chordRow.append(token)
    })

    const lyricRow = document.createElement('span')
    lyricRow.className = 'chunk-lyrics'
    lyricRow.textContent = chunk.text

    piece.append(chordRow, lyricRow)
    word.append(piece)
  }

  return container
}

function renderInstrumental(line: SongLine, lineIndex: number): HTMLElement {
  const element = document.createElement('div')
  element.className = 'instrumental'
  element.dataset.lineIndex = String(lineIndex)
  const tokens = line.chords ?? []
  if (tokens.length === 0) {
    element.textContent = line.text
    return element
  }
  for (const token of tokens) {
    const span = document.createElement('span')
    span.className = 'chord-token'
    span.dataset.chord = token.text
    span.dataset.chordLineIndex = String(lineIndex)
    span.textContent = token.text
    element.append(span)
  }
  return element
}
