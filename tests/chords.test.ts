import { describe, expect, it } from 'vitest'
import {
  extractChordTokens,
  isChordLine,
  isSectionHeader,
  parseSong,
} from '../src/chords/detect'
import { buildChunks } from '../src/chords/render'
import {
  inferAccidentalPreference,
  transposeChord,
  transposeKey,
  transposeLines,
} from '../src/chords/transpose'

describe('chord detection', () => {
  it('recognizes chord lines', () => {
    expect(isChordLine('Am C G D')).toBe(true)
    expect(isChordLine('Am        C')).toBe(true)
    expect(isChordLine('| Am | C | G |')).toBe(true)
    expect(isChordLine('F#m7b5  Bb/D  N.C.')).toBe(true)
    expect(isChordLine('Bbmaj7 Cadd9 Dsus4')).toBe(true)
    expect(isChordLine('x2')).toBe(false)
  })

  it('does not treat lyrics as chords', () => {
    expect(isChordLine('Текст песни')).toBe(false)
    expect(isChordLine('А где-то там')).toBe(false)
    expect(isChordLine('Am C текст')).toBe(false)
  })

  it('extracts column positions', () => {
    expect(extractChordTokens('Am   C')).toEqual([
      { text: 'Am', col: 0 },
      { text: 'C', col: 5 },
    ])
    expect(extractChordTokens('| Am | C |')).toEqual([
      { text: 'Am', col: 2 },
      { text: 'C', col: 7 },
    ])
  })

  it('recognizes section headers', () => {
    expect(isSectionHeader('Припев')).toBe(true)
    expect(isSectionHeader('[Куплет 1]')).toBe(true)
    expect(isSectionHeader('Chorus 2')).toBe(true)
    expect(isSectionHeader('Am C')).toBe(false)
    expect(isSectionHeader('Просто строка текста')).toBe(false)
  })
})

describe('song parsing', () => {
  it('pairs chord lines with lyric lines', () => {
    const lines = parseSong(`Am        C
Текст песни

Припев
F   G
Припев идёт

Am  C  G  D`)

    expect(lines[0]).toMatchObject({ kind: 'lyric', text: 'Текст песни' })
    expect(lines[0].chords?.map((chord) => chord.text)).toEqual(['Am', 'C'])
    expect(lines[1]).toEqual({ kind: 'blank', text: '' })
    expect(lines[2]).toEqual({ kind: 'header', text: 'Припев' })
    expect(lines[3]).toMatchObject({ kind: 'lyric', text: 'Припев идёт' })
    expect(lines[4]).toEqual({ kind: 'blank', text: '' })
    expect(lines[5]).toMatchObject({ kind: 'instrumental' })
    expect(lines[5].chords?.map((chord) => chord.text)).toEqual(['Am', 'C', 'G', 'D'])
  })

  it('keeps unpaired chord lines as instrumental', () => {
    const lines = parseSong('Интро\nAm C G D\n\nКуплет\nAm\nТекст')
    expect(lines).toEqual([
      { kind: 'header', text: 'Интро' },
      { kind: 'instrumental', text: 'Am C G D', chords: [
        { text: 'Am', col: 0 },
        { text: 'C', col: 3 },
        { text: 'G', col: 5 },
        { text: 'D', col: 7 },
      ] },
      { kind: 'blank', text: '' },
      { kind: 'header', text: 'Куплет' },
      { kind: 'lyric', text: 'Текст', chords: [{ text: 'Am', col: 0 }] },
    ])
  })
})

describe('transposition', () => {
  it('moves chords by semitones', () => {
    expect(transposeChord('C', 2)).toBe('D')
    expect(transposeChord('Am', 2)).toBe('Bm')
    expect(transposeChord('B', 1)).toBe('C')
    expect(transposeChord('C', -1)).toBe('B')
    expect(transposeChord('F#', 1)).toBe('G')
    expect(transposeChord('C#m7b5', 1)).toBe('Dm7b5')
    expect(transposeChord('Am7', 3)).toBe('Cm7')
    expect(transposeChord('N.C.', 2)).toBe('N.C.')
    expect(transposeChord('D/F#', 2)).toBe('E/G#')
    expect(transposeChord('Bbmaj7', 2, 'flat')).toBe('Cmaj7')
  })

  it('respects accidental preference', () => {
    expect(transposeChord('C', 1, 'flat')).toBe('Db')
    expect(transposeChord('C', 1, 'sharp')).toBe('C#')
    expect(transposeChord('Bb', 2, 'flat')).toBe('C')
    expect(transposeChord('F', 2, 'flat')).toBe('G')
  })

  it('transposes keys and song lines', () => {
    expect(transposeKey('Am', 2)).toBe('Bm')
    expect(transposeKey('F#m', 1)).toBe('Gm')
    const lines = parseSong('Am C\nТекст')
    const transposed = transposeLines(lines, 2)
    expect(transposed[0].chords?.map((chord) => chord.text)).toEqual(['Bm', 'D'])
    expect(transposed[0].text).toBe('Текст')
  })

  it('infers preferences from key or content', () => {
    expect(inferAccidentalPreference('Bb', '')).toBe('flat')
    expect(inferAccidentalPreference('F#m', '')).toBe('sharp')
    expect(inferAccidentalPreference('', 'Bb Eb F')).toBe('flat')
    expect(inferAccidentalPreference('', 'F# C# G#')).toBe('sharp')
  })
})

describe('chunk building', () => {
  it('splits by words and keeps chord positions', () => {
    const chunks = buildChunks('Текст песни', [
      { text: 'Am', col: 0 },
      { text: 'C', col: 6 },
    ])
    expect(chunks).toEqual([
      { text: 'Текст', chords: ['Am'], continuation: false },
      { text: 'песни', chords: ['C'], continuation: false },
    ])
  })

  it('splits a word at an internal chord change', () => {
    const chunks = buildChunks('любовь', [
      { text: 'Am', col: 0 },
      { text: 'C', col: 3 },
    ])
    expect(chunks).toEqual([
      { text: 'люб', chords: ['Am'], continuation: false },
      { text: 'овь', chords: ['C'], continuation: true },
    ])
  })

  it('attaches chords in gaps to the next word', () => {
    const chunks = buildChunks('Я тебя', [
      { text: 'Am', col: 0 },
      { text: 'C', col: 1 },
    ])
    expect(chunks).toEqual([
      { text: 'Я', chords: ['Am'], continuation: false },
      { text: 'тебя', chords: ['C'], continuation: false },
    ])
  })
})
