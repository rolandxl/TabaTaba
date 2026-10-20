export function percentile(values: readonly number[], ratio: number): number {
  if (values.length === 0) return 0
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b)
  if (sorted.length === 0) return 0
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor((sorted.length - 1) * ratio)),
  )
  return sorted[index]
}

export function computeNoiseCalibration(rawEnergies: readonly number[]): {
  noiseFloor: number
  threshold: number
} {
  const values = rawEnergies.filter((value) => Number.isFinite(value) && value >= 0)
  if (values.length < 5) {
    return { noiseFloor: 0.0015, threshold: 0.005 }
  }
  const noiseFloor = Math.min(0.05, Math.max(0.0004, percentile(values, 0.6)))
  const threshold = Math.min(0.08, Math.max(0.0015, noiseFloor * 3.2))
  return { noiseFloor, threshold }
}

export function normalizeChroma(values: ArrayLike<number>): number[] | null {
  if (values.length !== 12) return null
  const result = new Array<number>(12).fill(0)
  let norm = 0
  for (let index = 0; index < 12; index++) {
    const value = Math.max(0, Number.isFinite(values[index]) ? values[index] : 0)
    result[index] = value
    norm += value * value
  }
  if (norm === 0) return null
  const scale = 1 / Math.sqrt(norm)
  return result.map((value) => value * scale)
}

export function buildChordProfile(chromas: readonly ArrayLike<number>[]): number[] | null {
  if (chromas.length === 0) return null
  const frames: number[][] = []

  for (const chroma of chromas) {
    if (chroma.length !== 12) continue
    let norm = 0
    for (let index = 0; index < 12; index++) {
      const value = Math.max(0, Number.isFinite(chroma[index]) ? chroma[index] : 0)
      norm += value * value
    }
    if (norm === 0) continue
    const scale = 1 / Math.sqrt(norm)
    const frame = new Array<number>(12)
    for (let index = 0; index < 12; index++) {
      frame[index] = Math.max(0, chroma[index] ?? 0) * scale
    }
    frames.push(frame)
  }

  if (frames.length === 0) return null

  const median = new Array<number>(12).fill(0)
  for (let pitchClass = 0; pitchClass < 12; pitchClass++) {
    const values = frames
      .map((frame) => frame[pitchClass])
      .sort((a, b) => a - b)
    const middle = Math.floor(values.length / 2)
    median[pitchClass] =
      values.length % 2 === 1
        ? values[middle]
        : (values[middle - 1] + values[middle]) / 2
  }

  return normalizeChroma(median)
}
