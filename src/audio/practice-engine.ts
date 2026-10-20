import type { FollowSensitivity } from '../types'
import { matchScore, profileScore, samePitchClasses } from './chord-math'

export type PracticeFeedback = 'idle' | 'listening' | 'matched' | 'mismatch'

export interface PracticeChord {
  displayed: string
  pitchClasses: number[]
  profile?: number[]
  root?: number
}

export interface PracticeResult {
  feedback: PracticeFeedback
  focusIndex: number
  score: number
  nextScore: number
  advanced: boolean
}

export interface PracticeEngineOptions {
  minEnergy?: number
  matchThreshold?: number
  mismatchThreshold?: number
  matchHoldMs?: number
  mismatchHoldMs?: number
  advanceThreshold?: number
  advanceMargin?: number
  advanceHoldMs?: number
  minAdvanceIntervalMs?: number
  lookahead?: number
}

export const FOLLOW_PRESETS: Record<FollowSensitivity, PracticeEngineOptions> = {
  careful: {
    lookahead: 2,
    advanceThreshold: 0.76,
    advanceMargin: 0.08,
    advanceHoldMs: 450,
    minAdvanceIntervalMs: 650,
  },
  balanced: {
    lookahead: 3,
    advanceThreshold: 0.72,
    advanceMargin: 0.06,
    advanceHoldMs: 350,
    minAdvanceIntervalMs: 420,
  },
  responsive: {
    lookahead: 4,
    advanceThreshold: 0.68,
    advanceMargin: 0.05,
    advanceHoldMs: 280,
    minAdvanceIntervalMs: 320,
  },
}

const DEFAULT_OPTIONS: Required<PracticeEngineOptions> = {
  minEnergy: 0.0015,
  matchThreshold: 0.68,
  mismatchThreshold: 0.45,
  matchHoldMs: 300,
  mismatchHoldMs: 800,
  advanceThreshold: 0.72,
  advanceMargin: 0.06,
  advanceHoldMs: 350,
  minAdvanceIntervalMs: 420,
  lookahead: 3,
}

export class PracticeEngine {
  private focusIndex = 0
  private matchedSince: number | null = null
  private mismatchSince: number | null = null
  private candidateIndex: number | null = null
  private candidateSince: number | null = null
  private lastAdvanceAt = 0
  private readonly options: Required<PracticeEngineOptions>

  constructor(
    private readonly chords: readonly PracticeChord[],
    options: PracticeEngineOptions = {},
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options }
  }

  get focus(): number {
    return this.focusIndex
  }

  setFocus(index: number, now = performance.now()): void {
    if (this.chords.length === 0) {
      this.focusIndex = 0
      return
    }
    this.focusIndex = Math.max(0, Math.min(this.chords.length - 1, index))
    this.resetTimers()
    this.lastAdvanceAt = now
  }

  reset(): void {
    this.focusIndex = 0
    this.resetTimers()
    this.lastAdvanceAt = 0
  }

  update(
    chroma: ArrayLike<number>,
    energy: number,
    now: number,
    allowAdvance: boolean,
  ): PracticeResult {
    const current = this.chords[this.focusIndex]
    if (!current || energy < this.options.minEnergy) {
      this.resetTimers()
      return {
        feedback: 'idle',
        focusIndex: this.focusIndex,
        score: 0,
        nextScore: 0,
        advanced: false,
      }
    }

    const score = practiceChordScore(chroma, current)
    const next = this.chords[this.focusIndex + 1]
    const nextScore = next ? practiceChordScore(chroma, next) : 0

    if (score >= this.options.matchThreshold) {
      this.mismatchSince = null
      if (this.matchedSince === null) this.matchedSince = now
    } else {
      this.matchedSince = null
      if (score < this.options.mismatchThreshold) {
        if (this.mismatchSince === null) this.mismatchSince = now
      } else {
        this.mismatchSince = null
      }
    }

    let feedback: PracticeFeedback = 'listening'
    if (score >= this.options.matchThreshold) {
      if (now - (this.matchedSince ?? now) >= this.options.matchHoldMs) {
        feedback = 'matched'
      }
    } else if (
      this.mismatchSince !== null &&
      now - this.mismatchSince >= this.options.mismatchHoldMs
    ) {
      feedback = 'mismatch'
    }

    const maxIndex = Math.min(
      this.chords.length - 1,
      this.focusIndex + this.options.lookahead,
    )
    let bestIndex = this.focusIndex
    let bestScore = score

    for (let index = this.focusIndex + 1; index <= maxIndex; index++) {
      const candidate = this.chords[index]
      if (!candidate) continue
      if (samePitchClasses(current.pitchClasses, candidate.pitchClasses)) continue
      const candidateScore = practiceChordScore(chroma, candidate)
      if (candidateScore > bestScore) {
        bestScore = candidateScore
        bestIndex = index
      }
    }

    const candidate = bestIndex > this.focusIndex ? this.chords[bestIndex] : null
    if (allowAdvance && candidate) {
      const distance = bestIndex - this.focusIndex
      const overlap = pitchOverlap(current.pitchClasses, candidate.pitchClasses)
      const requiredMargin =
        this.options.advanceMargin + (1 - overlap) * this.options.advanceMargin
      const distancePenalty = Math.max(0, distance - 1) * 0.01
      const candidateReady =
        bestScore >= this.options.advanceThreshold + distancePenalty &&
        bestScore - score >= requiredMargin

      if (candidateReady) {
        if (this.candidateIndex !== bestIndex) {
          this.candidateIndex = bestIndex
          this.candidateSince = now
        }
        if (
          this.candidateSince !== null &&
          now - this.candidateSince >= this.options.advanceHoldMs &&
          now - this.lastAdvanceAt >= this.options.minAdvanceIntervalMs
        ) {
          this.focusIndex = bestIndex
          this.lastAdvanceAt = now
          this.resetTimers()
          return {
            feedback: 'listening',
            focusIndex: this.focusIndex,
            score,
            nextScore,
            advanced: true,
          }
        }
      } else {
        this.candidateIndex = null
        this.candidateSince = null
      }
    } else {
      this.candidateIndex = null
      this.candidateSince = null
    }

    return {
      feedback,
      focusIndex: this.focusIndex,
      score,
      nextScore,
      advanced: false,
    }
  }

  private resetTimers(): void {
    this.matchedSince = null
    this.mismatchSince = null
    this.candidateIndex = null
    this.candidateSince = null
  }
}

export function practiceChordScore(chroma: ArrayLike<number>, chord: PracticeChord): number {
  const template = matchScore(chroma, chord.pitchClasses)
  if (!chord.profile || chord.profile.length !== 12) return template

  const profile = profileScore(chroma, chord.profile)
  if (chord.root === undefined) {
    return profile * 0.6 + template * 0.4
  }

  let total = 0
  for (let index = 0; index < 12; index++) {
    total += Math.max(0, chroma[index] ?? 0)
  }
  const rootShare =
    total > 0 ? Math.max(0, chroma[chord.root] ?? 0) / total : 0

  return profile * 0.55 + template * 0.35 + rootShare * 0.1
}

function pitchOverlap(a: readonly number[], b: readonly number[]): number {
  if (a.length === 0 || b.length === 0) return 0
  const left = new Set(a)
  const right = new Set(b)
  let intersection = 0
  for (const pitchClass of left) {
    if (right.has(pitchClass)) intersection += 1
  }
  const union = left.size + right.size - intersection
  return union > 0 ? intersection / union : 0
}

