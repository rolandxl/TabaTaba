const MIN_FREQUENCY = 60
const MAX_FREQUENCY = 1800
const PEAK_RANGE_DB = 28
const NOISE_FLOOR_RATIO = 0.08
const EMPHASIS = 1.2

export function chromaFromSpectrum(
  frequencyData: ArrayLike<number>,
  sampleRate: number,
  fftSize: number,
  a4 = 440,
): Float32Array {
  const chroma = new Float32Array(12)
  if (frequencyData.length < 4 || fftSize <= 0 || sampleRate <= 0) return chroma

  const binWidth = sampleRate / fftSize
  const firstBin = Math.max(1, Math.ceil(MIN_FREQUENCY / binWidth))
  const lastBin = Math.min(frequencyData.length - 2, Math.floor(MAX_FREQUENCY / binWidth))

  let maxDb = -Infinity
  for (let index = firstBin; index <= lastBin; index++) {
    const value = frequencyData[index]
    if (Number.isFinite(value)) maxDb = Math.max(maxDb, value)
  }
  if (!Number.isFinite(maxDb)) return chroma

  const floor = maxDb - PEAK_RANGE_DB
  for (let index = firstBin; index <= lastBin; index++) {
    const decibels = frequencyData[index]
    if (!Number.isFinite(decibels) || decibels < floor) continue
    if (decibels < frequencyData[index - 1] || decibels <= frequencyData[index + 1]) continue

    const frequency = index * binWidth
    const magnitude = Math.pow(10, decibels / 20)
    const midi = 69 + 12 * Math.log2(frequency / a4)
    const pitchClass = ((Math.round(midi) % 12) + 12) % 12
    chroma[pitchClass] += magnitude
  }

  let max = 0
  for (let index = 0; index < 12; index++) max = Math.max(max, chroma[index])
  if (max <= 0) return chroma

  let norm = 0
  for (let index = 0; index < 12; index++) {
    const relative = chroma[index] / max
    chroma[index] = relative < NOISE_FLOOR_RATIO ? 0 : Math.pow(relative, EMPHASIS)
    norm += chroma[index] * chroma[index]
  }
  if (norm > 0) {
    const scale = 1 / Math.sqrt(norm)
    for (let index = 0; index < 12; index++) chroma[index] *= scale
  }
  return chroma
}
