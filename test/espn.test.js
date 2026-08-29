// The ESPN live overlay.
//
// The committed schedule is the source of record; this layer only adds what a
// live feed can know. The tests that matter are about what it must NOT do:
// overwrite a committed score, rewrite teams on a game it matched by id, or
// treat a live score as final.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GAMES } from '../src/data/games.js'
import {
  ESPN_ALIASES,
  LIVE_SOURCE,
  applyLive,
  fetchLive,
  historyDates,
  liveRecordFor,
  overtimeFrom,
  periodLabel,
  scoreboardDates,
  REGULATION_PERIODS,
} from '../src/services/espn.js'
import { espnScoreboard } from './helpers/tournament.js'

const num = (games, n) => games.find((g) => g.num === n)

function mockFeed(payload) {
  global.fetch = vi.fn(async () => ({ ok: true, json: async () => payload }))
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('configuration', () => {
  // site.api 403s from datacenter IPs while site.web.api serves the same routes,
  // which is what breaks CI. The whole family standardized on site.web.api.
  it('points at site.web.api and the FIBA league', () => {
    expect(LIVE_SOURCE.url).toContain('site.web.api.espn.com')
    expect(LIVE_SOURCE.url).toContain('basketball/fiba')
    expect(LIVE_SOURCE.url).not.toContain('site.api.espn.com/')
  })

  it('needs no team-name aliases for this edition', () => {
    expect(ESPN_ALIASES).toEqual({})
  })
})

describe('period arithmetic', () => {
  // FIBA plays four 10-minute quarters, so overtime starts at period 5. College
  // basketball is two halves and would need `period > 2`; getting this wrong
  // labels a regulation fourth quarter as overtime.
  it('treats anything past the 4th period as overtime', () => {
    expect(REGULATION_PERIODS).toBe(4)
    expect(overtimeFrom(4)).toBe(0)
    expect(overtimeFrom(5)).toBe(1)
    expect(overtimeFrom(7)).toBe(3)
    expect(overtimeFrom(0)).toBe(0)
    expect(overtimeFrom(undefined)).toBe(0)
  })

  it('labels the period the way a scoreboard would', () => {
    expect(periodLabel(0, 'pre')).toBe('')
    expect(periodLabel(3, 'in')).toBe('Q3')
    expect(periodLabel(5, 'in')).toBe('OT')
    expect(periodLabel(6, 'in')).toBe('2OT')
    expect(periodLabel(2, 'in', 'End of the 2nd Half')).toBe('Half')
    expect(periodLabel(4, 'post')).toBe('Final')
    expect(periodLabel(0, 'in')).toBe('')
  })
})

describe('date windows', () => {
  it('asks for yesterday, today and tomorrow', () => {
    const dates = scoreboardDates(new Date('2026-09-06T12:00:00Z'))
    expect(dates).toEqual(['20260905', '20260906', '20260907'])
  })

  // ESPN buckets a dates= query by the US-EASTERN day. A Berlin morning tip
  // (09:30Z) is still the previous evening in New York, so a UTC-derived day
  // asks for a slate that does not contain the game.
  it('backfills a past game under ESPN’s Eastern day, not the UTC day', () => {
    const g = num(GAMES, 1) // 2026-09-04 11:30 +02:00 = 09:30Z
    const dates = historyDates([g], new Date('2026-09-10T12:00:00Z'))
    expect(dates).toEqual(['20260904'])
  })

  it('skips games that have not tipped off, and those inside the live window', () => {
    expect(historyDates(GAMES, new Date('2026-09-01T12:00:00Z'))).toEqual([])
    const g = num(GAMES, 1)
    // Inside the +/-1 day live window, so the backfill leaves it alone.
    expect(historyDates([g], new Date('2026-09-04T20:00:00Z'))).toEqual([])
  })

  it('ignores a game with no tip-off time', () => {
    expect(historyDates([num(GAMES, 25)], new Date('2026-09-20T12:00:00Z'))).toEqual([])
  })
})

describe('fetchLive', () => {
  it('indexes each game by id, team pair and instant', async () => {
    mockFeed(espnScoreboard([num(GAMES, 1)], { 1: { state: 'post', score: [88, 61] } }))
    const map = await fetchLive()
    expect(map.get('id:' + num(GAMES, 1).espnId)).toBeTruthy()
    expect(map.get('pair:Japan|Mali')).toBeTruthy()
    expect(map.get('inst:' + new Date(num(GAMES, 1).ko).getTime())).toBeTruthy()
  })

  it('throws when no scoreboard date can be reached', async () => {
    global.fetch = vi.fn(async () => ({ ok: false }))
    await expect(fetchLive()).rejects.toThrow(/Live request failed/)
  })

  it('returns nothing when asked for no dates', async () => {
    expect((await fetchLive(undefined, [])).size).toBe(0)
  })

  it('dedupes the same game across adjacent date queries', async () => {
    const payload = espnScoreboard([num(GAMES, 1)])
    mockFeed(payload)
    const map = await fetchLive(undefined, ['20260903', '20260904'])
    // Three keys for one game, not six.
    expect(map.size).toBe(3)
  })
})

describe('applyLive', () => {
  const g1 = num(GAMES, 1)

  it('does nothing without a feed', () => {
    expect(applyLive(GAMES, null)).toBe(GAMES)
    expect(applyLive(GAMES, new Map())).toBe(GAMES)
  })

  it('overlays a final score onto an unplayed game', async () => {
    mockFeed(espnScoreboard([g1], { 1: { state: 'post', score: [88, 61] } }))
    const out = applyLive(GAMES, await fetchLive())
    expect(num(out, 1).score).toEqual([88, 61])
    expect(num(out, 1).liveSource).toBe(true)
  })

  it('marks a game in progress as live, with period and clock', async () => {
    mockFeed(
      espnScoreboard([g1], {
        1: { state: 'in', score: [40, 38], period: 2, clock: '4:12' },
      }),
    )
    const out = applyLive(GAMES, await fetchLive())
    expect(num(out, 1).live).toMatchObject({ clock: '4:12', period: 'Q2' })
    expect(num(out, 1).score).toEqual([40, 38])
  })

  it('records overtime periods on a finished game', async () => {
    mockFeed(espnScoreboard([g1], { 1: { state: 'post', score: [95, 92], period: 6 } }))
    const out = applyLive(GAMES, await fetchLive())
    expect(num(out, 1).ot).toBe(2)
  })

  // The committed schedule wins. Once the refresh job has generated a score, a
  // later feed edit must not silently rewrite history in the browser.
  it('never overwrites a committed score', async () => {
    const committed = GAMES.map((g) => (g.num === 1 ? { ...g, score: [88, 61] } : g))
    mockFeed(espnScoreboard([g1], { 1: { state: 'post', score: [10, 99] } }))
    const out = applyLive(committed, await fetchLive())
    expect(num(out, 1).score).toEqual([88, 61])
  })

  it('flips the scoreline when ESPN’s home/away is the other way round', async () => {
    const feed = espnScoreboard([g1], { 1: { state: 'post', score: [88, 61] } })
    // Swap the sides so ESPN's home is our t1.
    feed.events[0].competitions[0].competitors = [
      { homeAway: 'home', score: '88', team: { id: '1', displayName: 'Japan' } },
      { homeAway: 'away', score: '61', team: { id: '2', displayName: 'Mali' } },
    ]
    mockFeed(feed)
    const out = applyLive(GAMES, await fetchLive())
    // t1 is Japan, so Japan's 88 must stay first.
    expect(num(out, 1).score).toEqual([88, 61])
  })

  it('voids an abandoned game so the standings ignore it', async () => {
    mockFeed(
      espnScoreboard([g1], {
        1: { state: 'post', score: [40, 38], statusName: 'STATUS_POSTPONED' },
      }),
    )
    const out = applyLive(GAMES, await fetchLive())
    expect(num(out, 1).voided).toBe(true)
    expect(num(out, 1).statusLabel).toBe('Postponed')
  })

  it('treats an ESPN "Delayed" at the scheduled hour as not yet tipped off', async () => {
    mockFeed(
      espnScoreboard([g1], {
        1: { state: 'in', score: [0, 0], statusName: 'STATUS_DELAYED' },
      }),
    )
    const map = await fetchLive()
    const out = applyLive(GAMES, map, new Date(g1.ko).getTime() + 60_000)
    expect(num(out, 1).live).toBeUndefined()
    // Outside the grace window a real delay shows normally.
    const later = applyLive(GAMES, map, new Date(g1.ko).getTime() + 30 * 60_000)
    expect(num(later, 1).live?.delayed).toBe(true)
  })
})

describe('matching a game to its feed record', () => {
  it('prefers the ESPN event id over anything else', async () => {
    mockFeed(espnScoreboard([num(GAMES, 1)], { 1: { state: 'post', score: [88, 61] } }))
    const map = await fetchLive()
    const rec = liveRecordFor(num(GAMES, 1), map)
    expect(rec.id).toBe(num(GAMES, 1).espnId)
  })

  // Matching by id means a disagreement between our teams and ESPN's is a
  // committed-data bug to fix in the schedule, not something the overlay should
  // paper over by rewriting the matchup.
  it('does not rewrite the teams of a game matched by id', async () => {
    const feed = espnScoreboard([num(GAMES, 1)], { 1: { state: 'post', score: [88, 61] } })
    feed.events[0].competitions[0].competitors[0].team.displayName = 'Spain'
    mockFeed(feed)
    const out = applyLive(GAMES, await fetchLive())
    expect(num(out, 1).t1).toBe('Japan')
    expect(num(out, 1).t2).toBe('Mali')
  })

  // This is the legitimate path for adopting ESPN's teams: a bracket slot we are
  // still holding as a placeholder.
  it('adopts ESPN’s teams for an unresolved final-phase slot, matched by instant', async () => {
    const qr = { ...num(GAMES, 25), ko: '2026-09-08T17:45:00+02:00', espnId: null }
    const board = GAMES.map((g) => (g.num === 25 ? qr : g))
    const feed = espnScoreboard([{ ...qr, t1: 'Spain', t2: 'Nigeria', espnId: '999' }], {
      25: { state: 'post', score: [80, 70] },
    })
    mockFeed(feed)
    const out = applyLive(board, await fetchLive())
    expect(num(out, 25).t1).toBe('Spain')
    expect(num(out, 25).t2).toBe('Nigeria')
    expect(num(out, 25).score).toEqual([80, 70])
    expect(num(out, 25).espnId).toBe('999')
  })

  it('pins down a TBC tip-off once ESPN publishes the fixture', async () => {
    const qr = { ...num(GAMES, 25), ko: '2026-09-08T17:45:00+02:00', espnId: null }
    const board = GAMES.map((g) => (g.num === 25 ? qr : g))
    const feed = espnScoreboard([{ ...qr, t1: 'Spain', t2: 'Nigeria', espnId: '999' }])
    mockFeed(feed)
    const out = applyLive(board, await fetchLive())
    expect(num(out, 25).tbdTip).toBe(false)
    expect(new Date(num(out, 25).ko).getTime()).toBe(new Date(qr.ko).getTime())
  })

  it('matches nothing for a game with no id, no real teams and no time', () => {
    expect(liveRecordFor(num(GAMES, 25), new Map())).toBeNull()
  })
})
