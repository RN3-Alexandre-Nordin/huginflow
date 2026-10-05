const CODE39: Record<string, string> = {
  '0': 'nnnwwnwnn',
  '1': 'wnnwnnnnw',
  '2': 'nnwwnnnnw',
  '3': 'wnwwnnnnn',
  '4': 'nnnwwnnnw',
  '5': 'wnnwwnnnn',
  '6': 'nnwwwnnnn',
  '7': 'nnnwnnwnw',
  '8': 'wnnwnnwnn',
  '9': 'nnwwnnwnn',
  A: 'wnnnnwnnw',
  B: 'nnwnnwnnw',
  C: 'wnwnnwnnn',
  D: 'nnnnwwnnw',
  E: 'wnnnwwnnn',
  F: 'nnwnwwnnn',
  G: 'nnnnnwwnw',
  H: 'wnnnnwwnn',
  I: 'nnwnnwwnn',
  J: 'nnnnwwwnn',
  K: 'wnnnnnnww',
  L: 'nnwnnnnww',
  M: 'wnwnnnnwn',
  N: 'nnnwnnnww',
  O: 'wnnwnnnwn',
  P: 'nnwwnnnwn',
  Q: 'nnnnnwnww',
  R: 'wnnnnwnwn',
  S: 'nnwnnwnwn',
  T: 'nnnnwwnwn',
  U: 'wwnnnnnnw',
  V: 'nwwnnnnnw',
  W: 'wwwnnnnnn',
  X: 'nwnnwnnnw',
  Y: 'wwnnwnnnn',
  Z: 'nwwnwnnnn',
  '-': 'nwnnnnwnw',
  '.': 'wwnnnnwnn',
  ' ': 'nwwnnnwnn',
  '*': 'nwnnwnwnn',
}

/** Barras Code 39. O código da caixa não é um EAN. */
export function code39Bars(value: string): Array<{ x: number; w: number }> | null {
  const text = `*${value.toUpperCase()}*`
  if ([...text].some((ch) => !CODE39[ch])) return null
  const narrow = 1
  const wide = 3
  const bars: Array<{ x: number; w: number }> = []
  let x = 0
  for (let i = 0; i < text.length; i += 1) {
    const pattern = CODE39[text[i]]
    for (let b = 0; b < pattern.length; b += 1) {
      const w = pattern[b] === 'w' ? wide : narrow
      if (b % 2 === 0) bars.push({ x, w })
      x += w
    }
    x += narrow
  }
  return bars
}
