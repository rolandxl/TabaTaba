export function shuffle<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const result = items.slice()
  for (let index = result.length - 1; index > 0; index--) {
    const swapIndex = Math.min(index, Math.floor(rng() * (index + 1)))
    const current = result[index]
    result[index] = result[swapIndex]
    result[swapIndex] = current
  }
  return result
}

export function pickRandom<T>(
  items: readonly T[],
  count: number,
  rng: () => number = Math.random,
): T[] {
  const limit = Math.max(0, Math.min(items.length, Math.floor(count)))
  if (limit === 0) return []
  return shuffle(items, rng).slice(0, limit)
}
