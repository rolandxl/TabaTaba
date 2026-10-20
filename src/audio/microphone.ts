import { chromaFromSpectrum } from './spectrum'

export interface MicrophoneFrame {
  chroma: Float32Array
  energy: number
  rawEnergy: number
  threshold: number
  noiseFloor: number
  onset: boolean
  sampleRate: number
  timestamp: number
}
export interface MicrophoneOptions {
  noiseFloor?: number
  threshold?: number
  a4?: number
}

export type MicrophoneErrorCode =
  | 'unsupported'
  | 'insecure'
  | 'denied'
  | 'not-found'
  | 'error'

export class MicrophoneError extends Error {
  constructor(
    message: string,
    readonly code: MicrophoneErrorCode,
  ) {
    super(message)
    this.name = 'MicrophoneError'
  }
}

export interface MicrophoneSession {
  stop(): void
}

const DEFAULT_NOISE_FLOOR = 0.0015
const DEFAULT_THRESHOLD = 0.005
const DEFAULT_A4 = 440
const ENVELOPE_RELEASE = 0.95
const CHROMA_HOLD_MS = 700

export function isMicrophoneSupported(): boolean {
  return Boolean(window.isSecureContext && navigator.mediaDevices?.getUserMedia)
}

export async function startMicrophone(
  onFrame: (frame: MicrophoneFrame) => void,
  options: MicrophoneOptions = {},
): Promise<MicrophoneSession> {
  if (!window.isSecureContext) {
    throw new MicrophoneError('Микрофон работает только по HTTPS или на localhost.', 'insecure')
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new MicrophoneError('Браузер не поддерживает доступ к микрофону.', 'unsupported')
  }

  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    })
  } catch (error) {
    const name = error instanceof DOMException ? error.name : ''
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      throw new MicrophoneError('Нет доступа к микрофону.', 'denied')
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      throw new MicrophoneError('Микрофон не найден.', 'not-found')
    }
    throw new MicrophoneError('Не удалось включить микрофон.', 'error')
  }

  let context: AudioContext
  try {
    context = new AudioContext()
  } catch {
    stream.getTracks().forEach((track) => track.stop())
    throw new MicrophoneError('Не удалось запустить обработку звука.', 'error')
  }

  let source: MediaStreamAudioSourceNode
  let analyser: AnalyserNode
  let sink: GainNode
  try {
    await context.resume()
    source = context.createMediaStreamSource(stream)
    analyser = context.createAnalyser()
    analyser.fftSize = 8192
    analyser.smoothingTimeConstant = 0.65

    sink = context.createGain()
    sink.gain.value = 0
    source.connect(analyser)
    analyser.connect(sink)
    sink.connect(context.destination)
  } catch {
    stream.getTracks().forEach((track) => track.stop())
    void context.close().catch(() => undefined)
    throw new MicrophoneError('Не удалось запустить обработку звука.', 'error')
  }

  const timeData = new Float32Array(analyser.fftSize)
  const frequencyData = new Float32Array(analyser.frequencyBinCount)
  const heldChroma = new Float32Array(12)
  const smoothedChroma = new Float32Array(12)
  let hasSmoothed = false
  let envelope = 0
  let previousRaw = 0
  let lastOnsetAt = 0
  let holdUntil = 0
  let stopped = false

  const tick = (): void => {
    if (stopped) return
    const now = performance.now()
    const threshold = clamp(
      options.threshold ?? DEFAULT_THRESHOLD,
      0.0005,
      0.2,
    )
    const noiseFloor = clamp(
      options.noiseFloor ?? DEFAULT_NOISE_FLOOR,
      0,
      0.1,
    )
    const a4 = clamp(options.a4 ?? DEFAULT_A4, 400, 480)

    analyser.getFloatTimeDomainData(timeData)
    let sum = 0
    for (let index = 0; index < timeData.length; index++) {
      sum += timeData[index] * timeData[index]
    }
    const rawEnergy = Math.sqrt(sum / timeData.length)
    envelope = rawEnergy > envelope ? rawEnergy : envelope * ENVELOPE_RELEASE

    analyser.getFloatFrequencyData(frequencyData)
    const sampleRate = context.sampleRate
    const chroma = chromaFromSpectrum(frequencyData, sampleRate, analyser.fftSize, a4)

    const onset =
      rawEnergy >= threshold &&
      (rawEnergy > previousRaw * 1.25 || rawEnergy > threshold * 2) &&
      now - lastOnsetAt > 240

    if (onset) lastOnsetAt = now

    if (rawEnergy >= threshold * 0.8) {
      if (!hasSmoothed) {
        smoothedChroma.set(chroma)
        hasSmoothed = true
      } else {
        const blend = onset ? 0.7 : 0.45
        for (let index = 0; index < 12; index++) {
          smoothedChroma[index] =
            smoothedChroma[index] * (1 - blend) + chroma[index] * blend
        }
        normalize(smoothedChroma)
      }
      heldChroma.set(smoothedChroma)
      holdUntil = now + CHROMA_HOLD_MS
    }

    const outputChroma = new Float32Array(12)
    if (now < holdUntil) {
      outputChroma.set(heldChroma)
    } else if (rawEnergy >= threshold * 0.8) {
      outputChroma.set(smoothedChroma)
    }

    previousRaw = rawEnergy

    onFrame({
      chroma: outputChroma,
      energy: now < holdUntil ? Math.max(envelope, threshold * 1.01) : rawEnergy,
      rawEnergy,
      threshold,
      noiseFloor,
      onset,
      sampleRate,
      timestamp: now,
    })
  }

  const interval = window.setInterval(tick, 80)
  tick()

  return {
    stop() {
      if (stopped) return
      stopped = true
      window.clearInterval(interval)
      source.disconnect()
      analyser.disconnect()
      sink.disconnect()
      stream.getTracks().forEach((track) => track.stop())
      void context.close().catch(() => undefined)
    },
  }
}

function normalize(chroma: Float32Array): void {
  let norm = 0
  for (let index = 0; index < 12; index++) norm += chroma[index] * chroma[index]
  if (norm === 0) return
  const scale = 1 / Math.sqrt(norm)
  for (let index = 0; index < 12; index++) chroma[index] *= scale
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
