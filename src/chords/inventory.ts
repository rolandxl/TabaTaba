import { chordPitchClasses } from '../audio/chord-math'
import type { Song } from '../types'
import { parseSong } from './detect'
import {
  inferAccidentalPreference,
  transposeChord,
  transposeLines,
} from './transpose'

export interface ChordSongUsage {
  id: string
  title: string
  artist: string
}

export interface LibraryChord {
  sounding: string
  displayed: string
  variants: string[]
  pitchClasses: number[]
  profile?: number[]
  songs: ChordSongUsage[]
  occurrences: number
}

export function collectLibraryChords(
  songs: readonly Song[],
  profiles: Record<string, number[]> = {},
): LibraryChord[] {
  const unique = new Map<string, LibraryChord>()

  for (const song of songs) {
    const preference = inferAccidentalPreference(song.key, song.content)
    const lines = transposeLines(parseSong(song.content), song.transpose, preference)
    const seenInSong = new Set<string>()

    for (const line of lines) {
      for (const chord of line.chords ?? []) {
        const displayed = chord.text
        const sounding = transposeChord(displayed, song.capo, preference)
        const pitchClasses = chordPitchClasses(sounding)
        if (!pitchClasses) continue

        let entry = unique.get(sounding)
        if (!entry) {
          entry = {
            sounding,
            displayed,
            variants: [],
            pitchClasses,
            profile: profiles[sounding],
            songs: [],
            occurrences: 0,
          }
          unique.set(sounding, entry)
        }

        entry.occurrences += 1
        if (!entry.variants.includes(displayed)) entry.variants.push(displayed)

        if (!seenInSong.has(sounding)) {
          seenInSong.add(sounding)
          entry.songs.push({
            id: song.id,
            title: song.title,
            artist: song.artist,
          })
        }
      }
    }
  }

  return [...unique.values()]
}

export function collectSongChords(
  song: Song,
  profiles: Record<string, number[]> = {},
): LibraryChord[] {
  return collectLibraryChords([song], profiles)
}

export function missingChordProfiles(
  song: Song,
  profiles: Record<string, number[]> = {},
): LibraryChord[] {
  return collectSongChords(song, profiles).filter((chord) => !chord.profile)
}
