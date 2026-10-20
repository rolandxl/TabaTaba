import { describe, expect, it } from 'vitest'
import { inferTitle, keyLabel, transposeLabel } from '../src/song-utils'

describe('song helpers', () => {
  it('infers a title from the first lyric line', () => {
    expect(inferTitle('Am C\nУтро в городе\nТекст')).toBe('Утро в городе')
    expect(inferTitle('Припев\nF G\nПой со мной')).toBe('Пой со мной')
    expect(inferTitle('Am C\nG D')).toBe('Без названия')
  })

  it('labels transposed keys', () => {
    expect(keyLabel('Am', 0, 'sharp')).toBe('Am')
    expect(keyLabel('Am', 2, 'sharp')).toBe('Am → Bm')
    expect(keyLabel('', 2, 'sharp')).toBe('')
    expect(keyLabel('ля минор', 2, 'sharp')).toBe('ля минор')
  })

  it('formats transpose offsets', () => {
    expect(transposeLabel(0)).toBe('0')
    expect(transposeLabel(2)).toBe('+2')
    expect(transposeLabel(-3)).toBe('−3')
  })
})
