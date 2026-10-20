import { describe, expect, it } from 'vitest'
import { chromaFromSpectrum } from '../src/audio/spectrum'

function makeSpectrum(
  peaks: Array<{ frequency: number; decibels: number }>,
  sampleRate = 48000,
  fftSize = 8192,
): Float32Array {
  const data = new Float32Array(fftSize / 2).fill(-120)
  const binWidth = sampleRate / fftSize
  for (const peak of peaks) {
    const index = Math.round(peak.frequency / binWidth)
    if (index < 1 || index >= data.length - 1) continue
    data[index] = peak.decibels
    data[index - 1] = peak.decibels - 18
    data[index + 1] = peak.decibels - 18
  }
  return data
}

describe('spectrum chroma', () => {
  it('finds the pitch classes of an A minor chord', () => {
    const spectrum = makeSpectrum([
      { frequency: 110, decibels: -20 },
      { frequency: 130.81, decibels: -22 },
      { frequency: 164.81, decibels: -23 },
      { frequency: 220, decibels: -28 },
      { frequency: 261.63, decibels: -30 },
      { frequency: 329.63, decibels: -32 },
    ])
    const chroma = chromaFromSpectrum(spectrum, 48000, 8192)
    expect(chroma[9]).toBeGreaterThan(chroma[0])
    expect(chroma[0]).toBeGreaterThan(chroma[1])
    expect(chroma[4]).toBeGreaterThan(chroma[1])
    const top = [...chroma]
      .map((value, index) => ({ value, index }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 3)
      .map((item) => item.index)
      .sort((a, b) => a - b)
    expect(top).toEqual([0, 4, 9])
  })

  it('returns an empty chroma for silence', () => {
    const chroma = chromaFromSpectrum(new Float32Array(4096).fill(-120), 48000, 8192)
    expect([...chroma].every((value) => value === 0)).toBe(true)
  })

  it('ignores weak noise next to a strong peak', () => {
    const spectrum = makeSpectrum([{ frequency: 440, decibels: -20 }])
    const chroma = chromaFromSpectrum(spectrum, 48000, 8192)
    expect(chroma[9]).toBeGreaterThan(0.9)
  })
})
