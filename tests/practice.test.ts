import { describe, expect, it } from 'vitest'
import {
  bestChords,
  chordPitchClasses,
  matchScore,
  profileScore,
  samePitchClasses,
} from '../src/audio/chord-math'
import {
  buildChordProfile,
  computeNoiseCalibration,
  percentile,
} from '../src/audio/calibration'
import {
  FOLLOW_PRESETS,
  PracticeEngine,
  practiceChordScore,
} from '../src/audio/practice-engine'

function chromaFor(pitchClasses: readonly number[]): Float32Array {
  const chroma = new Float32Array(12)
  for (const pitchClass of pitchClasses) chroma[pitchClass] = 1
  return chroma
}

describe('chord math', () => {
  it('parses common chord qualities', () => {
    expect(chordPitchClasses('C')).toEqual([0, 4, 7])
    expect(chordPitchClasses('Am')).toEqual([0, 4, 9])
    expect(chordPitchClasses('Cmaj7')).toEqual([0, 4, 7, 11])
    expect(chordPitchClasses('G7')).toEqual([2, 5, 7, 11])
    expect(chordPitchClasses('D/F#')).toEqual([2, 6, 9])
    expect(chordPitchClasses('C#m7b5')).toEqual([1, 4, 7, 11])
    expect(chordPitchClasses('N.C.')).toBeNull()
  })

  it('applies capo', () => {
    expect(chordPitchClasses('C', 2)).toEqual([2, 6, 9])
    expect(chordPitchClasses('Bb', 2)).toEqual([0, 4, 7])
  })

  it('scores chroma against chord templates', () => {
    const cMajor = chromaFor([0, 4, 7])
    const aMinor = chromaFor([0, 4, 9])
    expect(matchScore(cMajor, [0, 4, 7])).toBeCloseTo(1, 5)
    expect(matchScore(aMinor, [0, 4, 9])).toBeCloseTo(1, 5)
    expect(matchScore(cMajor, [0, 4, 9])).toBeGreaterThan(0.6)
    expect(matchScore(cMajor, [2, 6, 9])).toBeLessThan(0.5)
  })

  it('compares pitch class sets', () => {
    expect(samePitchClasses([0, 4, 7], [0, 4, 7])).toBe(true)
    expect(samePitchClasses([0, 4, 7], [0, 4, 9])).toBe(false)
  })

  it('distinguishes seventh chords from their base triads', () => {
    const e = chordPitchClasses('E') ?? []
    const e7 = chordPitchClasses('E7') ?? []
    const eChroma = chromaFor([4, 8, 11])
    const e7Chroma = chromaFor([2, 4, 8, 11])
    expect(matchScore(e7Chroma, e7)).toBeGreaterThan(matchScore(e7Chroma, e))
    expect(matchScore(eChroma, e)).toBeGreaterThan(matchScore(eChroma, e7))
    expect(matchScore(eChroma, e7)).toBeLessThan(0.9)
  })

  it('combines learned profiles with chord templates', () => {
    const fChroma = chromaFor([5, 9, 0])
    const amProfile = Array.from(chromaFor([9, 0, 4]))
    const fProfile = Array.from(chromaFor([5, 9, 0]))
    const fScore = practiceChordScore(fChroma, {
      displayed: 'F',
      pitchClasses: [5, 9, 0],
      profile: fProfile,
      root: 5,
    })
    const amScore = practiceChordScore(fChroma, {
      displayed: 'Am',
      pitchClasses: [9, 0, 4],
      profile: amProfile,
      root: 9,
    })
    expect(fScore).toBeGreaterThan(amScore)
    expect(fScore).toBeGreaterThan(0.9)

    const sharedProfile = Array.from(chromaFor([5, 9, 0, 4]))
    expect(
      practiceChordScore(fChroma, {
        displayed: 'F',
        pitchClasses: [5, 9, 0],
        profile: sharedProfile,
        root: 5,
      }),
    ).toBeGreaterThan(
      practiceChordScore(fChroma, {
        displayed: 'Am',
        pitchClasses: [9, 0, 4],
        profile: sharedProfile,
        root: 9,
      }),
    )
  })

  it('finds the best chord and uses learned profiles', () => {
    const cMajor = chromaFor([0, 4, 7])
    expect(bestChords(cMajor, {}, 1)[0].name).toBe('C')

    const learned = [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0]
    expect(bestChords(chromaFor([9]), { Am: learned }, 1)[0]).toMatchObject({
      name: 'Am',
      score: 1,
    })
    expect(profileScore(chromaFor([9]), learned)).toBeCloseTo(1, 5)
  })
})

