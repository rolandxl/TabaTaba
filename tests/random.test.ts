import { describe, expect, it } from 'vitest'
import { pickRandom, shuffle } from '../src/random'

describe('random set helpers', () => {
  it('shuffles without mutating the source and keeps all items', () => {
    const items = [1, 2, 3, 4, 5]
    const result = shuffle(items, () => 0)
    expect(items).toEqual([1, 2, 3, 4, 5])
    expect(result).not.toBe(items)
    expect([...result].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5])
  })

  it('picks unique items within the requested count', () => {
    const items = ['a', 'b', 'c', 'd']
    const picked = pickRandom(items, 3, () => 0.3)
    expect(picked).toHaveLength(3)
    expect(new Set(picked).size).toBe(3)
    expect(picked.every((item) => items.includes(item))).toBe(true)
  })

  it('clamps the count', () => {
    const items = ['a', 'b', 'c']
    expect(pickRandom(items, 99)).toHaveLength(3)
    expect(pickRandom(items, -1)).toEqual([])
    expect(pickRandom(items, 0)).toEqual([])
  })
})
