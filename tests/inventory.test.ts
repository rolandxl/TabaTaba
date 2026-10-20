import { describe, expect, it } from 'vitest'
import {
  collectLibraryChords,
  collectSongChords,
  missingChordProfiles,
} from '../src/chords/inventory'
import type { Song } from '../src/types'

function song(patch: Partial<Song> & Pick<Song, 'id' | 'title' | 'content'>): Song {
  return {
    artist: '',
    tags: [],
    key: '',
    capo: 0,
    transpose: 0,
    favorite: false,
    createdAt: 0,
    updatedAt: 0,
    ...patch,
  }
}

const profile = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]

describe('chord inventory', () => {
  it('applies transpose and capo to sounding chords', () => {
    const chords = collectSongChords(
      song({
        id: 'a',
        title: 'A',
        key: 'C',
        capo: 2,
        content: 'C\nТекст',
      }),
    )
    expect(chords).toHaveLength(1)
    expect(chords[0]).toMatchObject({
      displayed: 'C',
      sounding: 'D',
      occurrences: 1,
    })
    expect(chords[0].variants).toEqual(['C'])
  })

  it('groups the same sounding chord across songs', () => {
    const songs = [
      song({ id: 'a', title: 'A', content: 'Am\nТекст' }),
      song({ id: 'b', title: 'B', content: 'Am  Am\nТекст' }),
    ]
    const chords = collectLibraryChords(songs)
    expect(chords).toHaveLength(1)
    expect(chords[0].sounding).toBe('Am')
    expect(chords[0].occurrences).toBe(3)
    expect(chords[0].songs.map((item) => item.id)).toEqual(['a', 'b'])
  })

  it('finds chords without profiles for a song', () => {
    const item = song({ id: 'a', title: 'A', content: 'Am C\nТекст' })
    const missing = missingChordProfiles(item, { Am: profile })
    expect(missing.map((chord) => chord.sounding)).toEqual(['C'])
    expect(collectLibraryChords([item], { Am: profile })[0].profile).toEqual(profile)
  })

  it('keeps enharmonic spelling separate', () => {
    const chords = collectLibraryChords([
      song({ id: 'a', title: 'A', key: 'C#', content: 'C#\nТекст' }),
      song({ id: 'b', title: 'B', key: 'Db', content: 'Db\nТекст' }),
    ])
    expect(chords.map((chord) => chord.sounding)).toEqual(['C#', 'Db'])
  })
})
