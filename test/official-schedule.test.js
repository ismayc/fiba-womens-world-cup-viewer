// The committed schedule against its two upstream sources.
//
// src/data/games.js is GENERATED, so on its own it can only ever agree with
// itself. These tests re-derive it from the two inputs the builder used and
// check the MERGE: the step that can actually go wrong:
//
//   * scripts/official.mjs — FIBA's published sheet, the authority for structure
//     and tip-off times.
//   * test/fixtures/espn-scoreboard.json — a frozen capture of ESPN's feed, the
//     source of event ids, arenas and (later) scores.
//
// Freezing the ESPN side matters: without it this test would go to the network,
// and it would start failing for reasons that have nothing to do with this repo
// the moment ESPN edits a record.

import { describe, it, expect } from 'vitest'
import { GAMES } from '../src/data/games.js'
import {
  EDITION,
  GROUPS,
  KNOWN_ESPN_TIME_BUGS,
  OFFICIAL,
  TIP_WINDOWS,
} from '../scripts/official.mjs'
import espnFeed from './fixtures/espn-scoreboard.json'
import espnNames from './fixtures/espn-team-names.json'

const byNum = new Map(GAMES.map((g) => [g.num, g]))

describe('committed schedule vs FIBA’s sheet', () => {
  it('matches the edition’s headline numbers', () => {
    expect(GAMES).toHaveLength(EDITION.games)
    expect(Object.keys(GROUPS)).toEqual(EDITION.groups)
  })

  it('keeps FIBA’s teams, group and tip-off for every group game', () => {
    for (const o of OFFICIAL.filter((g) => g.stage === 'Group')) {
      const g = byNum.get(o.num)
      expect(g.t1).toBe(o.t1)
      expect(g.t2).toBe(o.t2)
      expect(g.group).toBe(o.group)
      expect(g.ko).toBe(o.ko)
    }
  })

  it('keeps FIBA’s bracket wiring for every final-phase game', () => {
    for (const o of OFFICIAL.filter((g) => g.stage !== 'Group')) {
      const g = byNum.get(o.num)
      expect(g.stage).toBe(o.stage)
      expect(g.label1).toBe(o.label1)
      expect(g.label2).toBe(o.label2)
    }
  })

  it('leaves a TBC tip inside the window FIBA printed for that round', () => {
    for (const g of GAMES.filter((x) => x.tbdTip)) {
      expect(TIP_WINDOWS[g.stage]).toBeTruthy()
      expect(TIP_WINDOWS[g.stage].length).toBe(2)
    }
  })
})

describe('committed schedule vs ESPN’s feed', () => {
  const events = espnFeed.events
  const feedByPair = new Map()
  for (const e of events) {
    const c = e.competitions[0]
    const names = c.competitors.map((x) => x.team.displayName).sort().join('|')
    feedByPair.set(names, { event: e, comp: c })
  }

  it('found an ESPN event for all 24 group games', () => {
    expect(events).toHaveLength(24)
    for (const g of GAMES.filter((x) => x.stage === 'Group')) {
      expect(feedByPair.has([g.t1, g.t2].sort().join('|'))).toBe(true)
      expect(g.espnId).toBeTruthy()
    }
  })

  it('carries the ESPN event id ESPN actually filed the game under', () => {
    for (const g of GAMES.filter((x) => x.stage === 'Group')) {
      const hit = feedByPair.get([g.t1, g.t2].sort().join('|'))
      expect(g.espnId).toBe(hit.event.id)
    }
  })

  it('takes the arena from ESPN’s venue id', () => {
    const KEY = { 12017: 'maxschmeling', 11593: 'berlinarena' }
    for (const g of GAMES.filter((x) => x.stage === 'Group')) {
      const hit = feedByPair.get([g.t1, g.t2].sort().join('|'))
      expect(g.venue).toBe(KEY[hit.comp.venue.id])
    }
  })

  // The whole reason official.mjs exists. ESPN and FIBA disagree about exactly
  // one tip-off, and the app must ship FIBA's. If ESPN ever corrects the record
  // this test fails and KNOWN_ESPN_TIME_BUGS should be pruned: a failure here
  // is a prompt to re-check, not a bug in the app.
  it('ships FIBA’s time on the one game ESPN files two hours early', () => {
    expect(KNOWN_ESPN_TIME_BUGS).toHaveLength(1)
    const bug = KNOWN_ESPN_TIME_BUGS[0]
    const game = GAMES.find((g) => g.espnId === bug.espnId)
    expect([game.t1, game.t2].sort()).toEqual([...bug.pair].sort())
    expect(game.ko).toBe(bug.fibaKo)
    expect(game.ko).not.toBe(bug.espnKo)

    const feedEvent = events.find((e) => e.id === bug.espnId)
    const feedBerlin = new Date(
      new Date(feedEvent.date).getTime() + 2 * 3600 * 1000,
    ).toISOString()
    // ESPN really is two hours earlier than what we ship.
    expect(new Date(bug.espnKo).getTime()).toBe(new Date(feedEvent.date).getTime())
    expect(new Date(game.ko).getTime() - new Date(feedEvent.date).getTime()).toBe(2 * 3600 * 1000)
    expect(feedBerlin.slice(11, 16)).toBe('12:30')
  })

  it('agrees with ESPN on every OTHER group tip-off', () => {
    const buggy = new Set(KNOWN_ESPN_TIME_BUGS.map((b) => b.espnId))
    for (const g of GAMES.filter((x) => x.stage === 'Group')) {
      if (buggy.has(g.espnId)) continue
      const hit = feedByPair.get([g.t1, g.t2].sort().join('|'))
      expect(new Date(g.ko).getTime()).toBe(new Date(hit.event.date).getTime())
    }
  })
})

describe('team-name resolution', () => {
  // An alias that never appears in the feed is dead weight that can silently
  // rewrite a correct name; an unmapped divergence silently drops a game. Both
  // fail quietly, so the captured names are the check.
  it('names all 16 teams exactly as the app does, needing no aliases', async () => {
    const { ESPN_ALIASES } = await import('../src/services/espn.js')
    const { ALL_TEAMS } = await import('../src/data/teams.js')
    expect(espnNames).toHaveLength(16)
    expect([...espnNames].sort()).toEqual([...ALL_TEAMS].sort())
    for (const key of Object.keys(ESPN_ALIASES)) {
      expect(espnNames).toContain(key)
    }
  })
})
