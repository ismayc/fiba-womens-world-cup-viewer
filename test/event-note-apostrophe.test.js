import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'

// ESPN files this competition's group headlines with a straight apostrophe (U+0027)
// and every final-phase headline with a curly one (U+2019): "FIBA Women's World Cup -
// Group C" but "FIBA Women’s World Cup - Qualification to Quarterfinals". The scoreboard
// filter matched only the straight form, so it silently dropped all twelve knockout
// games and the bracket showed no scores from the group stage on (found live on the
// final day, 2026-09-13). This keeps the filter accepting both apostrophes.
describe('the ESPN scoreboard headline filter (EVENT_NOTE)', () => {
  const src = readFileSync(
    join(import.meta.dirname, '..', 'scripts', 'fetch-tournament.mjs'),
    'utf8',
  )
  const literal = src.match(/const EVENT_NOTE = (\/.*\/)\s*$/m)?.[1]

  it('is still a single-line regex literal', () => {
    // If this fails the regex was reformatted; update the extraction below to match.
    expect(literal, 'EVENT_NOTE is no longer a one-line regex literal').toBeTruthy()
  })

  it('accepts both the straight and the curly apostrophe', () => {
    const re = new RegExp(literal.slice(1, -1))
    expect(re.test("FIBA Women's World Cup - Group C")).toBe(true)
    expect(re.test('FIBA Women’s World Cup - Qualification to Quarterfinals')).toBe(true)
  })
})