describe('microphone calibration', () => {
  it('computes a threshold from the noise floor', () => {
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2)
    const calibration = computeNoiseCalibration([0.001, 0.001, 0.002, 0.002, 0.0015])
    expect(calibration.noiseFloor).toBeGreaterThanOrEqual(0.001)
    expect(calibration.threshold).toBeGreaterThan(calibration.noiseFloor)
  })

  it('builds a normalized chord profile', () => {
    const profile = buildChordProfile([chromaFor([0, 4, 7]), chromaFor([0, 4, 7])])
    expect(profile).not.toBeNull()
    expect(profile?.[0]).toBeGreaterThan(profile?.[1] ?? 0)
    const norm = profile?.reduce((sum, value) => sum + value * value, 0) ?? 0
    expect(norm).toBeCloseTo(1, 5)
    expect(buildChordProfile([])).toBeNull()
  })

  it('ignores a single outlier frame when building a profile', () => {
    const profile = buildChordProfile([
      chromaFor([0, 4, 7]),
      chromaFor([0, 4, 7]),
      chromaFor([0, 4, 7]),
      chromaFor([1, 5, 8]),
    ])
    expect(profile?.[0]).toBeGreaterThan(profile?.[1] ?? 0)
    expect(profile?.[1] ?? 0).toBe(0)
  })
})

