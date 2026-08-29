// Scoped search.
//
// The example chips are the reason this file asserts so hard: they are BUTTONS,
// so a query that matches nothing empties the schedule on click. The inherited
// set shipped "city: Sydney", which matches no venue in Berlin.

import { describe, it, expect } from 'vitest'
import { GAMES, STAGE_LABELS } from '../src/data/games.js'
import { VENUES } from '../src/data/venues.js'
import { matchesSearch, parseQuery } from '../src/utils/search.js'
import { venueFor } from '../src/utils/venue.js'
import { SEARCH_EXAMPLES } from '../src/components/Filters.jsx'

const run = (query) =>
  GAMES.filter((g) => matchesSearch(g, venueFor(g), parseQuery(query)))

const G1 = GAMES[0] // Japan v Mali, Berlin Arena
const V1 = venueFor(G1)

describe('parseQuery', () => {
  it('reads a bare query as free text', () => {
    expect(parseQuery('japan')).toEqual({ free: 'japan', tokens: [] })
    expect(parseQuery('')).toEqual({ free: '', tokens: [] })
    expect(parseQuery(undefined)).toEqual({ free: '', tokens: [] })
  })

  it('splits scoped fields from leading free text', () => {
    expect(parseQuery('berlin team: Japan')).toEqual({
      free: 'berlin',
      tokens: [{ field: 'team', value: 'Japan' }],
    })
  })

  it('reads several scoped fields in one query', () => {
    expect(parseQuery('team: Japan stage: group').tokens).toEqual([
      { field: 'team', value: 'Japan' },
      { field: 'stage', value: 'group' },
    ])
  })

  it('accepts each documented synonym for a field', () => {
    for (const key of ['team', 'teams', 't']) {
      expect(parseQuery(`${key}: Japan`).tokens[0].field).toBe('team')
    }
    for (const key of ['arena', 'stadium', 'venue', 'ground']) {
      expect(parseQuery(`${key}: Berlin`).tokens[0].field).toBe('arena')
    }
    for (const key of ['group', 'grp', 'g']) {
      expect(parseQuery(`${key}: A`).tokens[0].field).toBe('group')
    }
    for (const key of ['stage', 'round']) {
      expect(parseQuery(`${key}: final`).tokens[0].field).toBe('stage')
    }
    for (const key of ['country', 'host']) {
      expect(parseQuery(`${key}: Germany`).tokens[0].field).toBe('country')
    }
  })

  // An unrecognised field must not silently drop the words the user typed.
  it('demotes an unknown field to free text', () => {
    expect(parseQuery('sport: basketball')).toEqual({ free: 'basketball', tokens: [] })
    expect(parseQuery('team: Japan sport: basketball').free).toBe('basketball')
  })

  it('ignores a field with no value', () => {
    expect(parseQuery('team:').tokens).toEqual([])
  })
})

