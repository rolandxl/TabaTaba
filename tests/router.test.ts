import { describe, expect, it } from 'vitest'
import { parseRoute } from '../src/router'

describe('routes', () => {
  it('parses settings screens', () => {
    expect(parseRoute('#/settings')).toEqual({ name: 'settings' })
    expect(parseRoute('#/settings/calibration')).toEqual({ name: 'calibration' })
    expect(parseRoute('#/settings/calibration/song/song-1')).toEqual({
      name: 'calibration',
      songId: 'song-1',
    })
    expect(parseRoute('#/settings/diagnostics')).toEqual({ name: 'diagnostics' })
  })

  it('keeps the legacy calibration route working', () => {
    expect(parseRoute('#/songs/song-1/calibrate')).toEqual({
      name: 'calibration',
      songId: 'song-1',
    })
  })

  it('falls back to the library for unknown routes', () => {
    expect(parseRoute('#/unknown/path')).toEqual({ name: 'library' })
  })
})