describe('practice engine', () => {
  const chords = [
    { displayed: 'C', pitchClasses: [0, 4, 7] },
    { displayed: 'G', pitchClasses: [2, 7, 11] },
    { displayed: 'Am', pitchClasses: [0, 4, 9] },
  ]

  it('matches the current chord with hysteresis', () => {
    const engine = new PracticeEngine(chords)
    const c = chromaFor([0, 4, 7])
    expect(engine.update(c, 0.05, 0, true).feedback).toBe('listening')
    expect(engine.update(c, 0.05, 150, true).feedback).toBe('listening')
    expect(engine.update(c, 0.05, 350, true).feedback).toBe('matched')
  })

  it('advances to a confidently detected next chord', () => {
    const engine = new PracticeEngine(chords)
    const g = chromaFor([2, 7, 11])
    expect(engine.update(g, 0.05, 100, true).advanced).toBe(false)
    expect(engine.update(g, 0.05, 300, true).advanced).toBe(false)
    const result = engine.update(g, 0.05, 800, true)
    expect(result.advanced).toBe(true)
    expect(result.focusIndex).toBe(1)
  })

  it('does not advance without follow permission', () => {
    const engine = new PracticeEngine(chords)
    const g = chromaFor([2, 7, 11])
    for (const time of [100, 300, 600, 900, 1200]) {
      expect(engine.update(g, 0.05, time, false).advanced).toBe(false)
    }
    expect(engine.focus).toBe(0)
  })

  it('does not auto-advance repeated chords', () => {
    const repeated = [
      { displayed: 'C', pitchClasses: [0, 4, 7] },
      { displayed: 'C', pitchClasses: [0, 4, 7] },
    ]
    const engine = new PracticeEngine(repeated)
    const c = chromaFor([0, 4, 7])
    for (const time of [100, 500, 900, 1300]) {
      expect(engine.update(c, 0.05, time, true).advanced).toBe(false)
    }
    expect(engine.focus).toBe(0)
  })

  it('reports mismatch after sustained wrong sound', () => {
    const engine = new PracticeEngine(chords)
    const fSharp = chromaFor([1, 6, 10])
    expect(engine.update(fSharp, 0.05, 0, true).feedback).toBe('listening')
    expect(engine.update(fSharp, 0.05, 400, true).feedback).toBe('listening')
    expect(engine.update(fSharp, 0.05, 900, true).feedback).toBe('mismatch')
  })

  it('goes idle in silence', () => {
    const engine = new PracticeEngine(chords)
    const c = chromaFor([0, 4, 7])
    engine.update(c, 0.05, 0, true)
    expect(engine.update(c, 0, 500, true).feedback).toBe('idle')
  })

  it('advances from E7 to E and back', () => {
    const e = { displayed: 'E', pitchClasses: chordPitchClasses('E') ?? [] }
    const e7 = { displayed: 'E7', pitchClasses: chordPitchClasses('E7') ?? [] }

    const down = new PracticeEngine([e7, e])
    const eChroma = chromaFor([4, 8, 11])
    for (const time of [100, 500, 1000, 1500]) down.update(eChroma, 0.05, time, true)
    expect(down.focus).toBe(1)

    const up = new PracticeEngine([e, e7])
    const e7Chroma = chromaFor([2, 4, 8, 11])
    for (const time of [100, 500, 1000, 1500]) up.update(e7Chroma, 0.05, time, true)
    expect(up.focus).toBe(1)
  })

  it('catches up by two chords when one chord was missed', () => {
    const engine = new PracticeEngine([
      { displayed: 'C', pitchClasses: chordPitchClasses('C') ?? [] },
      { displayed: 'G', pitchClasses: chordPitchClasses('G') ?? [] },
      { displayed: 'Am', pitchClasses: chordPitchClasses('Am') ?? [] },
      { displayed: 'F', pitchClasses: chordPitchClasses('F') ?? [] },
    ])
    const am = chromaFor(chordPitchClasses('Am') ?? [])
    for (const time of [0, 400]) {
      expect(engine.update(am, 0.05, time, true).advanced).toBe(false)
    }
    expect(engine.update(am, 0.05, 900, true).advanced).toBe(true)
    expect(engine.focus).toBe(2)
  })

  it('jumps ahead to a confidently played chord within lookahead', () => {
    const engine = new PracticeEngine([
      { displayed: 'C', pitchClasses: chordPitchClasses('C') ?? [] },
      { displayed: 'G', pitchClasses: chordPitchClasses('G') ?? [] },
      { displayed: 'Am', pitchClasses: chordPitchClasses('Am') ?? [] },
      { displayed: 'F', pitchClasses: chordPitchClasses('F') ?? [] },
    ])
    const f = chromaFor(chordPitchClasses('F') ?? [])
    for (const time of [0, 200]) {
      expect(engine.update(f, 0.05, time, true).advanced).toBe(false)
    }
    expect(engine.update(f, 0.05, 500, true).advanced).toBe(true)
    expect(engine.focus).toBe(3)
  })

  it('advances between chords that share notes', () => {
    for (const next of ['F', 'C']) {
      const engine = new PracticeEngine(
        [
          { displayed: 'Am', pitchClasses: chordPitchClasses('Am') ?? [] },
          { displayed: next, pitchClasses: chordPitchClasses(next) ?? [] },
        ],
        {
          ...FOLLOW_PRESETS.balanced,
          advanceHoldMs: 250,
          minAdvanceIntervalMs: 0,
        },
      )
      const chroma = chromaFor(chordPitchClasses(next) ?? [])
      engine.update(chroma, 0.05, 0, true)
      expect(engine.update(chroma, 0.05, 300, true).focusIndex).toBe(1)
    }
  })

  it('respects the per-song follow sensitivity presets', () => {
    const careful = new PracticeEngine(
      [
        { displayed: 'C', pitchClasses: chordPitchClasses('C') ?? [] },
        { displayed: 'G', pitchClasses: chordPitchClasses('G') ?? [] },
      ],
      FOLLOW_PRESETS.careful,
    )
    const responsive = new PracticeEngine(
      [
        { displayed: 'C', pitchClasses: chordPitchClasses('C') ?? [] },
        { displayed: 'G', pitchClasses: chordPitchClasses('G') ?? [] },
      ],
      FOLLOW_PRESETS.responsive,
    )
    const g = chromaFor(chordPitchClasses('G') ?? [])
    expect(careful.update(g, 0.05, 0, true).advanced).toBe(false)
    expect(careful.update(g, 0.05, 400, true).advanced).toBe(false)
    expect(responsive.update(g, 0.05, 0, true).advanced).toBe(false)
    expect(responsive.update(g, 0.05, 400, true).advanced).toBe(true)
  })
})