describe('scoped matching', () => {
  it('matches a team on either side', () => {
    expect(run('team: Japan')).toHaveLength(3)
    expect(run('team: Mali').every((g) => g.t1 === 'Mali' || g.t2 === 'Mali')).toBe(true)
    expect(run('team: Narnia')).toHaveLength(0)
  })

  it('matches a group exactly, with or without the word "group"', () => {
    expect(run('group: A')).toHaveLength(6)
    expect(run('group: group a')).toHaveLength(6)
    // Exact, not a substring: there is no group "AB".
    expect(run('group: AB')).toHaveLength(0)
  })

  it('matches the city and the country', () => {
    expect(run('city: Berlin')).toHaveLength(GAMES.length)
    expect(run('country: Germany')).toHaveLength(GAMES.length)
    expect(run('city: Sydney')).toHaveLength(0)
  })

  // Only the Berlin Arena has two names; a viewer who saw the sponsor name on
  // television should still find the game.
  it('matches an arena by FIBA’s name OR ESPN’s sponsor name', () => {
    const byFiba = run('arena: Berlin Arena')
    const bySponsor = run('arena: Uber')
    expect(byFiba.length).toBeGreaterThan(0)
    expect(bySponsor.map((g) => g.num)).toEqual(byFiba.map((g) => g.num))
    expect(run('arena: Max-Schmeling').length).toBeGreaterThan(0)
    expect(run('arena: Wembley')).toHaveLength(0)
  })

  it('matches a stage by code, synonym and label', () => {
    expect(run('stage: final').every((g) => g.stage === 'Final')).toBe(true)
    expect(run('stage: qf')).toHaveLength(4)
    expect(run('stage: quarter-final')).toHaveLength(4)
    expect(run('stage: sf')).toHaveLength(2)
    expect(run('stage: third')).toHaveLength(1)
    expect(run('stage: bronze')).toHaveLength(1)
    expect(run('stage: group')).toHaveLength(24)
    // Falls through to the printed label when the word is not a synonym.
    expect(run('stage: quarter-fin').length).toBeGreaterThan(0)
    expect(run('stage: nonsense')).toHaveLength(0)
  })

  // Every stage this edition plays needs a reachable synonym, or that round
  // cannot be found by a scoped query. The qualification round is the one no
  // football sibling has, and it was missing at first.
  it('reaches every stage in STAGE_ORDER by a synonym', () => {
    const byCode = { Group: 'group', QR: 'qr', QF: 'qf', SF: 'sf', '3rd': 'third', Final: 'final' }
    for (const [code, syn] of Object.entries(byCode)) {
      const hits = run(`stage: ${syn}`)
      expect(hits.length, `stage: ${syn}`).toBeGreaterThan(0)
      expect(hits.every((g) => g.stage === code), `stage: ${syn}`).toBe(true)
    }
    expect(run('stage: qualification')).toHaveLength(4)
  })

  it('combines scoped fields with AND', () => {
    expect(run('team: Japan group: A')).toHaveLength(3)
    expect(run('team: Japan group: B')).toHaveLength(0)
  })
})

describe('free-text matching', () => {
  it('searches teams, arena, city, country, group and stage', () => {
    expect(matchesSearch(G1, V1, parseQuery('japan'))).toBe(true)
    expect(matchesSearch(G1, V1, parseQuery('berlin arena'))).toBe(true)
    expect(matchesSearch(G1, V1, parseQuery('germany'))).toBe(true)
    expect(matchesSearch(G1, V1, parseQuery('group a'))).toBe(true)
    expect(matchesSearch(G1, V1, parseQuery('group phase'))).toBe(true)
    expect(matchesSearch(G1, V1, parseQuery('uber'))).toBe(true) // sponsor name
    expect(matchesSearch(G1, V1, parseQuery('australia'))).toBe(false)
  })

  // A final-phase game has null teams, so the haystack has to fall back to the
  // slot labels or every free-text query would throw or silently miss them.
  it('searches a final-phase game by its slot label', () => {
    const qr = GAMES.find((g) => g.num === 25)
    expect(matchesSearch(qr, venueFor(qr), parseQuery('2nd group a'))).toBe(true)
    expect(matchesSearch(qr, venueFor(qr), parseQuery('qualification'))).toBe(true)
  })

  it('matches everything for an empty query', () => {
    expect(run('')).toHaveLength(GAMES.length)
  })
})

describe('the example chips', () => {
  // These are buttons. Each must return at least one game, or clicking it blanks
  // the schedule.
  it('every example returns games', () => {
    expect(SEARCH_EXAMPLES.length).toBeGreaterThan(0)
    for (const q of SEARCH_EXAMPLES) {
      expect(run(q).length, q).toBeGreaterThan(0)
    }
  })

  it('names no city or arena this edition does not use', () => {
    const arenas = Object.values(VENUES).flatMap((v) => [v.name, v.sponsorName])
    for (const q of SEARCH_EXAMPLES) {
      const hit = /^(city|arena|stadium|venue):\s*(.+)$/i.exec(q)
      if (!hit) continue
      const value = hit[2].toLowerCase()
      const known = ['berlin', ...arenas.map((a) => (a || '').toLowerCase())]
      expect(known.some((k) => k.includes(value)), q).toBe(true)
    }
  })

  it('names only stages this edition plays', () => {
    for (const q of SEARCH_EXAMPLES) {
      const hit = /^stage:\s*(.+)$/i.exec(q)
      if (!hit) continue
      expect(Object.values(STAGE_LABELS).length).toBeGreaterThan(0)
      expect(run(q).length, q).toBeGreaterThan(0)
    }
  })
})
